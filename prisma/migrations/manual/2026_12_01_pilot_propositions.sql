-- Types neufs : leur utilisation dans la même transaction est permise.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CrmStatutProposition') THEN
    CREATE TYPE "CrmStatutProposition" AS ENUM ('BROUILLON', 'ENVOYEE', 'EN_DISCUSSION', 'ACCEPTEE', 'REFUSEE', 'EXPIREE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CrmCategoriePrevision') THEN
    CREATE TYPE "CrmCategoriePrevision" AS ENUM ('ENGAGE', 'PROBABLE', 'POSSIBLE', 'EXCLU');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CrmProposition" (
  "id" SERIAL NOT NULL,
  "organisationId" INTEGER NOT NULL,
  "version" INTEGER NOT NULL,
  "statut" "CrmStatutProposition" NOT NULL DEFAULT 'BROUILLON',
  "envoyeeLe" TIMESTAMP(3), "valideJusquAu" TIMESTAMP(3), "repondueLe" TIMESTAMP(3),
  "remisePourMille" INTEGER NOT NULL DEFAULT 0,
  "engagementMois" INTEGER, "preavisMois" INTEGER,
  "documentUrl" TEXT, "reponseClient" TEXT, "notes" TEXT, "auteurId" INTEGER,
  "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmProposition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmProposition_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "CrmOrganisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmProposition_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrmProposition_organisationId_version_key" ON "CrmProposition"("organisationId", "version");
CREATE INDEX IF NOT EXISTS "CrmProposition_statut_valideJusquAu_idx" ON "CrmProposition"("statut", "valideJusquAu");

CREATE TABLE IF NOT EXISTS "CrmLigneProposition" (
  "id" SERIAL NOT NULL, "propositionId" INTEGER NOT NULL, "productId" INTEGER NOT NULL, "centreId" INTEGER,
  "type" "CrmTypeLigne" NOT NULL, "montantCentimes" INTEGER NOT NULL DEFAULT 0,
  "unite" "CrmUniteVariable", "volumeInclus" INTEGER, "libelle" TEXT,
  CONSTRAINT "CrmLigneProposition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmLigneProposition_propositionId_fkey" FOREIGN KEY ("propositionId") REFERENCES "CrmProposition"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmLigneProposition_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmLigneProposition_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "CrmCentre"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CrmLigneProposition_propositionId_idx" ON "CrmLigneProposition"("propositionId");
ALTER TABLE "CrmContrat" ADD COLUMN IF NOT EXISTS "engagementMois" INTEGER;
ALTER TABLE "CrmContrat" ADD COLUMN IF NOT EXISTS "preavisMois" INTEGER;
ALTER TABLE "CrmContrat" ADD COLUMN IF NOT EXISTS "propositionId" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "CrmContrat_propositionId_key" ON "CrmContrat"("propositionId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmContrat_propositionId_fkey' AND conrelid = '"CrmContrat"'::regclass) THEN
    ALTER TABLE "CrmContrat" ADD CONSTRAINT "CrmContrat_propositionId_fkey" FOREIGN KEY ("propositionId") REFERENCES "CrmProposition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
ALTER TABLE "CrmOpportunite" ADD COLUMN IF NOT EXISTS "categoriePrevision" "CrmCategoriePrevision" NOT NULL DEFAULT 'POSSIBLE';
ALTER TABLE "CrmEchange" ADD COLUMN IF NOT EXISTS "aLaChargeDe" "CrmTiers";
