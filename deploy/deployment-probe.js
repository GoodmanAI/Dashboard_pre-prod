#!/usr/bin/env node
/**
 * deployment-probe — sonde de dérive de déploiement.
 *
 * Tourne en cron sur chaque VM (toutes les 15 min) et remonte au Dashboard, pour
 * chaque repo hébergé, de quoi répondre à « ce qui tourne est-il ce qui est poussé ? ».
 *
 * Trois états sont distingués côté Dashboard, à partir de ce qu'on envoie ici :
 *   - commits poussés mais pas pull  → behindCount > 0
 *   - pull fait mais pas de restart  → pm2.startedAt antérieur à headUpdatedAt
 *   - à jour                          → les deux coïncident
 *
 * Le 2e cas est le seul que `git status` ne voit pas : le disque est propre, l'ancien
 * code tourne toujours en mémoire. C'est la raison d'être de cette sonde.
 *
 * Aucune dépendance : child_process + https natifs. Ce fichier est volontairement
 * identique dans les trois repos déployés (lyraetalk, ai2xplore, dashboard) pour
 * arriver sur chaque VM par le `git pull` normal, sans étape d'installation.
 *
 * Config (env, ou .env du repo courant lu à la main) :
 *   DEPLOY_PROBE_URL       URL du Dashboard, ex. https://dashboard.neuracorp.ai/api/deployments
 *   DEPLOY_PROBE_API_KEY   clé partagée, header x-api-key
 *   DEPLOY_PROBE_REPOS     CSV de chemins de repos à sonder, ex. /srv/lyraetalk,/srv/ai2xplore
 *                          (défaut : le repo qui contient ce script)
 *
 * Usage :
 *   node deploy/deployment-probe.js --dry-run   # affiche le payload, n'envoie rien
 *   node deploy/deployment-probe.js
 */

const { execFileSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const DRY_RUN = process.argv.includes('--dry-run');

// Le repo qui contient ce script : deploy/deployment-probe.js -> racine du repo.
const SELF_REPO = path.resolve(__dirname, '..');

// .env du repo courant, si présent — évite d'avoir à exporter les variables dans le
// crontab. Parsing minimal (KEY=VALUE), on ne remplace jamais une variable déjà définie.
function loadDotEnv(repoPath) {
  const file = path.join(repoPath, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const val = m[2].replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}
loadDotEnv(SELF_REPO);

const PROBE_URL = process.env.DEPLOY_PROBE_URL;
const API_KEY = process.env.DEPLOY_PROBE_API_KEY;
const REPOS = (process.env.DEPLOY_PROBE_REPOS || SELF_REPO)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// git ne doit jamais demander de credentials en cron : il bloquerait le process.
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '' };

function git(repoPath, args, { timeout = 20000 } = {}) {
  return execFileSync('git', ['-C', repoPath, ...args], {
    encoding: 'utf8',
    timeout,
    env: GIT_ENV,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

// Variante tolérante : renvoie null au lieu de lever. Utilisée pour tout ce qui est
// optionnel (une branche sans upstream, un fetch hors ligne...).
function gitSafe(repoPath, args, opts) {
  try {
    return git(repoPath, args, opts);
  } catch {
    return null;
  }
}

/**
 * Date de la dernière mise à jour de HEAD (pull, checkout, merge), lue dans le reflog.
 *
 * C'est elle — et non la date du commit — qui dit quand le CODE SUR DISQUE a changé.
 * Déployer aujourd'hui un commit vieux de dix jours met le disque à jour aujourd'hui :
 * comparer le démarrage PM2 à la date du commit conclurait à tort « déjà à jour ».
 *
 * Le reflog peut être absent (clone --depth, expiration) : on renvoie null et le
 * Dashboard retombe sur headCommittedAt.
 */
function headUpdatedAt(repoPath) {
  const raw = gitSafe(repoPath, ['log', '-g', '-1', '--date=iso-strict', '--format=%gd', 'HEAD']);
  const m = raw && raw.match(/\{(.+)\}/);
  return m ? m[1] : null;
}

/**
 * Fichiers dont la modification n'affecte PAS un process déjà démarré.
 *
 * Sert à distinguer « le disque a changé » de « il faut redémarrer ». Un pull qui
 * n'apporte que de la documentation faisait sinon clignoter la supervision en orange
 * — et une alerte qui crie pour rien finit par être ignorée le jour où elle a raison.
 *
 * deploy/ en fait partie : ce sont des scripts d'exploitation lancés par cron, relus
 * à chaque exécution, jamais chargés par le process applicatif.
 *
 * En cas de doute, un fichier est considéré comme runtime : rater un vrai besoin de
 * restart coûte plus cher qu'une alerte de trop.
 */
const NON_RUNTIME = [
  /\.md$/i,
  /^\.claude\//,
  /^\.github\//,
  /^\.gitignore$/,
  /^\.gitattributes$/,
  /^LICENSE/i,
  /^deploy\//,
  /^docs?\//,
];

/** Date de l'entrée de reflog la plus ancienne — au-delà, on ne sait plus rien. */
function oldestReflogDate(repoPath) {
  const raw = gitSafe(repoPath, ['log', '-g', '--reverse', '--date=iso-strict', '--format=%gd', 'HEAD']);
  const m = raw && raw.split('\n')[0].match(/\{(.+)\}/);
  return m ? m[1] : null;
}

/**
 * Le code EXÉCUTABLE a-t-il changé depuis que le process a démarré ?
 *
 * On récupère le HEAD tel qu'il était à l'instant du démarrage (`HEAD@{date}`, résolu
 * par le reflog), puis on regarde si le diff avec HEAD touche autre chose que de la
 * doc et des scripts d'exploitation.
 *
 * Renvoie true / false / null (indéterminable). null quand le reflog ne remonte pas
 * assez loin : git renverrait alors sa plus ancienne entrée avec un simple warning,
 * ce qui produirait un diff énorme et un verdict inventé. Mieux vaut dire « je ne
 * sais pas » et laisser le Dashboard retomber sur la comparaison de dates.
 */
function runtimeChangedSinceStart(repoPath, startedAtIso) {
  if (!startedAtIso) return null;

  const oldest = oldestReflogDate(repoPath);
  if (!oldest || new Date(startedAtIso).getTime() < new Date(oldest).getTime()) return null;

  const shaAtStart = gitSafe(repoPath, ['rev-parse', `HEAD@{${startedAtIso}}`]);
  if (!shaAtStart) return null;

  const out = gitSafe(repoPath, ['diff', '--name-only', shaAtStart, 'HEAD']);
  if (out === null) return null;

  const files = out.split('\n').filter(Boolean);
  if (!files.length) return false;
  return files.some((f) => !NON_RUNTIME.some((re) => re.test(f)));
}

/** État PM2 de la VM, indexé par répertoire de travail du process. */
function readPm2() {
  let raw;
  try {
    raw = execFileSync('pm2', ['jlist'], {
      encoding: 'utf8',
      timeout: 20000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return []; // pm2 absent (ex. VM daily-report, qui n'a que des crons)
  }
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Rapproche un repo de son process PM2 par le répertoire de travail, pas par le nom :
 * les noms de process ne suivent pas ceux des services (ai2xplore tourne sous « index »).
 * En cas d'égalité on retient le process démarré le plus tôt — c'est lui qui porte le
 * code le plus ancien, donc le retard réel.
 */
function findPm2Process(pm2List, repoPath) {
  const target = path.resolve(repoPath);
  const matches = pm2List.filter((p) => {
    const cwd = p?.pm2_env?.pm_cwd || p?.pm2_env?.cwd;
    if (!cwd) return false;
    const resolved = path.resolve(cwd);
    return resolved === target || resolved.startsWith(target + path.sep);
  });
  if (!matches.length) return null;

  matches.sort((a, b) => (a?.pm2_env?.pm_uptime || 0) - (b?.pm2_env?.pm_uptime || 0));
  const p = matches[0];
  const startedMs = p?.pm2_env?.pm_uptime; // epoch ms du dernier démarrage
  return {
    name: p.name,
    status: p?.pm2_env?.status || null,
    startedAt: startedMs ? new Date(startedMs).toISOString() : null,
    restarts: p?.pm2_env?.restart_time ?? null,
  };
}

function probeRepo(repoPath, pm2List) {
  if (!fs.existsSync(path.join(repoPath, '.git'))) {
    return { service: path.basename(repoPath), repoPath, error: 'not_a_git_repo' };
  }

  // La branche de référence est celle qui est checkout : chaque repo a sa propre
  // convention (prod, master, main), rien à configurer ici.
  const branch = gitSafe(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch || branch === 'HEAD') {
    return { service: path.basename(repoPath), repoPath, error: 'detached_head' };
  }

  // fetch : ne touche ni HEAD ni le working tree, seulement les refs distantes.
  const fetched = gitSafe(repoPath, ['fetch', '--quiet', '--prune'], { timeout: 45000 }) !== null;

  const remoteRef = `origin/${branch}`;
  const remoteSha = gitSafe(repoPath, ['rev-parse', remoteRef]);
  const pm2 = findPm2Process(pm2List, repoPath);

  return {
    service: path.basename(repoPath),
    repoPath,
    branch,
    fetchOk: fetched,
    headSha: gitSafe(repoPath, ['rev-parse', 'HEAD']),
    headSubject: gitSafe(repoPath, ['log', '-1', '--format=%s']),
    headCommittedAt: gitSafe(repoPath, ['log', '-1', '--format=%cI']),
    headUpdatedAt: headUpdatedAt(repoPath),
    remoteSha,
    // Sans ref distante (branche locale seule), on ne peut rien conclure : 0 plutôt
    // qu'une valeur inventée, et remoteSha reste null pour que le Dashboard le signale.
    behindCount: remoteSha
      ? Number(gitSafe(repoPath, ['rev-list', '--count', `HEAD..${remoteRef}`]) || 0)
      : 0,
    dirty: (gitSafe(repoPath, ['status', '--porcelain']) || '') !== '',
    pm2,
    // Calculé ici et pas côté Dashboard : lui n'a pas le dépôt sous la main.
    runtimeChangedSinceStart: runtimeChangedSinceStart(repoPath, pm2?.startedAt),
  };
}

function post(url, body) {
  const { request } = url.startsWith('https:') ? require('https') : require('http');
  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'POST',
        timeout: 15000,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          'x-api-key': API_KEY || '',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () =>
          res.statusCode >= 200 && res.statusCode < 300
            ? resolve(data)
            : reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`))
        );
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(payload);
  });
}

async function main() {
  const pm2List = readPm2();
  const payload = {
    host: os.hostname(),
    probedAt: new Date().toISOString(),
    repos: REPOS.map((r) => probeRepo(path.resolve(r), pm2List)),
  };

  if (DRY_RUN) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (!PROBE_URL || !API_KEY) {
    console.error('[probe] DEPLOY_PROBE_URL et DEPLOY_PROBE_API_KEY requis (ou --dry-run)');
    process.exit(1);
  }

  await post(PROBE_URL, payload);
  const behind = payload.repos.filter((r) => r.behindCount > 0).length;
  console.log(`[probe] ${payload.repos.length} repo(s) remonté(s), ${behind} en retard`);
}

main().catch((err) => {
  console.error(`[probe] échec: ${err.message}`);
  process.exit(1);
});
