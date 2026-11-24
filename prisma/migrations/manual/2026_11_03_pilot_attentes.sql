-- Pilot : attentes chez les tiers. Additif, idempotent, aucun miroir modifié.
DO $$ BEGIN
  CREATE TYPE "CrmTiers" AS ENUM ('LYRAE', 'CLIENT', 'EDL', 'OPERATEUR_TELEPHONIE', 'PRESTATAIRE_SITE_WEB', 'AUTRE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "CrmEtapeIntegration"
  ADD COLUMN IF NOT EXISTS "enAttenteDe" "CrmTiers",
  ADD COLUMN IF NOT EXISTS "demandeeLe" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "derniereRelanceLe" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "echeanceLe" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "CrmEtapeIntegration_enAttenteDe_idx" ON "CrmEtapeIntegration"("enAttenteDe");

CREATE TABLE IF NOT EXISTS "CrmAcquittement" (
  "id" SERIAL NOT NULL,
  "cleAlerte" TEXT NOT NULL,
  "organisationId" INTEGER NOT NULL,
  "jusquAu" TIMESTAMP(3) NOT NULL,
  "raison" TEXT NOT NULL,
  "auteurId" INTEGER,
  "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmAcquittement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmAcquittement_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "CrmOrganisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmAcquittement_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CrmAcquittement_cleAlerte_jusquAu_idx" ON "CrmAcquittement"("cleAlerte", "jusquAu");
