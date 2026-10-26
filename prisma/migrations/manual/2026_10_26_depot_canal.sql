-- =============================================================================
-- Migration manuelle : le canal d'un lien de depot, et le delai de Konnect
-- =============================================================================
--
-- Contexte (plan workspace plans/2026-10-konnect-questionnaires-centre.md,
-- DECISIONS.md du 26/10/2026) : le patient de Konnect remplit les
-- questionnaires du centre par le lien de depot de sa confirmation. Ses liens
-- vivent dans "PrescriptionUpload", comme ceux de LyraeTalk, et la secretaire
-- doit les retrouver dans la section Konnect du Dashboard, pas dans « Ordonnances
-- manquantes » de LyraeTalk.
--
--  - "PrescriptionUpload"."canal" : 'talk' ou 'konnect', pose a la creation par
--    POST /api/prescriptions/init selon la cle d'API. Les liens existants
--    restent 'talk' (rien ne permet de les distinguer, et Konnect n'en a cree
--    que sur la demonstration).
--  - "PrescriptionConfig"."alertAfterHoursKonnect" : delai avant qu'un
--    questionnaire non rempli d'un patient de Konnect apparaisse a la
--    secretaire. NULL = 24 h (DEFAULT_ALERT_AFTER_HOURS_KONNECT).
--
-- Additif et idempotent. A appliquer AVANT le deploiement du code qui lit les
-- colonnes. L'ancien code tourne sur la nouvelle base sans les voir.
-- =============================================================================

BEGIN;

ALTER TABLE "PrescriptionUpload"
  ADD COLUMN IF NOT EXISTS "canal" text NOT NULL DEFAULT 'talk';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PrescriptionUpload_canal_check'
  ) THEN
    ALTER TABLE "PrescriptionUpload"
      ADD CONSTRAINT "PrescriptionUpload_canal_check"
      CHECK ("canal" IN ('talk', 'konnect'));
  END IF;
END $$;

ALTER TABLE "PrescriptionConfig"
  ADD COLUMN IF NOT EXISTS "alertAfterHoursKonnect" int;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PrescriptionConfig_alertAfterHoursKonnect_check'
  ) THEN
    ALTER TABLE "PrescriptionConfig"
      ADD CONSTRAINT "PrescriptionConfig_alertAfterHoursKonnect_check"
      CHECK ("alertAfterHoursKonnect" IS NULL OR "alertAfterHoursKonnect" BETWEEN 1 AND 720);
  END IF;
END $$;

COMMIT;
