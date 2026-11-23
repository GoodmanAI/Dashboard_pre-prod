-- Reprise du parc (CHOIX.md, C-60). Additif et idempotent, aucun miroir modifié.
--
-- Trois types de journal : on ajoute des valeurs, on n'en renomme aucune.
-- ALTER TYPE ... ADD VALUE n'est suivi d'aucun usage dans ce fichier.
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'COMPTE_REPRIS';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'COMPTE_ECARTE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'COMPTE_REAFFICHE';

-- La décision humaine de ne pas suivre un compte du Dashboard (démonstration,
-- entraînement, test). Un compte n'est écarté qu'une fois.
CREATE TABLE IF NOT EXISTS "CrmCompteEcarte" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "raison" TEXT NOT NULL,
  "auteurId" INTEGER,
  "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmCompteEcarte_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmCompteEcarte_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmCompteEcarte_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrmCompteEcarte_userId_key" ON "CrmCompteEcarte"("userId");
