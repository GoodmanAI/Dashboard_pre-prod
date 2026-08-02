-- Migration manuelle : refonte tickets support (chantier 2)
--
-- Objectif :
--   - Scoper les tickets par centre (userProductId) en plus de userId
--   - Ajouter un thread de messages (chat) par ticket
--   - Ajouter les etats "prise en charge" (assignedToId) et "resolu" (resolvedAt)
--   - Etendre l'enum TicketStatus avec RESOLVED (avant CLOSED = archive)
--
-- Rationale :
--   - Aujourd'hui un Ticket = 1 sujet + 1 message unique, pas de conversation
--   - Le nouveau flow permet : client cree + description initiale, admin/client
--     echangent en chat, admin marque RESOLVED, client peut confirmer/rouvrir
--   - CLOSED = archive definitive (RESOLVED + N jours ou action explicite)
--
-- Compatibilite :
--   - Le champ Ticket.message existant est conserve pour retrocompat + il sert
--     de description initiale du ticket (equivalent au 1er message)
--   - Le nouveau TicketMessage stocke uniquement les REPONSES (admin + client)
--     du chat, pas la description initiale
--
-- La table Ticket est geree par Prisma (schema.prisma). Cette migration
-- ajoute des colonnes que Prisma doit ensuite reconnaitre via prisma db pull
-- ou update manuel du schema.prisma (fait en parallele).
--
-- Idempotent : safe a rejouer.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Etendre l'enum TicketStatus avec RESOLVED
-- ---------------------------------------------------------------------------
-- PostgreSQL ne permet pas ALTER TYPE ADD VALUE IF NOT EXISTS en transaction
-- sur certaines versions. On utilise DO block + check catalog pour idempotence.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TicketStatus' AND e.enumlabel = 'RESOLVED'
  ) THEN
    ALTER TYPE "TicketStatus" ADD VALUE 'RESOLVED' AFTER 'IN_PROGRESS';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Etendre la table Ticket avec les nouveaux champs
-- ---------------------------------------------------------------------------
ALTER TABLE "Ticket"
  ADD COLUMN IF NOT EXISTS "userProductId" int REFERENCES "UserProduct"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "assignedToId"  int REFERENCES "User"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "resolvedAt"    timestamptz,
  ADD COLUMN IF NOT EXISTS "closedAt"      timestamptz;

-- Index pour les listings admin filtres par centre + status
CREATE INDEX IF NOT EXISTS "Ticket_userProductId_status_idx"
  ON "Ticket" ("userProductId", "status");

-- Index pour lister vite les tickets pris en charge par un admin
CREATE INDEX IF NOT EXISTS "Ticket_assignedToId_status_idx"
  ON "Ticket" ("assignedToId", "status")
  WHERE "assignedToId" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) Nouvelle table TicketMessage (thread de conversation par ticket)
-- ---------------------------------------------------------------------------
-- Chaque message est ecrit par un utilisateur (client OU admin), attache a
-- un ticket. Cascade delete avec le ticket parent (si un ticket est supprime,
-- son thread part avec).
--
-- Pas d'edition ni suppression exposees en UI pour l'instant (log applicatif
-- immuable de la conversation, plus simple + tracabilite).

CREATE TABLE IF NOT EXISTS "TicketMessage" (
  "id"        serial PRIMARY KEY,
  "ticketId"  int NOT NULL REFERENCES "Ticket"("id") ON DELETE CASCADE,
  "authorId"  int NOT NULL REFERENCES "User"("id")   ON DELETE RESTRICT,
  "body"      text NOT NULL CHECK (char_length("body") BETWEEN 1 AND 10000),
  "createdAt" timestamptz NOT NULL DEFAULT NOW()
);

-- Index pour recuperer vite le thread d'un ticket dans l'ordre chronologique
CREATE INDEX IF NOT EXISTS "TicketMessage_ticket_created_idx"
  ON "TicketMessage" ("ticketId", "createdAt");

COMMIT;

-- ---------------------------------------------------------------------------
-- Rollback (a lancer manuellement si besoin) :
-- ---------------------------------------------------------------------------
--   BEGIN;
--   DROP TABLE IF EXISTS "TicketMessage";
--   ALTER TABLE "Ticket"
--     DROP COLUMN IF EXISTS "userProductId",
--     DROP COLUMN IF EXISTS "assignedToId",
--     DROP COLUMN IF EXISTS "resolvedAt",
--     DROP COLUMN IF EXISTS "closedAt";
--   -- Note : PostgreSQL ne permet pas de DROP VALUE d'un enum, RESOLVED restera.
--   COMMIT;
--
-- Verifs post-migration :
--   \d "Ticket"           -- doit contenir les 4 nouvelles colonnes
--   \d "TicketMessage"    -- doit exister avec les bons FKs et index
--   SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--     WHERE t.typname = 'TicketStatus' ORDER BY enumsortorder;
--     -- attendu : PENDING, IN_PROGRESS, RESOLVED, CLOSED
