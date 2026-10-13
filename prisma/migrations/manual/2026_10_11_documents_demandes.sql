-- =============================================================================
-- Migration manuelle : documents demandes au patient (questionnaires et autres)
-- =============================================================================
--
-- Contexte (plan workspace plans/2026-10-documents-demandes.md, DECISIONS.md du
-- 11/10/2026) : en plus de l'ordonnance, un client peut demander au patient des
-- documents (questionnaire IRM, questionnaire mineur...), avec ou sans modele
-- PDF a telecharger. Le lien de depot les recoit piece par piece.
--
-- 1) "DocumentDemande" : un document par client (userProductId), commun a ses
--    sites. L'admin le cree et depose le modele ; le client n'a que
--    l'interrupteur "disponible", eteint par defaut. Le modele vit en base
--    (comme le logo Konnect) : une sauvegarde de la base le contient.
--    On archive, on ne supprime pas : une piece attendue peut pointer dessus.
--
-- 2) "PieceAttendue" : une ligne par piece demandee sur un lien (l'ordonnance,
--    ou un document demande). L'etat d'alerte de la secretaire passe du lien a
--    la piece : un lien qui ne demande qu'un questionnaire ne doit pas
--    apparaitre dans "Ordonnances", et un questionnaire manquant doit alerter
--    meme quand l'ordonnance est arrivee. "PrescriptionUpload"."status" garde
--    son sens et reste ecrit comme avant.
--    "libelle" est fige a la creation : renommer un document ne reecrit pas
--    les liens deja envoyes.
--
-- 3) "PrescriptionDocument"."pieceAttendueId" : la piece a laquelle le fichier
--    repond (libelle de la piece jointe dans Xplore).
--
-- 4) Reprise : une piece "ordonnance" par lien existant, "recueAt" au premier
--    document, "alertResolvedAt" recopie du lien ; documents rattaches.
--
-- Additif et idempotent. Encapsule dans BEGIN/COMMIT.
-- A appliquer AVANT le deploiement du code qui lit ces tables. L'ancien code
-- tourne sur la nouvelle base sans la voir, mais un lien cree par l'ancien
-- code apres la migration n'aurait pas de piece : rejouer la section 4 apres
-- le deploiement (idempotente) rattrape ces liens.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) DocumentDemande
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "DocumentDemande" (
  "id"               serial PRIMARY KEY,
  "userProductId"    int NOT NULL REFERENCES "UserProduct"("id") ON DELETE CASCADE,
  "libelle"          varchar(120) NOT NULL,
  "modeleContenu"    bytea,
  "modeleType"       varchar(64),
  "modeleNom"        varchar(200),
  "modeleMaj"        timestamptz,
  "typesExamen"      jsonb NOT NULL DEFAULT '[]'::jsonb,
  "mineursSeulement" boolean NOT NULL DEFAULT false,
  "disponible"       boolean NOT NULL DEFAULT false,
  "ordre"            int NOT NULL DEFAULT 0,
  "createdAt"        timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt"        timestamptz NOT NULL DEFAULT NOW(),
  "archivedAt"       timestamptz
);

CREATE INDEX IF NOT EXISTS "DocumentDemande_userProductId_idx"
  ON "DocumentDemande" ("userProductId")
  WHERE "archivedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- 2) PieceAttendue
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "PieceAttendue" (
  "id"                serial PRIMARY KEY,
  "uploadId"          int NOT NULL REFERENCES "PrescriptionUpload"("id") ON DELETE CASCADE,
  "piece"             varchar(16) NOT NULL,
  "documentDemandeId" int REFERENCES "DocumentDemande"("id"),
  "libelle"           varchar(120) NOT NULL,
  "avecModele"        boolean NOT NULL DEFAULT false,
  "ordre"             int NOT NULL DEFAULT 0,
  "recueAt"           timestamptz,
  "alertResolvedAt"   timestamptz,
  "createdAt"         timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "PieceAttendue_piece_check"
    CHECK ("piece" IN ('ordonnance', 'document')),
  CONSTRAINT "PieceAttendue_document_check"
    CHECK (("piece" = 'document') = ("documentDemandeId" IS NOT NULL))
);

-- Une ordonnance et un exemplaire de chaque document par lien.
CREATE UNIQUE INDEX IF NOT EXISTS "PieceAttendue_lien_piece_key"
  ON "PieceAttendue" ("uploadId", "piece", COALESCE("documentDemandeId", 0));

