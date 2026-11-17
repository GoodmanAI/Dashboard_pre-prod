-- =============================================================================
-- Migration manuelle : relance no-show « annulation seule » (17/11/2026)
-- =============================================================================
--
-- Demande de GH Pontivy : dans les relances no-show, ne proposer au patient que
-- l'annulation. Le patient qui vient n'a rien à faire, celui qui ne vient pas
-- annule. Plan : lyrae/plans/2026-11-relance-annulation-seule.md.
--
-- 1. SmsConfirmationConfig."proposerConfirmation" : réglage du client, coché par
--    défaut (confirmation + annulation, comportement d'avant). Décoché = le SMS
--    et la page du lien ne parlent que d'annulation. L'annulation, elle, ne se
--    décoche pas.
-- 2. AppointmentConfirmation."annulationSeule" : figé à chaque init du lien
--    (/api/rdv/init) d'après le réglage du moment. La page patient et la route
--    /respond le lisent : le lien reste fidèle au SMS qui le porte, même si le
--    réglage change entre deux relances.
-- 3. SmsConfirmationConfig."confirmationExamTypes" : types d'examen pour lesquels
--    la confirmation reste proposée quand elle est cochée (ex. ["mammo"] chez
--    Pontivy). NULL = tous les types (défaut, comportement d'avant). Liste posée
--    = confirmation pour ces types seulement ; les autres, et les RDV sans type,
--    passent en annulation seule.
--
-- Tables hors Prisma (SQL direct via pg). Additive, idempotente, rétrocompatible :
-- le code d'avant ignore les deux colonnes.
--
-- Rollback :
--   ALTER TABLE "SmsConfirmationConfig"   DROP COLUMN IF EXISTS "proposerConfirmation";
--   ALTER TABLE "AppointmentConfirmation" DROP COLUMN IF EXISTS "annulationSeule";
--   ALTER TABLE "SmsConfirmationConfig"   DROP COLUMN IF EXISTS "confirmationExamTypes";
-- =============================================================================

BEGIN;

ALTER TABLE "SmsConfirmationConfig"
  ADD COLUMN IF NOT EXISTS "proposerConfirmation" boolean NOT NULL DEFAULT true;

ALTER TABLE "AppointmentConfirmation"
  ADD COLUMN IF NOT EXISTS "annulationSeule" boolean NOT NULL DEFAULT false;

ALTER TABLE "SmsConfirmationConfig"
  ADD COLUMN IF NOT EXISTS "confirmationExamTypes" jsonb NULL;

DO $$
DECLARE
  n integer;
BEGIN
  SELECT COUNT(*) INTO n
    FROM information_schema.columns
   WHERE (table_name = 'SmsConfirmationConfig'   AND column_name = 'proposerConfirmation')
      OR (table_name = 'AppointmentConfirmation' AND column_name = 'annulationSeule')
      OR (table_name = 'SmsConfirmationConfig'   AND column_name = 'confirmationExamTypes');
  IF n <> 3 THEN
    RAISE EXCEPTION 'Migration incomplete: % colonne(s) sur 3', n;
  END IF;
END $$;

COMMIT;

-- Vérifications :
--   SELECT "userProductId", "proposerConfirmation", "confirmationExamTypes"
--     FROM "SmsConfirmationConfig";                                              -- t, NULL partout
--   SELECT "annulationSeule", COUNT(*) FROM "AppointmentConfirmation" GROUP BY 1;   -- tout à f
