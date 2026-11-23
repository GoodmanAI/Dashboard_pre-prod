-- C-93 : additif et idempotent. Les valeurs ajoutées ne sont pas utilisées ici.
ALTER TYPE "CrmEtapeCommerciale" ADD VALUE IF NOT EXISTS 'EN_POC';
ALTER TYPE "CrmEtapeCommerciale" ADD VALUE IF NOT EXISTS 'POC_NON_TRANSFORME';
ALTER TYPE "CrmCleEtape" ADD VALUE IF NOT EXISTS 'BON_COMMANDE_EDL';
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "pocDebuteLe" date;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "pocProlongeLe" date;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmOrganisation_poc_dates') THEN
    ALTER TABLE "CrmOrganisation" ADD CONSTRAINT "CrmOrganisation_poc_dates"
      CHECK ("pocProlongeLe" IS NULL OR "pocDebuteLe" IS NOT NULL);
  END IF;
END $$;
