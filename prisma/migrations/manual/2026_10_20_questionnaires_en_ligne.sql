-- =============================================================================
-- Migration manuelle : questionnaires remplis en ligne sur le lien de depot
-- =============================================================================
--
-- Contexte (plan workspace plans/2026-10-questionnaires-en-ligne.md, lot B des
-- documents demandes, Q40) : un document demande dont le modele PDF a ete
-- prepare (« formulaire ») se remplit sur la page du patient, question par
-- question ; le Dashboard ecrit les reponses dans le PDF du centre et le range
-- comme un depot. Un document non prepare garde le parcours du lot A
-- (telecharger, remplir, redeposer).
--
-- 1) "DocumentDemande"."formulaire" : la preparation (questions, places dans le
--    PDF, alertes, rendu de fond de chaque page pour l'apercu). Null = parcours
--    du lot A.
--    "formulaireEmpreinte" : sha256 (hex) du modele au moment de la
--    preparation. Un modele remplace par l'admin n'a plus la meme empreinte :
--    le formulaire se coupe tout seul, on n'ecrit jamais au mauvais endroit.
--
-- 2) "PieceAttendue"."alertesReponses" : libelles des reponses qui demandent
--    l'oeil du secretariat (« Pacemaker ou defibrillateur : oui »). Seulement
--    les libelles des alertes, jamais les reponses (donnee de sante : le PDF
--    rempli suffit, et il suit la purge du lien).
--
-- Additif et idempotent. A appliquer AVANT le deploiement du code.
-- =============================================================================

BEGIN;

ALTER TABLE "DocumentDemande"
  ADD COLUMN IF NOT EXISTS "formulaire" jsonb,
  ADD COLUMN IF NOT EXISTS "formulaireEmpreinte" char(64);

ALTER TABLE "PieceAttendue"
  ADD COLUMN IF NOT EXISTS "alertesReponses" jsonb;

-- La liste « Réponses à vérifier » de la secretaire : pieces recues avec
-- alerte, pas encore classees.
CREATE INDEX IF NOT EXISTS "PieceAttendue_alertesReponses_idx"
  ON "PieceAttendue" ("uploadId")
  WHERE "alertesReponses" IS NOT NULL AND "alertResolvedAt" IS NULL;

-- 3) Deux actions de plus dans le journal des acces : ouverture du
--    questionnaire (le code est verifie, le nom complet est servi) et envoi.
--    Liste reprise de 2026_08_04_add_prescription_rejected.sql.
ALTER TABLE "PrescriptionAccessLog"
  DROP CONSTRAINT IF EXISTS "PrescriptionAccessLog_action_check";

ALTER TABLE "PrescriptionAccessLog"
  ADD CONSTRAINT "PrescriptionAccessLog_action_check"
  CHECK ("action" IN (
    'init', 'upload', 'download', 'ack',
    'alert_raised', 'alert_resolved',
    'purge', 'code_failed', 'phone_viewed',
    'reject_failed', 'manual_resolved',
    'formulaire', 'formulaire_envoi'
  ));

COMMIT;
