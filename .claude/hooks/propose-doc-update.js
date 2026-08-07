#!/usr/bin/env node
/**
 * Hook Stop : a la fin de chaque reponse de Claude Code, verifie si la session
 * a modifie des fichiers d'interface sans toucher CONTRACT.md ou CLAUDE.md.
 * Ce qui est ecrit sur stdout est ajoute au contexte de Claude.
 *
 * A placer dans .claude/hooks/propose-doc-update.js de chaque repo.
 */
const { execSync } = require('child_process');

// Motifs d'interface par repo, detectes depuis le nom du dossier courant
const PATTERNS = {
  'ai2xplore':       /^(routes\/|src\/controllers\/|src\/services\/|src\/helpers\/(ResponseHelper|UrlHelper)|config\/postgres)/,
  'dashboard':       /^(src\/app\/api\/(rdv|prescriptions|calls|configuration|sms-confirmation-config)\/|prisma\/(schema\.prisma|migrations\/)|src\/middleware\.ts)/,
  'lyraetalk':       /^(src\/services\/|src\/controllers\/|src\/helpers\/|routes\/)/,
  'azure-functions': /^[a-z_]+\/(__init__\.py|function\.json)$/,
  'daily-report':    /^src\/(prefilter|grafana|llm)\//,
};

function main() {
  let changed;
  try {
    changed = execSync('git status --porcelain', { encoding: 'utf8' })
      .split('\n')
      .map(l => l.slice(3).trim())
      .filter(Boolean);
  } catch {
    return; // pas un depot git
  }
  if (changed.length === 0) return;

  const repo = process.cwd().split(/[\\/]/).pop();
  const pattern = PATTERNS[repo];
  if (!pattern) return;

  const interfaces = changed.filter(f => pattern.test(f));
  if (interfaces.length === 0) return;

  const docTouched = changed.some(f => /^(CONTRACT|CLAUDE)\.md$/.test(f))
    || changed.some(f => f.startsWith('.claude/skills/'));
  if (docTouched) return;

  console.log([
    '',
    'RAPPEL DOCUMENTATION',
    '',
    'Cette session a modifie des fichiers d\'interface sans toucher a la',
    'documentation :',
    ...interfaces.slice(0, 10).map(f => '  - ' + f),
    '',
    'Avant de conclure, verifie et propose a l\'utilisateur :',
    '  1. CONTRACT.md doit-il changer ? (interface exposee, payload,',
    '     invariant, consommateur)',
    '  2. CLAUDE.md doit-il changer ? (commande, convention, piege interne',
    '     decouvert pendant cette session)',
    '  3. Un piege durable est-il apparu et merite-t-il une skill ?',
    '',
    'Si rien n\'est necessaire, dis-le en une ligne et n\'insiste pas.',
    '',
  ].join('\n'));
}

main();
