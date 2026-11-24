-- Demandes d'action entre collègues (CHOIX.md, C-58). Additif et idempotent.
-- `precisions` et `reponse` sont du texte libre : ni le journal ni les logs
-- n'en portent de copie (C-22).

DO $$ BEGIN
  CREATE TYPE "CrmTypeDemande" AS ENUM (
    'RAPPELER_CLIENT', 'PLANIFIER_VISIO', 'PREPARER_DEVIS', 'VALIDER_REMISE',
    'RELANCER_EDL', 'OBTENIR_ACCES_RIS', 'FINIR_MAPPING', 'PARAMETRER_ROBOT',
    'TESTER_CRENEAUX', 'VERIFIER_TELEPHONIE', 'PLANIFIER_FORMATION',
    'ENVOYER_ACCES_DASHBOARD', 'PREPARER_MISE_EN_SERVICE', 'AUTRE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CrmStatutDemande" AS ENUM ('OUVERTE', 'FAITE', 'ANNULEE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'DEMANDE_CREEE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'DEMANDE_TRAITEE';

CREATE TABLE IF NOT EXISTS "CrmDemande" (
  "id" SERIAL NOT NULL,
  "organisationId" INTEGER NOT NULL,
  "centreProduitId" INTEGER,
  "etapeIntegrationId" INTEGER,
  "type" "CrmTypeDemande" NOT NULL,
  "precisions" TEXT,
  "demandeurId" INTEGER,
  "destinataireId" INTEGER NOT NULL,
  "echeanceLe" TIMESTAMP(3),
  "statut" "CrmStatutDemande" NOT NULL DEFAULT 'OUVERTE',
  "traiteeLe" TIMESTAMP(3),
  "reponse" TEXT,
  "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmDemande_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmDemande_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "CrmOrganisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmDemande_demandeurId_fkey" FOREIGN KEY ("demandeurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CrmDemande_destinataireId_fkey" FOREIGN KEY ("destinataireId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CrmDemande_destinataireId_statut_idx" ON "CrmDemande"("destinataireId", "statut");
CREATE INDEX IF NOT EXISTS "CrmDemande_demandeurId_statut_idx" ON "CrmDemande"("demandeurId", "statut");
CREATE INDEX IF NOT EXISTS "CrmDemande_organisationId_statut_idx" ON "CrmDemande"("organisationId", "statut");
