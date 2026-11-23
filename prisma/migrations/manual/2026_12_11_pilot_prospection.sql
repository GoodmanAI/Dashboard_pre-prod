-- Prospection : la liste « À prospecter » et la fiche de saisie rapide (CHOIX.md, C-65).
-- Additif et idempotent.
--
-- Remplace le tableur de prospection partagé : priorité commerciale, coordonnées
-- de l'établissement, code postal du site (la région se déduit du département),
-- et un canal LinkedIn pour noter un échange.
--
-- ALTER TYPE ... ADD VALUE n'est suivi d'aucun usage dans ce fichier.
ALTER TYPE "CrmTypeEchange" ADD VALUE IF NOT EXISTS 'LINKEDIN';

-- La priorité du tableur des commerciaux : A+ d'abord, C en dernier. On ajoute
-- des valeurs, on n'en renomme aucune ; l'ordre de déclaration sert au tri.
DO $$ BEGIN
  CREATE TYPE "CrmPriorite" AS ENUM ('A_PLUS', 'A', 'B', 'C');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Coordonnées de l'établissement : standard, e-mail générique, site web.
-- Les personnes restent dans CrmContact.
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "priorite" "CrmPriorite";
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "telephone" TEXT;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "siteWeb" TEXT;
CREATE INDEX IF NOT EXISTS "CrmOrganisation_priorite_idx" ON "CrmOrganisation"("priorite");

-- L'adresse d'un prospect est celle de son site (C-63) : le code postal y vit aussi.
ALTER TABLE "CrmCentre" ADD COLUMN IF NOT EXISTS "codePostal" TEXT;
CREATE INDEX IF NOT EXISTS "CrmCentre_codePostal_idx" ON "CrmCentre"("codePostal");
