-- Écran Ventes (CHOIX.md, C-62). Additif et idempotent, aucun miroir modifié.
--
-- Un type d'échange : l'interfaçage se planifie et se confirme dans le journal,
-- comme la formation. On ajoute une valeur, on n'en renomme aucune.
-- ALTER TYPE ... ADD VALUE n'est suivi d'aucun usage dans ce fichier.
ALTER TYPE "CrmTypeEchange" ADD VALUE IF NOT EXISTS 'INTERFACAGE';

-- Comment le contrat se prolonge à la fin de sa durée.
DO $$ BEGIN
  CREATE TYPE "CrmReconduction" AS ENUM ('TACITE', 'EXPRESSE', 'AUCUNE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- L'essai précède le début officiel : il ne compte pas dans le chiffre
-- d'affaires, qui part de "debuteLe" (C-45). Les conditions tarifaires
-- particulières sont du texte libre : ni le résumé du journal ni les logs ne
-- les portent.
ALTER TABLE "CrmContrat" ADD COLUMN IF NOT EXISTS "essaiDebuteLe" TIMESTAMP(3);
ALTER TABLE "CrmContrat" ADD COLUMN IF NOT EXISTS "essaiJours" INTEGER;
ALTER TABLE "CrmContrat" ADD COLUMN IF NOT EXISTS "reconduction" "CrmReconduction";
ALTER TABLE "CrmContrat" ADD COLUMN IF NOT EXISTS "conditionsTarifaires" TEXT;
