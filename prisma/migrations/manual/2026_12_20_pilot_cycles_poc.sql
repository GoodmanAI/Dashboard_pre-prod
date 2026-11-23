-- C-94 : aucune reprise de données, aucun modèle miroir Dashboard.
DO $$ BEGIN
  CREATE TYPE "CrmIssueCyclePoc" AS ENUM
    ('VALIDE', 'NON_TRANSFORME', 'RETOUR_PROPOSITION', 'RETOUR_PROSPECTION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'CYCLE_POC_OUVERT';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'CYCLE_POC_CLOS';
-- Ne pas utiliser ces deux nouvelles valeurs dans ce fichier.

ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "pocCycleId" uuid;
CREATE UNIQUE INDEX IF NOT EXISTS "CrmOrganisation_pocCycleId_key"
  ON "CrmOrganisation" ("pocCycleId");

CREATE TABLE IF NOT EXISTS "CrmCyclePoc" (
  id uuid PRIMARY KEY,
  "organisationId" integer NOT NULL REFERENCES "CrmOrganisation"(id) ON DELETE CASCADE,
  "debuteLe" date NOT NULL,
  "prolongeLe" date,
  issue "CrmIssueCyclePoc" NOT NULL,
  "decideLe" timestamp(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "CrmCyclePoc_organisationId_decideLe_idx"
  ON "CrmCyclePoc" ("organisationId", "decideLe");
