-- Comptes de l'équipe et droits (CHOIX.md, C-64). Additif et idempotent.
--
-- Pilot crée les comptes de l'équipe Lyrae dans la table User du Dashboard
-- (exception écrite en C-64, à remplacer par la création de compte du Dashboard
-- à l'intégration) ; le rôle dans Pilot et les droits vivent ici, dans une
-- table à lui. Aucune colonne du miroir n'est ajoutée.
--
-- ALTER TYPE ... ADD VALUE n'est suivi d'aucun usage dans ce fichier.
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'COMPTE_CREE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'ACCES_MODIFIE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'ACCES_RETIRE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'ACCES_RENDU';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'MOT_DE_PASSE_REINITIALISE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'MOT_DE_PASSE_CHANGE';

-- Le rôle dans Pilot. Le super-administrateur reste SUPER_ADMIN du Dashboard.
DO $$ BEGIN
  CREATE TYPE "CrmProfilPilot" AS ENUM ('DEVELOPPEUR', 'GERANT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Les droits cochés compte par compte. On ajoute des valeurs, on n'en renomme aucune.
DO $$ BEGIN
  CREATE TYPE "CrmDroitPilot" AS ENUM ('VOIR_CA', 'EXPORTER_CA', 'MODIFIER_MONTANTS', 'EVALUER_PARC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Une ligne par compte ADMIN. Sans ligne, le compte est traité en développeur
-- avec les droits par défaut de ce rôle : rien n'ouvre le chiffre d'affaires
-- tant que le super-administrateur ne l'a pas décidé.
CREATE TABLE IF NOT EXISTS "CrmAccesPilot" (
  "userId" INTEGER NOT NULL,
  "profil" "CrmProfilPilot" NOT NULL,
  "droits" "CrmDroitPilot"[] NOT NULL DEFAULT ARRAY[]::"CrmDroitPilot"[],
  "motDePasseProvisoire" BOOLEAN NOT NULL DEFAULT false,
  "retireLe" TIMESTAMP(3),
  "creeParId" INTEGER,
  "modifieParId" INTEGER,
  "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmAccesPilot_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "CrmAccesPilot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmAccesPilot_creeParId_fkey" FOREIGN KEY ("creeParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CrmAccesPilot_modifieParId_fkey" FOREIGN KEY ("modifieParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
