-- =============================================================================
-- Migration manuelle : statut de suivi des cartes Ordonnances et Questionnaires
-- =============================================================================
--
-- Tache Vega 35f049 (28/10/2026). Plusieurs secretaires travaillent en meme
-- temps sur « Ordonnances manquantes » (LyraeTalk) et « Questionnaires des
-- patients » (Konnect, meme ecran). Une carte en cours de traitement porte un
-- statut visible de toutes, pose par une secretaire sans classer la carte :
--
--  - 'contacte'    : patient contacte, en attente des documents
--  - 'injoignable' : patient injoignable
--
-- plus une note courte (200 caracteres). « Marquer traite » ne change pas : il
-- classe la carte et efface son suivi.
--
-- Une ligne par carte, c'est-a-dire par lien de depot et par section
-- (`piece` : 'ordonnance' ou 'document', comme "PieceAttendue"."piece").
-- La note est du texte libre saisi par le centre : elle part avec le lien
-- (ON DELETE CASCADE, purge_prescriptions.sh) et n'est jamais journalisee.
--
-- Additif et idempotent. A appliquer AVANT le deploiement du code qui lit cette
-- table. L'ancien code tourne sur la nouvelle base sans la voir.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "SuiviCarte" (
  "uploadId"  int NOT NULL REFERENCES "PrescriptionUpload"("id") ON DELETE CASCADE,
  "piece"     text NOT NULL CHECK ("piece" IN ('ordonnance', 'document')),
  "statut"    text NOT NULL CHECK ("statut" IN ('contacte', 'injoignable')),
  "note"      varchar(200),
  "parUserId" int,
  "parNom"    text,
  "majAt"     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("uploadId", "piece")
);

COMMIT;
