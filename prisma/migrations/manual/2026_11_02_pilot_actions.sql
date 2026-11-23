-- Pilot : actions, qualification et rendez-vous. Additif et rejouable.
-- Aucun miroir Dashboard n'est modifié. Les valeurs ajoutées à CrmTypeEchange
-- ne sont pas utilisées dans cette transaction implicite.
DO $$ BEGIN
  CREATE TYPE "CrmRaisonSortie" AS ENUM ('PRIX', 'CONCURRENT', 'PAS_DE_BUDGET', 'RIS_INCOMPATIBLE', 'TIMING', 'SANS_REPONSE', 'AUTRE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "CrmAttitude" AS ENUM ('SOUTIEN', 'NEUTRE', 'OPPOSANT', 'INCONNU');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "CrmStatutEchange" AS ENUM ('PLANIFIE', 'REALISE', 'ANNULE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE "CrmTypeEchange" ADD VALUE IF NOT EXISTS 'JALON';
ALTER TYPE "CrmTypeEchange" ADD VALUE IF NOT EXISTS 'FORMATION';
ALTER TYPE "CrmTypeEchange" ADD VALUE IF NOT EXISTS 'VISITE';

ALTER TABLE "CrmEchange"
  ADD COLUMN IF NOT EXISTS "statut" "CrmStatutEchange" NOT NULL DEFAULT 'REALISE',
  ADD COLUMN IF NOT EXISTS "prochaineActionFaiteLe" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "CrmEchange_statut_surveneuLe_idx" ON "CrmEchange"("statut", "surveneuLe");

ALTER TABLE "CrmOrganisation"
  ADD COLUMN IF NOT EXISTS "raisonSortieCode" "CrmRaisonSortie",
  ADD COLUMN IF NOT EXISTS "reveilLe" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "decisionAttendueLe" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "solutionActuelle" TEXT,
  ADD COLUMN IF NOT EXISTS "qualifBesoin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "qualifDecideur" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "qualifBudget" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "qualifCalendrier" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "qualifSolutionActuelle" BOOLEAN NOT NULL DEFAULT false;

-- Le rattrapage historique n'a lieu qu'à la création des colonnes.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'CrmOrganisation' AND column_name = 'prochaineAction') THEN
    ALTER TABLE "CrmOrganisation" ADD COLUMN "prochaineAction" TEXT;
    ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "prochaineActionLe" TIMESTAMP(3);
    UPDATE "CrmOrganisation" o SET
      "prochaineAction" = CASE WHEN e."prochaineActionFaiteLe" IS NULL THEN btrim(e."prochaineAction") END,
      "prochaineActionLe" = CASE WHEN e."prochaineActionFaiteLe" IS NULL THEN e."prochaineActionLe" END
    FROM (SELECT DISTINCT ON ("organisationId") "organisationId", "prochaineAction", "prochaineActionLe", "prochaineActionFaiteLe"
      FROM "CrmEchange" WHERE "statut" = 'REALISE' AND btrim(COALESCE("prochaineAction", '')) <> ''
      ORDER BY "organisationId", "surveneuLe" DESC, id DESC) e
    WHERE o.id = e."organisationId";
  END IF;
END $$;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "prochaineActionLe" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "CrmOrganisation_prochaineActionLe_idx" ON "CrmOrganisation"("prochaineActionLe");
CREATE INDEX IF NOT EXISTS "CrmOrganisation_reveilLe_idx" ON "CrmOrganisation"("reveilLe");

ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "attitude" "CrmAttitude" NOT NULL DEFAULT 'INCONNU';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'CrmContact' AND column_name = 'dernierContactLe') THEN
    ALTER TABLE "CrmContact" ADD COLUMN "dernierContactLe" TIMESTAMP(3);
    UPDATE "CrmContact" c SET "dernierContactLe" = e.dernier
    FROM (SELECT "contactId", max("surveneuLe") AS dernier FROM "CrmEchange"
      WHERE "statut" = 'REALISE' GROUP BY "contactId") e WHERE c.id = e."contactId";
  END IF;
END $$;
