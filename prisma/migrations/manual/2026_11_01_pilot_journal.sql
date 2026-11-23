-- ---------------------------------------------------------------------------
-- Lyrae Pilot — journal des événements et responsables d'intégration.
--
-- Contexte : Pilot vit dans l'espace admin du Dashboard et y possède ses propres
-- tables, toutes préfixées "Crm". Elles ne contiennent aucune donnée patient :
-- organisations, contacts professionnels, contrats, agrégats.
--
-- Convention du dépôt dashboard : migration SQL manuelle, idempotente et
-- additive, appliquée en production par
--     psql "$DATABASE_URL" -f prisma/migrations/manual/2026_11_01_pilot_journal.sql
-- Ne jamais la recréer via `prisma migrate dev` : la commande proposerait un
-- DROP des neuf tables manuelles déjà en place.
--
-- Dépendances : "User" et "CrmOrganisation" doivent exister.
-- Ce fichier ne crée ni ne modifie les miroirs du Dashboard.
-- Pilot lit ces tables, il ne les écrit jamais.
-- ---------------------------------------------------------------------------

-- Énumérations ---------------------------------------------------------------
-- On ajoute, on ne renomme jamais.
DO $$ BEGIN
  CREATE TYPE "CrmTypeEvenement" AS ENUM (
    'ORGANISATION_CREEE', 'ORGANISATION_MODIFIEE', 'ETAPE_COMMERCIALE_CHANGEE',
    'CONTACT_AJOUTE', 'CONTACT_MODIFIE', 'CONTACT_SUPPRIME', 'CENTRE_CREE',
    'RATTACHEMENT_CREE', 'DATE_PROMISE_CHANGEE', 'ETAPE_INTEGRATION_COCHEE',
    'ETAPE_INTEGRATION_DECOCHEE', 'ETAPE_INTEGRATION_REGRESSION',
    'ATTENTE_TIERS_CHANGEE', 'ECHANGE_SAISI', 'ECHANGE_MODIFIE',
    'PROCHAINE_ACTION_CHANGEE', 'PROPOSITION_CREEE', 'PROPOSITION_STATUT_CHANGE',
    'CONTRAT_CREE', 'CONTRAT_MODIFIE', 'OPPORTUNITE_CREEE', 'OPPORTUNITE_MODIFIEE',
    'SCENARIO_ENREGISTRE', 'ALERTE_ACQUITTEE', 'CA_MENSUEL_FIGE', 'IMPORT_EXECUTE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Organisations --------------------------------------------------------------
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "chefDeProjetId" INTEGER;

-- L'approximation historique ne se fait qu'à l'ajout de la colonne : rejouer
-- cette migration ne doit jamais effacer une date posée par changerEtape.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'CrmOrganisation'
      AND column_name = 'etapeDepuisLe'
  ) THEN
    ALTER TABLE "CrmOrganisation"
      ADD COLUMN "etapeDepuisLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    UPDATE "CrmOrganisation" SET "etapeDepuisLe" = COALESCE("dateSortie", "creeLe");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "CrmOrganisation_chefDeProjetId_idx" ON "CrmOrganisation"("chefDeProjetId");

-- Journal --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CrmEvenement" (
  "id"                 SERIAL NOT NULL,
  "type"               "CrmTypeEvenement" NOT NULL,
  "organisationId"     INTEGER,
  "centreId"           INTEGER,
  "centreProduitId"    INTEGER,
  "etapeIntegrationId" INTEGER,
  "echangeId"          INTEGER,
  "propositionId"      INTEGER,
  "contratId"          INTEGER,
  "opportuniteId"      INTEGER,
  "auteurId"           INTEGER,
  "resume"             TEXT NOT NULL,
  "avant"              JSONB,
  "apres"              JSONB,
  "surveneuLe"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmEvenement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CrmEvenement_organisationId_surveneuLe_idx" ON "CrmEvenement"("organisationId", "surveneuLe");
CREATE INDEX IF NOT EXISTS "CrmEvenement_type_surveneuLe_idx" ON "CrmEvenement"("type", "surveneuLe");
CREATE INDEX IF NOT EXISTS "CrmEvenement_surveneuLe_idx" ON "CrmEvenement"("surveneuLe");

-- Clés étrangères ------------------------------------------------------------
-- Ajoutées à part, en ignorant le doublon : ADD CONSTRAINT n'a pas de IF NOT
-- EXISTS en PostgreSQL.
DO $$ BEGIN
  ALTER TABLE "CrmOrganisation"
    ADD CONSTRAINT "CrmOrganisation_chefDeProjetId_fkey"
    FOREIGN KEY ("chefDeProjetId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmEvenement"
    ADD CONSTRAINT "CrmEvenement_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "CrmOrganisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmEvenement"
    ADD CONSTRAINT "CrmEvenement_auteurId_fkey"
    FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
