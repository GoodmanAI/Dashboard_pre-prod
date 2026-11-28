-- =============================================================================
-- Migration manuelle : "syncProbleme" et "syncProblemeAt" sur AppointmentConfirmation
-- =============================================================================
--
-- Contexte (28/11/2026, plans/2026-11-reponses-sms-vers-xplore.md « Suite du 28/11 », workspace) :
-- le poller d'AI2Xplore acquitte certaines réponses de patients SANS les avoir appliquées dans
-- Xplore (relance purgée pour un RDV à venir, RDV inconnu d'Xplore, échec qui dure). Quand la
-- ligne rdv_reminders manque, rien de lisible par GET /api/rdv/sante ne le disait. Le poller
-- envoie désormais ces cas dans POST /api/rdv/ack (`problemes`) ; ces deux colonnes les gardent.
--
--   "syncProbleme"   : « <resultat>: <detail> », sans identité patient (300 caractères au plus)
--   "syncProblemeAt" : quand AI2Xplore l'a remonté
--
-- Table gérée hors Prisma (SQL direct via pg), migration non suivie par prisma migrate.
-- Additive, idempotente, rétrocompatible : NULL partout, aucune route existante ne change.
--
-- Rollback :
--   DROP INDEX IF EXISTS "AppointmentConfirmation_syncProblemeAt_idx";
--   ALTER TABLE "AppointmentConfirmation" DROP COLUMN IF EXISTS "syncProbleme",
--                                         DROP COLUMN IF EXISTS "syncProblemeAt";
-- =============================================================================

BEGIN;

ALTER TABLE "AppointmentConfirmation"
  ADD COLUMN IF NOT EXISTS "syncProbleme" text,
  ADD COLUMN IF NOT EXISTS "syncProblemeAt" timestamp(3);

CREATE INDEX IF NOT EXISTS "AppointmentConfirmation_syncProblemeAt_idx"
  ON "AppointmentConfirmation" ("syncProblemeAt")
  WHERE "syncProblemeAt" IS NOT NULL;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.columns
       WHERE table_name = 'AppointmentConfirmation'
         AND column_name IN ('syncProbleme', 'syncProblemeAt')) <> 2 THEN
    RAISE EXCEPTION 'colonnes syncProbleme absentes';
  END IF;
END $$;

COMMIT;
