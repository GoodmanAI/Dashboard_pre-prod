-- ---------------------------------------------------------------------------
-- Lyrae Pilot — création des tables du CRM interne.
--
-- Contexte : Pilot vit dans l'espace admin du Dashboard et y possède ses propres
-- tables, toutes préfixées "Crm". Elles ne contiennent aucune donnée patient :
-- organisations, contacts professionnels, contrats, agrégats.
--
-- Convention du dépôt dashboard : migration SQL manuelle, idempotente et
-- additive, appliquée en production par
--     psql "$DATABASE_URL" -f prisma/migrations/manual/2026_10_26_crm_pilot.sql
-- Ne jamais la recréer via `prisma migrate dev` : la commande proposerait un
-- DROP des neuf tables manuelles déjà en place.
--
-- Dépendances : les tables "User", "Product" et "UserProduct" du Dashboard
-- doivent exister. Ce fichier ne les crée pas et ne les modifie pas.
-- Pilot lit ces tables, il ne les écrit jamais.
-- ---------------------------------------------------------------------------

-- Énumérations ---------------------------------------------------------------
-- Règle transverse n° 2 : on ajoute des valeurs, on n'en renomme jamais une.

DO $$ BEGIN
  CREATE TYPE "CrmEtapeCommerciale" AS ENUM (
    'PROSPECT', 'POURPARLERS', 'VISIO_TECHNIQUE', 'PROPOSITION',
    'SIGNE', 'EN_INTEGRATION', 'EN_PRODUCTION', 'ARRETE',
    'PERDU', 'EN_SOMMEIL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CrmTypeOrganisation" AS ENUM ('GROUPE_PRIVE', 'HOPITAL', 'GIE', 'CABINET');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CrmTypeEchange" AS ENUM (
    'VISIO_POURPARLERS', 'VISIO_TECHNIQUE', 'DEMO', 'MAIL', 'APPEL',
    'DEVIS_ENVOYE', 'RELANCE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CrmRoleDecision" AS ENUM (
    'DECIDEUR', 'PRESCRIPTEUR', 'UTILISATEUR', 'TECHNIQUE', 'INCONNU'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CrmCleEtape" AS ENUM (
    'PREMIERE_VISIO', 'VISIO_TECHNIQUE', 'JETON_XPLORE', 'CODE_CENTRE',
    'MAPPING_EXAMENS', 'REGLAGES_ROBOT', 'INTERFACAGE_TELEPHONIQUE',
    'INTEGRATION_SITE_WEB', 'FORMATION_SECRETAIRES', 'PREMIER_APPEL_REEL',
    'PASSAGE_PRODUCTION'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CrmModeCochage" AS ENUM ('MANUEL', 'AUTOMATIQUE', 'MIXTE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CrmTypeLigne" AS ENUM ('MISE_EN_SERVICE', 'ABONNEMENT', 'PART_VARIABLE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CrmUniteVariable" AS ENUM ('APPEL_TRAITE', 'RDV_PRIS', 'SMS_ENVOYE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CrmStatutContrat" AS ENUM ('BROUILLON', 'ACTIF', 'TERMINE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Organisations --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "CrmOrganisation" (
  "id"                 SERIAL PRIMARY KEY,
  "raisonSocialeNom"   TEXT NOT NULL,
  "type"               "CrmTypeOrganisation" NOT NULL,
  "etape"              "CrmEtapeCommerciale" NOT NULL DEFAULT 'PROSPECT',
  "raisonSortie"       TEXT,
  "dateSortie"         TIMESTAMP(3),
  "ris"                TEXT,
  "nombreSites"        INTEGER,
  "nombreSalles"       INTEGER,
  "volumeAppelsEstime" INTEGER,
  "utilisateurId"      INTEGER,
  "responsableId"      INTEGER,
  "dernierEchangeLe"   TIMESTAMP(3),
  "creeLe"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CrmOrganisation_etape_idx" ON "CrmOrganisation"("etape");
CREATE INDEX IF NOT EXISTS "CrmOrganisation_responsableId_idx" ON "CrmOrganisation"("responsableId");
CREATE INDEX IF NOT EXISTS "CrmOrganisation_dernierEchangeLe_idx" ON "CrmOrganisation"("dernierEchangeLe");

-- Contacts -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "CrmContact" (
  "id"             SERIAL PRIMARY KEY,
  "organisationId" INTEGER NOT NULL,
  "nom"            TEXT NOT NULL,
  "fonction"       TEXT,
  "email"          TEXT,
  "telephone"      TEXT,
  "roleDecision"   "CrmRoleDecision" NOT NULL DEFAULT 'INCONNU',
  "principal"      BOOLEAN NOT NULL DEFAULT false,
  "notes"          TEXT,
  "creeLe"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CrmContact_organisationId_idx" ON "CrmContact"("organisationId");

-- Centres --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "CrmCentre" (
  "id"             SERIAL PRIMARY KEY,
  "organisationId" INTEGER NOT NULL,
  "nom"            TEXT NOT NULL,
  "codeSite"       TEXT,
  "ville"          TEXT,
  "creeLe"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CrmCentre_organisationId_idx" ON "CrmCentre"("organisationId");
CREATE UNIQUE INDEX IF NOT EXISTS "CrmCentre_organisationId_nom_key" ON "CrmCentre"("organisationId", "nom");

-- Rattachement d'un centre à un produit, et au UserProduct qui le porte -------

CREATE TABLE IF NOT EXISTS "CrmCentreProduit" (
  "id"            SERIAL PRIMARY KEY,
  "centreId"      INTEGER NOT NULL,
  "productId"     INTEGER NOT NULL,
  "userProductId" INTEGER,
  "datePromise"   TIMESTAMP(3),
  "creeLe"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmCentreProduit_centreId_productId_key" ON "CrmCentreProduit"("centreId", "productId");
CREATE INDEX IF NOT EXISTS "CrmCentreProduit_userProductId_idx" ON "CrmCentreProduit"("userProductId");

-- Échanges -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "CrmEchange" (
  "id"                SERIAL PRIMARY KEY,
  "organisationId"    INTEGER NOT NULL,
  "contactId"         INTEGER,
  "type"              "CrmTypeEchange" NOT NULL,
  "surveneuLe"        TIMESTAMP(3) NOT NULL,
  "compteRendu"       TEXT,
  "prochaineAction"   TEXT,
  "prochaineActionLe" TIMESTAMP(3),
  "auteurId"          INTEGER,
  "creeLe"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CrmEchange_organisationId_surveneuLe_idx" ON "CrmEchange"("organisationId", "surveneuLe");
CREATE INDEX IF NOT EXISTS "CrmEchange_prochaineActionLe_idx" ON "CrmEchange"("prochaineActionLe");

-- Check-list d'intégration ---------------------------------------------------
-- Une ligne par centre, produit et étape. Les lignes dont le mode est
-- AUTOMATIQUE sont écrites par l'évaluateur, jamais par un humain.

CREATE TABLE IF NOT EXISTS "CrmEtapeIntegration" (
  "id"          SERIAL PRIMARY KEY,
  "centreId"    INTEGER NOT NULL,
  "productId"   INTEGER NOT NULL,
  "cle"         "CrmCleEtape" NOT NULL,
  "mode"        "CrmModeCochage" NOT NULL,
  "faite"       BOOLEAN NOT NULL DEFAULT false,
  "faiteLe"     TIMESTAMP(3),
  "auteurId"    INTEGER,
  "motif"       TEXT,
  "commentaire" TEXT,
  "evalueeLe"   TIMESTAMP(3),
  "creeLe"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmEtapeIntegration_centreId_productId_cle_key" ON "CrmEtapeIntegration"("centreId", "productId", "cle");
CREATE INDEX IF NOT EXISTS "CrmEtapeIntegration_productId_cle_idx" ON "CrmEtapeIntegration"("productId", "cle");
CREATE INDEX IF NOT EXISTS "CrmEtapeIntegration_faite_idx" ON "CrmEtapeIntegration"("faite");

-- Contrats -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "CrmContrat" (
  "id"             SERIAL PRIMARY KEY,
  "organisationId" INTEGER NOT NULL,
  "reference"      TEXT,
  "statut"         "CrmStatutContrat" NOT NULL DEFAULT 'BROUILLON',
  "signeLe"        TIMESTAMP(3),
  "debuteLe"       TIMESTAMP(3),
  "termineLe"      TIMESTAMP(3),
  "renouvelleLe"   TIMESTAMP(3),
  "creeLe"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CrmContrat_organisationId_idx" ON "CrmContrat"("organisationId");
CREATE INDEX IF NOT EXISTS "CrmContrat_statut_idx" ON "CrmContrat"("statut");

-- Lignes de contrat ----------------------------------------------------------
-- Les montants sont en centimes, en entiers. Jamais de flottant pour de l'argent.

CREATE TABLE IF NOT EXISTS "CrmLigneContrat" (
  "id"              SERIAL PRIMARY KEY,
  "contratId"       INTEGER NOT NULL,
  "productId"       INTEGER NOT NULL,
  "centreId"        INTEGER,
  "type"            "CrmTypeLigne" NOT NULL,
  "montantCentimes" INTEGER NOT NULL DEFAULT 0,
  "unite"           "CrmUniteVariable",
  "volumeInclus"    INTEGER,
  "libelle"         TEXT,
  "creeLe"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CrmLigneContrat_contratId_idx" ON "CrmLigneContrat"("contratId");
CREATE INDEX IF NOT EXISTS "CrmLigneContrat_productId_idx" ON "CrmLigneContrat"("productId");

-- Opportunités ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "CrmOpportunite" (
  "id"                           SERIAL PRIMARY KEY,
  "organisationId"               INTEGER NOT NULL,
  "productId"                    INTEGER NOT NULL,
  "libelle"                      TEXT,
  "montantMensuelCentimes"       INTEGER NOT NULL DEFAULT 0,
  "montantMiseEnServiceCentimes" INTEGER NOT NULL DEFAULT 0,
  "probabilite"                  INTEGER NOT NULL DEFAULT 0,
  "probabiliteForcee"            BOOLEAN NOT NULL DEFAULT false,
  "demarrageAttenduLe"           TIMESTAMP(3),
  "gagneeLe"                     TIMESTAMP(3),
  "perdueLe"                     TIMESTAMP(3),
  "raisonPerte"                  TEXT,
  "creeLe"                       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe"                        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CrmOpportunite_organisationId_idx" ON "CrmOpportunite"("organisationId");
CREATE INDEX IF NOT EXISTS "CrmOpportunite_demarrageAttenduLe_idx" ON "CrmOpportunite"("demarrageAttenduLe");

-- Scénarios ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "CrmScenario" (
  "id"       SERIAL PRIMARY KEY,
  "nom"      TEXT NOT NULL,
  "notes"    TEXT,
  "auteurId" INTEGER,
  "creeLe"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmScenario_nom_key" ON "CrmScenario"("nom");

CREATE TABLE IF NOT EXISTS "CrmScenarioOpportunite" (
  "id"                SERIAL PRIMARY KEY,
  "scenarioId"        INTEGER NOT NULL,
  "opportuniteId"     INTEGER NOT NULL,
  "cochee"            BOOLEAN NOT NULL DEFAULT true,
  "demarrageDecaleLe" TIMESTAMP(3)
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmScenarioOpportunite_scenarioId_opportuniteId_key" ON "CrmScenarioOpportunite"("scenarioId", "opportuniteId");

-- Clés étrangères ------------------------------------------------------------
-- Ajoutées à part, en ignorant le doublon : ADD CONSTRAINT n'a pas de IF NOT
-- EXISTS en PostgreSQL.

DO $$ BEGIN
  ALTER TABLE "CrmOrganisation"
    ADD CONSTRAINT "CrmOrganisation_utilisateurId_fkey"
    FOREIGN KEY ("utilisateurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmOrganisation"
    ADD CONSTRAINT "CrmOrganisation_responsableId_fkey"
    FOREIGN KEY ("responsableId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmContact"
    ADD CONSTRAINT "CrmContact_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "CrmOrganisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmCentre"
    ADD CONSTRAINT "CrmCentre_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "CrmOrganisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmCentreProduit"
    ADD CONSTRAINT "CrmCentreProduit_centreId_fkey"
    FOREIGN KEY ("centreId") REFERENCES "CrmCentre"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmCentreProduit"
    ADD CONSTRAINT "CrmCentreProduit_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmCentreProduit"
    ADD CONSTRAINT "CrmCentreProduit_userProductId_fkey"
    FOREIGN KEY ("userProductId") REFERENCES "UserProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmEchange"
    ADD CONSTRAINT "CrmEchange_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "CrmOrganisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmEchange"
    ADD CONSTRAINT "CrmEchange_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmEchange"
    ADD CONSTRAINT "CrmEchange_auteurId_fkey"
    FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmEtapeIntegration"
    ADD CONSTRAINT "CrmEtapeIntegration_centreId_fkey"
    FOREIGN KEY ("centreId") REFERENCES "CrmCentre"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmEtapeIntegration"
    ADD CONSTRAINT "CrmEtapeIntegration_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmEtapeIntegration"
    ADD CONSTRAINT "CrmEtapeIntegration_auteurId_fkey"
    FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmContrat"
    ADD CONSTRAINT "CrmContrat_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "CrmOrganisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmLigneContrat"
    ADD CONSTRAINT "CrmLigneContrat_contratId_fkey"
    FOREIGN KEY ("contratId") REFERENCES "CrmContrat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmLigneContrat"
    ADD CONSTRAINT "CrmLigneContrat_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmLigneContrat"
    ADD CONSTRAINT "CrmLigneContrat_centreId_fkey"
    FOREIGN KEY ("centreId") REFERENCES "CrmCentre"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmOpportunite"
    ADD CONSTRAINT "CrmOpportunite_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "CrmOrganisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmOpportunite"
    ADD CONSTRAINT "CrmOpportunite_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmScenario"
    ADD CONSTRAINT "CrmScenario_auteurId_fkey"
    FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmScenarioOpportunite"
    ADD CONSTRAINT "CrmScenarioOpportunite_scenarioId_fkey"
    FOREIGN KEY ("scenarioId") REFERENCES "CrmScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmScenarioOpportunite"
    ADD CONSTRAINT "CrmScenarioOpportunite_opportuniteId_fkey"
    FOREIGN KEY ("opportuniteId") REFERENCES "CrmOpportunite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
