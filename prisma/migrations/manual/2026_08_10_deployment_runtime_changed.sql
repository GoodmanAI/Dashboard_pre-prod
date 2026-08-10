-- =============================================================================
-- DeploymentStatus : distinguer un restart NECESSAIRE d'un restart inutile
-- =============================================================================
--
-- Complement de 2026_08_10_deployment_status.sql, meme journee.
--
-- Le probleme : "restart_pending" etait derive de la seule comparaison
--   "pm2StartedAt" < "headUpdatedAt"
-- soit « le disque a change apres le demarrage du process ». Vrai, mais trop
-- large : un git pull qui n'apporte que de la documentation declenchait la meme
-- alerte qu'un pull de code metier. Constate des le 1er jour sur LyraeTalk, ou
-- un pull de doc a fait passer la brique en orange sans qu'aucun redemarrage ne
-- soit utile. Une alerte qui crie pour rien finit par etre ignoree le jour ou
-- elle a raison.
--
-- La sonde calcule desormais elle-meme, cote VM (le Dashboard n'a pas le depot
-- sous la main) : elle recupere le HEAD tel qu'il etait a l'instant du demarrage
-- du process -- HEAD@{<date>}, resolu par le reflog -- et regarde si le diff avec
-- HEAD actuel touche autre chose que *.md, .claude/, .github/, deploy/, docs/.
--
--   TRUE   du code executable a change  -> restart reellement requis
--   FALSE  que de la doc / des scripts cron -> restart inutile
--   NULL   indeterminable : pas de process PM2, ou reflog trop court pour
--          remonter jusqu'au demarrage. Le Dashboard retombe alors sur l'ancienne
--          comparaison de dates -- prudent plutot que faux.
--
-- Idempotent : ADD COLUMN IF NOT EXISTS.
-- =============================================================================

BEGIN;

ALTER TABLE "DeploymentStatus"
  ADD COLUMN IF NOT EXISTS "runtimeChangedSinceStart" BOOLEAN;

COMMIT;
