CREATE TABLE IF NOT EXISTS "CrmVague" (
  "id" SERIAL NOT NULL,
  "organisationId" INTEGER NOT NULL,
  "numero" INTEGER NOT NULL,
  "nom" TEXT,
  "datePromise" TIMESTAMP(3),
  "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmVague_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrmVague_organisationId_numero_key" ON "CrmVague"("organisationId", "numero");
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "importCle" TEXT;
-- Le brief exige les notes de l'organisation pour l'import ; elles manquaient au modèle.
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "notes" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "CrmOrganisation_importCle_key" ON "CrmOrganisation"("importCle");
ALTER TABLE "CrmCentreProduit" ADD COLUMN IF NOT EXISTS "vagueId" INTEGER;
ALTER TABLE "CrmCentreProduit" ADD COLUMN IF NOT EXISTS "datePromiseInitiale" TIMESTAMP(3);
ALTER TABLE "CrmCentreProduit" ADD COLUMN IF NOT EXISTS "miseEnProductionLe" TIMESTAMP(3);
ALTER TABLE "CrmCentreProduit" ADD COLUMN IF NOT EXISTS "suiviRenforceJusquAu" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "CrmCentreProduit_vagueId_idx" ON "CrmCentreProduit"("vagueId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmVague_organisationId_fkey') THEN
    ALTER TABLE "CrmVague" ADD CONSTRAINT "CrmVague_organisationId_fkey" FOREIGN KEY ("organisationId")
      REFERENCES "CrmOrganisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmCentreProduit_vagueId_fkey') THEN
    ALTER TABLE "CrmCentreProduit" ADD CONSTRAINT "CrmCentreProduit_vagueId_fkey" FOREIGN KEY ("vagueId")
      REFERENCES "CrmVague"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
UPDATE "CrmCentreProduit" r SET "datePromiseInitiale" = COALESCE(
  (SELECT (e.avant->>'datePromise')::timestamp FROM "CrmEvenement" e
    WHERE e.type = 'DATE_PROMISE_CHANGEE' AND e."centreProduitId" = r.id AND e.avant->>'datePromise' IS NOT NULL
    ORDER BY e."surveneuLe", e.id LIMIT 1),
  (SELECT (e.apres->>'datePromise')::timestamp FROM "CrmEvenement" e
    WHERE e.type = 'DATE_PROMISE_CHANGEE' AND e."centreProduitId" = r.id AND e.apres->>'datePromise' IS NOT NULL
    ORDER BY e."surveneuLe", e.id LIMIT 1), r."datePromise")
WHERE r."datePromiseInitiale" IS NULL AND r."datePromise" IS NOT NULL;
