-- Apport d'affaires (CHOIX.md, C-63). Additif et idempotent, aucun miroir modifié.
--
-- Reprend le calculateur des apporteurs : qui a apporté quel groupe, la fiche de
-- signalement, les sites et leurs salles, le parcours de commande, les
-- commissions par palier et les factures des apporteurs. Un groupe apporté est
-- un client de Pilot (CrmOrganisation) : aucune deuxième fiche client.
--
-- Les listes (statuts, décisions, modalités, catégories) sont du texte, leurs
-- libellés vivent dans src/lib/apports/referentiel.ts, comme la fiche client
-- (C-59). Les codes ne se renomment jamais. L'argent est en centimes, les taux
-- en points de base (1 % = 100).

ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'APPORT_CREE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'APPORT_MODIFIE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'APPORT_RETIRE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'FACTURE_APPORT_CHANGEE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'APPORTEURS_MODIFIES';

-- Les apporteurs d'affaires, et leur identité de facturation.
CREATE TABLE IF NOT EXISTS "CrmApporteur" (
  "id" SERIAL NOT NULL,
  "nom" TEXT NOT NULL,
  "structure" TEXT,
  "telephone" TEXT,
  "email" TEXT,
  "adresse" TEXT,
  "siret" TEXT,
  "rcs" TEXT,
  "tvaIntracom" TEXT,
  "prefixeFacture" TEXT,
  "mention" TEXT,
  "commissionne" BOOLEAN NOT NULL DEFAULT true,
  "ordre" INTEGER NOT NULL DEFAULT 0,
  -- Identifiant d'origine dans le calculateur, pour qu'un second import retrouve la même ligne.
  "cleImport" TEXT,
  "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmApporteur_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrmApporteur_cleImport_key" ON "CrmApporteur"("cleImport");

-- Une seule ligne de réglages : grille tarifaire, paliers, calendrier, client facturé.
CREATE TABLE IF NOT EXISTS "CrmParametresApport" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "talkTtcCentimes" INTEGER NOT NULL DEFAULT 32500,
  "konnectTtcCentimes" INTEGER NOT NULL DEFAULT 9500,
  "tvaPdm" INTEGER NOT NULL DEFAULT 2000,
  "connecteurRisPdm" INTEGER NOT NULL DEFAULT 1500,
  "installationTalkCentimes" INTEGER NOT NULL DEFAULT 75000,
  "installationKonnectCentimes" INTEGER NOT NULL DEFAULT 45000,
  "modeInstallation" TEXT NOT NULL DEFAULT 'site',
  "seuil1Centimes" INTEGER NOT NULL DEFAULT 400000,
  "seuil2Centimes" INTEGER NOT NULL DEFAULT 1250000,
  "taux1Pdm" INTEGER NOT NULL DEFAULT 250,
  "taux2Pdm" INTEGER NOT NULL DEFAULT 500,
  "taux3Pdm" INTEGER NOT NULL DEFAULT 1000,
  "autresClientsCentimes" INTEGER NOT NULL DEFAULT 0,
  "delaiEncaissementMois" INTEGER NOT NULL DEFAULT 1,
  "dureeCommissionMois" INTEGER NOT NULL DEFAULT 0,
  "horizonMois" INTEGER NOT NULL DEFAULT 18,
  "inclureValidees" BOOLEAN NOT NULL DEFAULT true,
  "inclureBcEnvoyes" BOOLEAN NOT NULL DEFAULT true,
  "inclureProspects" BOOLEAN NOT NULL DEFAULT false,
  "tvaFacturePdm" INTEGER NOT NULL DEFAULT 2000,
  "delaiPaiementJours" INTEGER NOT NULL DEFAULT 15,
  "clientNom" TEXT NOT NULL DEFAULT 'Neuracorp AI, SAS',
  "clientAdresse" TEXT NOT NULL DEFAULT '17 rue de la Marine, 56950 Crach',
  "clientRcs" TEXT NOT NULL DEFAULT 'RCS Lorient 933 852 717',
  "typesPrestataires" TEXT[] NOT NULL DEFAULT ARRAY['DSI Groupe', 'Presta Informatique', 'Presta Téléphonie', 'Opérateur Téléphonie']::TEXT[],
  "apporteurParDefautId" INTEGER,
  "majLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmParametresApport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmParametresApport_une_ligne" CHECK ("id" = 1),
  CONSTRAINT "CrmParametresApport_apporteurParDefautId_fkey" FOREIGN KEY ("apporteurParDefautId") REFERENCES "CrmApporteur"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- L'apport d'un groupe : une ligne par client apporté, la fiche de signalement
-- (annexe 2 du contrat d'apporteur), la décision, le parcours de commande et
-- les offres validées au niveau du groupe.
CREATE TABLE IF NOT EXISTS "CrmApport" (
  "id" SERIAL NOT NULL,
  "organisationId" INTEGER NOT NULL,
  "apporteurId" INTEGER NOT NULL,
  "coApporteurId" INTEGER,
  "coApporteurPart" INTEGER NOT NULL DEFAULT 30,
  "denominationSociale" TEXT,
  "siren" TEXT,
  "adresseSiege" TEXT,
  "categorie" TEXT,
  "investisseur" TEXT,
  "precisionCategorie" TEXT,
  "signaleLe" TIMESTAMP(3),
  "besoin" TEXT,
  "risCodeClient" TEXT,
  "risCodesSites" TEXT,
  "risCommercial" TEXT,
  "risCommercialTelephone" TEXT,
  "risCommercialEmail" TEXT,
  "perimetre" TEXT NOT NULL DEFAULT 'sites',
  "decision" TEXT NOT NULL DEFAULT 'attente',
  "decisionLe" TIMESTAMP(3),
  "deploiementPrevuLe" TIMESTAMP(3),
  "observations" TEXT,
  "offreTalk" BOOLEAN NOT NULL DEFAULT false,
  "offreKonnect" BOOLEAN NOT NULL DEFAULT false,
  "offreConnecteurRis" BOOLEAN NOT NULL DEFAULT false,
  "bcEnvoyeLe" TIMESTAMP(3),
  "commandeValideeLe" TIMESTAMP(3),
  "commandeInstalleeLe" TIMESTAMP(3),
  "cleImport" TEXT,
  "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmApport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmApport_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "CrmOrganisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmApport_apporteurId_fkey" FOREIGN KEY ("apporteurId") REFERENCES "CrmApporteur"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CrmApport_coApporteurId_fkey" FOREIGN KEY ("coApporteurId") REFERENCES "CrmApporteur"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrmApport_organisationId_key" ON "CrmApport"("organisationId");
CREATE UNIQUE INDEX IF NOT EXISTS "CrmApport_cleImport_key" ON "CrmApport"("cleImport");
CREATE INDEX IF NOT EXISTS "CrmApport_apporteurId_idx" ON "CrmApport"("apporteurId");
CREATE INDEX IF NOT EXISTS "CrmApport_coApporteurId_idx" ON "CrmApport"("coApporteurId");

-- Le site gagne ce que la fiche de signalement demande : sa localisation, son
-- RIS et les offres envisagées.
ALTER TABLE "CrmCentre" ADD COLUMN IF NOT EXISTS "adresse" TEXT;
ALTER TABLE "CrmCentre" ADD COLUMN IF NOT EXISTS "ris" TEXT;
ALTER TABLE "CrmCentre" ADD COLUMN IF NOT EXISTS "offreTalk" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CrmCentre" ADD COLUMN IF NOT EXISTS "offreKonnect" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CrmCentre" ADD COLUMN IF NOT EXISTS "offreConnecteurRis" BOOLEAN NOT NULL DEFAULT false;

-- Les salles d'un site, une par ligne, avec leur modalité.
CREATE TABLE IF NOT EXISTS "CrmSalle" (
  "id" SERIAL NOT NULL,
  "centreId" INTEGER NOT NULL,
  "libelle" TEXT NOT NULL,
  "modalite" TEXT NOT NULL,
  "ordre" INTEGER NOT NULL DEFAULT 0,
  "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmSalle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmSalle_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "CrmCentre"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CrmSalle_centreId_idx" ON "CrmSalle"("centreId");

-- Les prestataires du client : DSI, informatique, téléphonie. Contacts
-- professionnels, jamais repris dans le journal (C-27).
CREATE TABLE IF NOT EXISTS "CrmPrestataire" (
  "id" SERIAL NOT NULL,
  "organisationId" INTEGER NOT NULL,
  "type" TEXT,
  "societe" TEXT,
  "nom" TEXT,
  "telephone" TEXT,
  "email" TEXT,
  "commentaire" TEXT,
  "ordre" INTEGER NOT NULL DEFAULT 0,
  "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmPrestataire_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmPrestataire_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "CrmOrganisation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CrmPrestataire_organisationId_idx" ON "CrmPrestataire"("organisationId");

-- La facture mensuelle d'un apporteur : une par apporteur et par mois
-- d'encaissement. Une facture émise est figée : ses montants ne bougent plus.
-- "encaissements" : montant réellement encaissé par groupe, en centimes, quand
-- il diffère du théorique. "fige" : la facture telle qu'émise.
CREATE TABLE IF NOT EXISTS "CrmFactureApport" (
  "id" SERIAL NOT NULL,
  "apporteurId" INTEGER NOT NULL,
  "mois" TIMESTAMP(3) NOT NULL,
  "statut" TEXT NOT NULL DEFAULT 'a_emettre',
  "numero" TEXT,
  "emiseLe" TIMESTAMP(3),
  "echeanceLe" TIMESTAMP(3),
  "payeeLe" TIMESTAMP(3),
  "encaissements" JSONB NOT NULL DEFAULT '{}',
  "fige" JSONB,
  "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmFactureApport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmFactureApport_apporteurId_fkey" FOREIGN KEY ("apporteurId") REFERENCES "CrmApporteur"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrmFactureApport_apporteurId_mois_key" ON "CrmFactureApport"("apporteurId", "mois");
