-- =============================================================================
-- Migration manuelle : PrescriptionUpload REJECTED status + traces refus Xplore
-- =============================================================================
--
-- Contexte : quand AI2Xplore n'arrive pas a deposer le PDF dans Xplore RIS/PACS
-- (apres 3 tentatives + HTTP 500), il POST /api/prescriptions/ack/:id avec
-- { rejected: true, reason: "..." }. Le comportement historique : logger
-- l'echec dans PrescriptionAccessLog mais laisser status='UPLOADED' → l'upload
-- reste dans la file `/api/prescriptions/pending` et AI2Xplore le re-picke,
-- ce qui boucle jusqu'a intervention manuelle.
--
-- Cette migration ajoute :
--   1. Nouveau status 'REJECTED' sur PrescriptionUpload
--   2. Colonnes rejectedAt / rejectReason / rejectAttempts / rejectErrorType
--   3. Colonne manualResolvedAt pour marquer un REJECTED traite par la secretaire
--   4. Compteur PrescriptionStats.rejected (agregats journaliers par centre × type)
--   5. Nouvelle action 'manual_resolved' + 'reject_failed' dans PrescriptionAccessLog
--   6. Index pour la liste secretaire "Rejetees Xplore" (status=REJECTED,
--      manualResolvedAt IS NULL)
--
-- Impact sur les endpoints existants :
--   - /api/prescriptions/pending : filtre deja WHERE status='UPLOADED' →
--     les REJECTED n'apparaissent plus (breaking bug fix : AI2Xplore arrete
--     de re-tenter en boucle)
--   - /api/prescriptions/download/[id] : garde acces sur UPLOADED, ACKED, et
--     ajoute REJECTED (la secretaire doit pouvoir telecharger pour re-depot manuel)
--
-- Additif uniquement. Encapsule dans BEGIN/COMMIT.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Nouveaux status + colonnes sur PrescriptionUpload
-- ---------------------------------------------------------------------------

ALTER TABLE "PrescriptionUpload"
  DROP CONSTRAINT IF EXISTS "PrescriptionUpload_status_check";

ALTER TABLE "PrescriptionUpload"
  ADD CONSTRAINT "PrescriptionUpload_status_check"
  CHECK ("status" IN ('PENDING', 'UPLOADED', 'ACKED', 'EXPIRED', 'LOCKED', 'REJECTED'));

ALTER TABLE "PrescriptionUpload"
  ADD COLUMN IF NOT EXISTS "rejectedAt"        timestamptz;

ALTER TABLE "PrescriptionUpload"
  ADD COLUMN IF NOT EXISTS "rejectReason"      text;

ALTER TABLE "PrescriptionUpload"
  ADD COLUMN IF NOT EXISTS "rejectAttempts"    int;

ALTER TABLE "PrescriptionUpload"
  ADD COLUMN IF NOT EXISTS "rejectErrorType"   varchar(64);

ALTER TABLE "PrescriptionUpload"
  ADD COLUMN IF NOT EXISTS "manualResolvedAt"  timestamptz;

-- Index pour la liste secretaire "Rejetees Xplore a traiter" (chaud, requete
-- appelee toutes les 60s via badge count). Partial index → tres compact.
CREATE INDEX IF NOT EXISTS "PrescriptionUpload_rejected_open_idx"
  ON "PrescriptionUpload" ("externalCenterCode", "rejectedAt")
  WHERE "status" = 'REJECTED' AND "manualResolvedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Compteur PrescriptionStats.rejected
-- ---------------------------------------------------------------------------

ALTER TABLE "PrescriptionStats"
  ADD COLUMN IF NOT EXISTS "rejected" int NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 3) Nouvelles actions dans PrescriptionAccessLog
-- ---------------------------------------------------------------------------

ALTER TABLE "PrescriptionAccessLog"
  DROP CONSTRAINT IF EXISTS "PrescriptionAccessLog_action_check";

ALTER TABLE "PrescriptionAccessLog"
  ADD CONSTRAINT "PrescriptionAccessLog_action_check"
  CHECK ("action" IN (
    'init', 'upload', 'download', 'ack',
    'alert_raised', 'alert_resolved',
    'purge', 'code_failed', 'phone_viewed',
    'reject_failed', 'manual_resolved'
  ));

-- ---------------------------------------------------------------------------
-- 4) Verification integrite migration
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  col_ok  boolean;
  stat_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'PrescriptionUpload' AND column_name = 'rejectedAt'
  ) INTO col_ok;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'PrescriptionStats' AND column_name = 'rejected'
  ) INTO stat_ok;
  IF NOT (col_ok AND stat_ok) THEN
    RAISE EXCEPTION 'Migration incomplete: colonnes rejectedAt/rejected manquantes';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- Rollback (si necessaire) :
--   ALTER TABLE "PrescriptionUpload"
--     DROP CONSTRAINT IF EXISTS "PrescriptionUpload_status_check",
--     DROP COLUMN IF EXISTS "manualResolvedAt",
--     DROP COLUMN IF EXISTS "rejectErrorType",
--     DROP COLUMN IF EXISTS "rejectAttempts",
--     DROP COLUMN IF EXISTS "rejectReason",
--     DROP COLUMN IF EXISTS "rejectedAt";
--   ALTER TABLE "PrescriptionUpload"
--     ADD CONSTRAINT "PrescriptionUpload_status_check"
--     CHECK ("status" IN ('PENDING', 'UPLOADED', 'ACKED', 'EXPIRED', 'LOCKED'));
--   DROP INDEX IF EXISTS "PrescriptionUpload_rejected_open_idx";
--   ALTER TABLE "PrescriptionStats" DROP COLUMN IF EXISTS "rejected";
--   ALTER TABLE "PrescriptionAccessLog"
--     DROP CONSTRAINT IF EXISTS "PrescriptionAccessLog_action_check";
--   ALTER TABLE "PrescriptionAccessLog"
--     ADD CONSTRAINT "PrescriptionAccessLog_action_check"
--     CHECK ("action" IN (
--       'init', 'upload', 'download', 'ack',
--       'alert_raised', 'alert_resolved',
--       'purge', 'code_failed', 'phone_viewed'
--     ));
-- =============================================================================
