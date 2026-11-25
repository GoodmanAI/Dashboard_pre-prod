-- Support dans Pilot (25/11/2026, plan lyrae/plans/2026-11-support-dans-pilot.md).
-- Le technicien dit aux commerciaux quoi dire au client, et le sait transmis.
-- Additif et idempotent. Les noms d'index et de clés sont ceux que Prisma donne.
--
-- ALTER TYPE ... ADD VALUE n'est suivi d'aucun usage de la valeur ajoutée dans ce
-- fichier : une valeur ajoutée n'est utilisable qu'après la validation.
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'SUPPORT_SUJET_CREE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'SUPPORT_MESSAGE_AJOUTE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'SUPPORT_STATUT_CHANGE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'SUPPORT_RELANCE';

DO $$ BEGIN
  CREATE TYPE "CrmStatutSujetSupport" AS ENUM ('OUVERT', 'A_TRANSMETTRE', 'TRANSMIS', 'RESOLU');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CrmSujetSupport" (
  "id" SERIAL PRIMARY KEY,
  "organisationId" INTEGER NOT NULL,
  "titre" TEXT NOT NULL,
  "statut" "CrmStatutSujetSupport" NOT NULL DEFAULT 'OUVERT',
  "statutDepuisLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "derniereRelanceLe" TIMESTAMP(3),
  "auteurId" INTEGER,
  "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmSujetSupport_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "CrmOrganisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmSujetSupport_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CrmSujetSupport_statut_statutDepuisLe_idx" ON "CrmSujetSupport"("statut", "statutDepuisLe");
CREATE INDEX IF NOT EXISTS "CrmSujetSupport_organisationId_statut_idx" ON "CrmSujetSupport"("organisationId", "statut");

CREATE TABLE IF NOT EXISTS "CrmMessageSupport" (
  "id" SERIAL PRIMARY KEY,
  "sujetId" INTEGER NOT NULL,
  "auteurId" INTEGER,
  "noteInterne" TEXT,
  "aDireAuClient" TEXT,
  "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmMessageSupport_sujetId_fkey" FOREIGN KEY ("sujetId") REFERENCES "CrmSujetSupport"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmMessageSupport_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CrmMessageSupport_contenu_check" CHECK ("noteInterne" IS NOT NULL OR "aDireAuClient" IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS "CrmMessageSupport_sujetId_creeLe_idx" ON "CrmMessageSupport"("sujetId", "creeLe");
