-- =============================================================================
-- Migration manuelle : libelle Xplore des documents demandes
-- =============================================================================
--
-- Contexte (plan workspace plans/2026-10-libelle-xplore-des-documents.md) :
-- Xplore ne garde pas un libelle de piece jointe libre. Il le ramene a la liste
-- des libelles de PJ de sa base (exact, sinon le premier qui commence par le
-- meme mot, sinon « Ordonnance »). A Pontivy, le questionnaire IRM partait sous
-- « Questionnaire Grossesse ».
--
-- Le client saisit le libelle tel qu'il existe dans son Xplore. AI2Xplore depose
-- sous ce nom (`libelleXplore` de GET /api/prescriptions/pending), sinon sous
-- `libelle`. NULL = non renseigne. 64 caracteres au plus (spec Xplore).
--
-- Additif et idempotent. A appliquer AVANT le deploiement du code qui lit la
-- colonne. L'ancien code tourne sur la nouvelle base sans la voir.
-- =============================================================================

BEGIN;

ALTER TABLE "DocumentDemande"
  ADD COLUMN IF NOT EXISTS "libelleXplore" varchar(64);

COMMIT;
