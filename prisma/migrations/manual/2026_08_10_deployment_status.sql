-- =============================================================================
-- DeploymentStatus : suivi de la derive de deploiement (chantier 2026-08-10)
-- =============================================================================
--
-- Alimentee par deploy/deployment-probe.js, en cron toutes les 15 min sur chaque
-- VM. Une ligne par couple (service, host) : on stocke l'ETAT COURANT, pas un
-- historique -- la table ne croit donc pas (5 lignes environ, une par brique).
--
-- Le STATUT N'EST PAS STOCKE. Il est derive a la lecture dans
-- src/app/api/deployments/route.ts, parce qu'il depend de l'heure qu'il est :
-- une sonde muette depuis 2h devient "stale" sans qu'aucune ecriture n'ait lieu.
-- Stocker le statut obligerait a le recalculer en permanence.
--
-- Les trois etats que ces colonnes permettent de distinguer :
--   "behindCount" > 0                         -> commits poussés, pas de git pull
--   "pm2StartedAt" < "headUpdatedAt"          -> pull fait, pm2 restart manquant
--   sinon                                     -> a jour
-- Le 2e cas est invisible cote VM : le working tree est propre et pourtant
-- l'ancien code tourne toujours en memoire. C'est la raison d'etre de la table.
--
-- Table purement observationnelle : aucune donnee metier, aucun lien vers les
-- autres tables. Un DROP est sans consequence (cf. plan de retour arriere).
--
-- Idempotent : CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "DeploymentStatus" (
  "id"               SERIAL PRIMARY KEY,

  -- Identite. "service" = nom du repertoire du repo sur la VM (lyraetalk,
  -- ai2xplore, dashboard...), "host" = hostname. Le couple est unique : une
  -- meme brique peut tourner sur deux VMs (sandbox / prod).
  "service"          TEXT        NOT NULL,
  "host"             TEXT        NOT NULL,
  "repoPath"         TEXT,

  -- Etat git. "branch" est la branche REELLEMENT checkout sur la VM, pas une
  -- branche de reference configuree : chaque repo a sa convention (prod pour
  -- ai2xplore, master pour lyraetalk, main pour dashboard). Une VM laissee sur
  -- une branche de feature devient ainsi visible au lieu de passer inapercue.
  "branch"           TEXT,
  "headSha"          TEXT,
  "headSubject"      TEXT,
  "headCommittedAt"  TIMESTAMPTZ,
  -- Date de la derniere mise a jour de HEAD (pull / checkout / merge), lue dans
  -- le reflog de la VM. C'est ELLE qui date le changement du code sur disque :
  -- deployer un commit vieux de 10 jours met le disque a jour aujourd'hui, et
  -- comparer le demarrage PM2 a "headCommittedAt" conclurait a tort "a jour".
  -- Nullable : reflog absent (clone --depth, expiration) -> repli sur headCommittedAt.
  "headUpdatedAt"    TIMESTAMPTZ,
  "remoteSha"        TEXT,
  "behindCount"      INTEGER     NOT NULL DEFAULT 0,
  "dirty"            BOOLEAN     NOT NULL DEFAULT FALSE,
  -- false = le git fetch a echoue : "remoteSha" et "behindCount" datent du
  -- fetch precedent et ne prouvent plus rien. A signaler dans l'UI.
  "fetchOk"          BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Etat PM2. Tout est nullable : la VM daily-report n'a que des crons, et un
  -- repo peut n'avoir aucun process associe. "pm2StartedAt" est l'instant du
  -- dernier demarrage -- c'est LUI qui dit si le restart a suivi le pull.
  "pm2Name"          TEXT,
  "pm2Status"        TEXT,
  "pm2StartedAt"     TIMESTAMPTZ,
  "pm2Restarts"      INTEGER,

  -- Diagnostic de sonde (not_a_git_repo, detached_head...). Non nul = les
  -- colonnes git ci-dessus sont vides et le repo doit etre signale, pas ignore.
  "probeError"       TEXT,

  "probeAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Support du ON CONFLICT de l'upsert de la sonde.
CREATE UNIQUE INDEX IF NOT EXISTS "DeploymentStatus_service_host_key"
  ON "DeploymentStatus" ("service", "host");

COMMIT;
