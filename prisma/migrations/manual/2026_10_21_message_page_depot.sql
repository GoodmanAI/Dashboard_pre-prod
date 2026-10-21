-- =============================================================================
-- Migration manuelle : message du centre sur la page de depot d'ordonnance
-- =============================================================================
--
-- Contexte (21/10/2026, demande de Pontivy, tache Vega a19e10) : le centre veut
-- dire au patient ce qu'il doit apporter le jour du rendez-vous. Le SMS de depot
-- ne peut pas porter cette phrase ; elle s'affiche en bas de la page de depot
-- (/d/<shortCode>), sous les documents et le questionnaire.
--
-- "PrescriptionConfig"."messagePatient" : texte libre saisi par le client dans
-- le parametrage (carte « Depot d'ordonnance patient »), 500 caracteres au plus.
-- Null = rien d'affiche. Aucune donnee patient.
--
-- Additif et idempotent. A appliquer AVANT le deploiement du code.
-- =============================================================================

BEGIN;

ALTER TABLE "PrescriptionConfig"
  ADD COLUMN IF NOT EXISTS "messagePatient" text;

ALTER TABLE "PrescriptionConfig"
  DROP CONSTRAINT IF EXISTS "PrescriptionConfig_message_longueur";
ALTER TABLE "PrescriptionConfig"
  ADD CONSTRAINT "PrescriptionConfig_message_longueur"
  CHECK ("messagePatient" IS NULL OR char_length("messagePatient") <= 500);

COMMIT;
