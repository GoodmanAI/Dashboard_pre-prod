-- Fiche client enrichie (CHOIX.md, C-59) : ce que l'équipe se demande sans
-- cesse sur un centre. Additif et idempotent. Les listes de valeurs vivent dans
-- src/lib/organisations/referentielClient.ts : du texte, pas des énumérations.
ALTER TYPE "CrmTypeOrganisation" ADD VALUE IF NOT EXISTS 'CLINIQUE';
ALTER TYPE "CrmTypeOrganisation" ADD VALUE IF NOT EXISTS 'CHU';

ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "risVersion" TEXT;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "outilRdv" TEXT;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "nombreSecretaires" INTEGER;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "nombreIrm" INTEGER;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "nombreScanners" INTEGER;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "nombreRadio" INTEGER;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "nombreEcho" INTEGER;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "nombreMammo" INTEGER;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "blocagesTechniques" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "origine" TEXT;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "rattachementGht" TEXT;
