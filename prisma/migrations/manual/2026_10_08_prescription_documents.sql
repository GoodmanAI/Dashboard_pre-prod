-- =============================================================================
-- Migration manuelle : plusieurs documents par lien de depot d'ordonnance
-- =============================================================================
--
-- Contexte (plan workspace plans/2026-10-depot-ordonnance-plusieurs-documents.md) :
-- jusqu'ici une ligne "PrescriptionUpload" = un lien SMS = un seul fichier.
-- Le patient peut desormais envoyer jusqu'a 5 documents par lien, en plusieurs
-- fois, jusqu'a l'heure de son RDV.
--
-- 1) "PrescriptionDocument" : une ligne par fichier, rattachee au lien. L'etat
--    d'integration (UPLOADED / ACKED / REJECTED) passe du lien au document.
--    La file AI2Xplore (pending / download / ack) porte desormais l'id du
--    DOCUMENT : AI2Xplore dedoublonne sur cet id (prescription_sync_log), donc
--    un id par fichier.
--
-- 2) Reprise de l'existant : un document par lien qui a deja un fichier
--    (UPLOADED, ACKED, REJECTED), AVEC LE MEME ID QUE LE LIEN. Les reprises en
--    cours cote AI2Xplore gardent ainsi leur id. Les nouveaux documents partent
--    de 1 000 000 : aucune collision possible avec un ancien id de lien.
--    Les colonnes fichier et rejet de "PrescriptionUpload" restent en place
--    (lecture seule desormais), pour le retour arriere.
--
-- 3) "PrescriptionAccessLog"."documentId" : le journal garde l'id du lien
--    dans "uploadId" (cle etrangere) et note le document concerne a cote.
--
-- Cle etrangere document -> lien SANS cascade (NO ACTION, verifiee en fin
-- d'instruction) : la purge supprime documents et liens dans une meme
-- instruction et recupere les chemins de fichiers des deux.
--
-- Additif et idempotent. Encapsule dans BEGIN/COMMIT.
-- A appliquer AVANT le deploiement du code qui lit la table.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) PrescriptionDocument
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "PrescriptionDocument" (
  "id"               serial PRIMARY KEY,
  "uploadId"         int NOT NULL REFERENCES "PrescriptionUpload"("id"),
  "status"           varchar(16) NOT NULL DEFAULT 'UPLOADED',
  "uploadedAt"       timestamptz NOT NULL DEFAULT NOW(),
  "fileSize"         int NOT NULL,
  "fileSha256"       char(64) NOT NULL,
  "storagePath"      text NOT NULL,          -- chemin disque, jamais expose au client
  "ackedAt"          timestamptz,
  "rejectedAt"       timestamptz,
  "rejectReason"     text,
  "rejectAttempts"   int,
  "rejectErrorType"  varchar(64),
  "manualResolvedAt" timestamptz,
  CONSTRAINT "PrescriptionDocument_status_check"
    CHECK ("status" IN ('UPLOADED', 'ACKED', 'REJECTED'))
);

-- File AI2Xplore : documents en attente d'ack, FIFO.
CREATE INDEX IF NOT EXISTS "PrescriptionDocument_pending_idx"
  ON "PrescriptionDocument" ("uploadedAt", "id")
  WHERE "status" = 'UPLOADED' AND "ackedAt" IS NULL;

-- Plafond par lien et liste des documents d'un lien.
CREATE INDEX IF NOT EXISTS "PrescriptionDocument_uploadId_idx"
  ON "PrescriptionDocument" ("uploadId");

-- Liste secretaire « Rejetees ».
CREATE INDEX IF NOT EXISTS "PrescriptionDocument_rejected_open_idx"
  ON "PrescriptionDocument" ("rejectedAt")
  WHERE "status" = 'REJECTED' AND "manualResolvedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Reprise de l'existant (meme id que le lien)
-- ---------------------------------------------------------------------------

INSERT INTO "PrescriptionDocument"
  ("id", "uploadId", "status", "uploadedAt", "fileSize", "fileSha256",
   "storagePath", "ackedAt", "rejectedAt", "rejectReason", "rejectAttempts",
   "rejectErrorType", "manualResolvedAt")
SELECT pu."id", pu."id",
       CASE
         WHEN pu."ackedAt" IS NOT NULL THEN 'ACKED'
         WHEN pu."status" = 'REJECTED' THEN 'REJECTED'
         ELSE 'UPLOADED'
       END,
       COALESCE(pu."uploadedAt", pu."createdAt"),
       COALESCE(pu."fileSize", 0),
       pu."fileSha256",
       pu."storagePath",
       pu."ackedAt", pu."rejectedAt", pu."rejectReason", pu."rejectAttempts",
       pu."rejectErrorType", pu."manualResolvedAt"
  FROM "PrescriptionUpload" pu
 WHERE pu."storagePath" IS NOT NULL
   AND pu."fileSha256" IS NOT NULL
   AND pu."status" IN ('UPLOADED', 'ACKED', 'REJECTED')
ON CONFLICT ("id") DO NOTHING;

-- Les nouveaux documents partent de 1 000 000 (au-dela de tout id de lien).
SELECT setval(
  pg_get_serial_sequence('"PrescriptionDocument"', 'id'),
  GREATEST(999999, (SELECT COALESCE(MAX("id"), 0) FROM "PrescriptionDocument")),
  true
);

-- ---------------------------------------------------------------------------
-- 3) Journal d'acces : document concerne
-- ---------------------------------------------------------------------------

ALTER TABLE "PrescriptionAccessLog"
  ADD COLUMN IF NOT EXISTS "documentId" int;

-- ---------------------------------------------------------------------------
-- 4) Verification
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  attendus int;
  repris   int;
  seq_ok   boolean;
BEGIN
  SELECT COUNT(*) INTO attendus FROM "PrescriptionUpload"
   WHERE "storagePath" IS NOT NULL AND "fileSha256" IS NOT NULL
     AND "status" IN ('UPLOADED', 'ACKED', 'REJECTED');
  SELECT COUNT(*) INTO repris FROM "PrescriptionDocument" d
    JOIN "PrescriptionUpload" pu ON pu."id" = d."id" AND d."uploadId" = pu."id";
  IF repris < attendus THEN
    RAISE EXCEPTION 'Reprise incomplete : % documents pour % liens avec fichier', repris, attendus;
  END IF;
  SELECT last_value >= 999999 INTO seq_ok FROM "PrescriptionDocument_id_seq";
  IF NOT seq_ok THEN
    RAISE EXCEPTION 'Sequence PrescriptionDocument_id_seq sous 1 000 000';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- Rollback (si necessaire, apres retour au code precedent) :
--   ALTER TABLE "PrescriptionAccessLog" DROP COLUMN IF EXISTS "documentId";
--   DROP TABLE IF EXISTS "PrescriptionDocument";
-- Attention : les documents envoyes apres la migration (id >= 1 000 000) sont
-- alors perdus pour la file ; leurs fichiers restent sur le disque.
-- =============================================================================
