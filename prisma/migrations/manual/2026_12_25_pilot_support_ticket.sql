-- Les demandes des clients traitées dans Pilot (27/11/2026, plan
-- lyrae/plans/2026-11-separation-dashboard-pilot.md, lot L6). Le client écrit toujours son
-- ticket depuis le Dashboard ; l'équipe en discute dans un sujet de support relié au ticket.
-- Additif et idempotent. Les noms d'index et de clés sont ceux que Prisma donne.
ALTER TABLE "CrmSujetSupport" ADD COLUMN IF NOT EXISTS "ticketId" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "CrmSujetSupport_ticketId_key" ON "CrmSujetSupport"("ticketId");
DO $$ BEGIN
  ALTER TABLE "CrmSujetSupport" ADD CONSTRAINT "CrmSujetSupport_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