-- Listes et compteurs de la secretaire : pieces ouvertes.
CREATE INDEX IF NOT EXISTS "PieceAttendue_ouvertes_idx"
  ON "PieceAttendue" ("piece", "uploadId")
  WHERE "recueAt" IS NULL AND "alertResolvedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- 3) PrescriptionDocument.pieceAttendueId
-- ---------------------------------------------------------------------------

ALTER TABLE "PrescriptionDocument"
  ADD COLUMN IF NOT EXISTS "pieceAttendueId" int REFERENCES "PieceAttendue"("id");

CREATE INDEX IF NOT EXISTS "PrescriptionDocument_pieceAttendueId_idx"
  ON "PrescriptionDocument" ("pieceAttendueId");

-- ---------------------------------------------------------------------------
-- 3 bis) Carte « a verifier dans la boite mail » : ce qu'il faut demander
-- ---------------------------------------------------------------------------
-- Le patient sans portable ni mail envoie son ordonnance au secretariat et
-- lui demande les questionnaires de son examen : la carte dit lesquels.
-- "ordonnance" vaut true pour toutes les cartes d'avant (elles ne portaient
-- que l'ordonnance).

ALTER TABLE "PrescriptionParMail"
  ADD COLUMN IF NOT EXISTS "ordonnance" boolean NOT NULL DEFAULT true;
ALTER TABLE "PrescriptionParMail"
  ADD COLUMN IF NOT EXISTS "documents" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 4) Reprise de l'existant (rejouable)
-- ---------------------------------------------------------------------------

INSERT INTO "PieceAttendue"
  ("uploadId", "piece", "libelle", "recueAt", "alertResolvedAt", "createdAt")
SELECT pu."id", 'ordonnance', 'Ordonnance',
       CASE
         WHEN pu."status" = 'PENDING'
              AND NOT EXISTS (SELECT 1 FROM "PrescriptionDocument" d WHERE d."uploadId" = pu."id")
         THEN NULL
         ELSE COALESCE(
           (SELECT MIN(d."uploadedAt") FROM "PrescriptionDocument" d WHERE d."uploadId" = pu."id"),
           pu."uploadedAt",
           pu."createdAt")
       END,
       pu."alertResolvedAt",
       pu."createdAt"
  FROM "PrescriptionUpload" pu
 WHERE NOT EXISTS (SELECT 1 FROM "PieceAttendue" p WHERE p."uploadId" = pu."id");

UPDATE "PrescriptionDocument" d
   SET "pieceAttendueId" = p."id"
  FROM "PieceAttendue" p
 WHERE p."uploadId" = d."uploadId"
   AND p."piece" = 'ordonnance'
   AND d."pieceAttendueId" IS NULL;

-- ---------------------------------------------------------------------------
-- 5) Verification
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  sans_piece int;
  docs_orphelins int;
BEGIN
  SELECT COUNT(*) INTO sans_piece FROM "PrescriptionUpload" pu
   WHERE NOT EXISTS (SELECT 1 FROM "PieceAttendue" p WHERE p."uploadId" = pu."id");
  IF sans_piece > 0 THEN
    RAISE EXCEPTION 'Reprise incomplete : % liens sans piece', sans_piece;
  END IF;
  SELECT COUNT(*) INTO docs_orphelins FROM "PrescriptionDocument"
   WHERE "pieceAttendueId" IS NULL;
  IF docs_orphelins > 0 THEN
    RAISE EXCEPTION 'Reprise incomplete : % documents sans piece', docs_orphelins;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- Rollback (apres retour au code precedent) :
--   ALTER TABLE "PrescriptionParMail" DROP COLUMN IF EXISTS "documents";
--   ALTER TABLE "PrescriptionParMail" DROP COLUMN IF EXISTS "ordonnance";
--   ALTER TABLE "PrescriptionDocument" DROP COLUMN IF EXISTS "pieceAttendueId";
--   DROP TABLE IF EXISTS "PieceAttendue";
--   DROP TABLE IF EXISTS "DocumentDemande";
-- Les documents deposes pour un questionnaire restent dans la file : ils
-- partiraient alors dans Xplore sous le libelle d'une ordonnance.
-- =============================================================================
