-- Concurrents et forçage de la température (lot R). Additif et idempotent,
-- aucun miroir modifié.
--
-- Le référentiel des concurrents (robots vocaux, centres d'appels, secrétariats
-- externalisés, éditeurs de prise de RDV), leurs prix relevés dans le temps, le
-- concurrent en place chez un prospect et celui qui a gagné une affaire perdue.
-- Le relevé en vigueur est le plus récent par date puis par id : rien n'est
-- stocké pour cela. La température d'un dossier se calcule à la lecture (C-08) :
-- seul le forçage humain est stocké, sur le modèle de probabiliteForcee (C-44).
-- L'argent est en centimes, en entiers.
--
-- Rejouable après `prisma db push` (npm run demarrer) : les noms d'index et de
-- clés étrangères sont ceux que Prisma donne.
--
-- ALTER TYPE ... ADD VALUE n'est suivi d'aucun usage dans ce fichier.
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'CONCURRENT_CREE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'CONCURRENT_MODIFIE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'CONCURRENT_SUPPRIME';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'RELEVE_CONCURRENT_AJOUTE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'RELEVE_CONCURRENT_MODIFIE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'RELEVE_CONCURRENT_SUPPRIME';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'TEMPERATURE_FORCEE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'TEMPERATURE_LIBEREE';

-- La famille d'un concurrent. On ajoute des valeurs, on n'en renomme aucune.
DO $$ BEGIN
  CREATE TYPE "CrmTypeConcurrent" AS ENUM ('ROBOT_VOCAL', 'CENTRE_APPELS', 'SECRETARIAT_EXTERNALISE', 'EDITEUR_RDV', 'AUTRE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- La température forcée d'un dossier. L'ordre de déclaration va du plus froid au plus chaud.
DO $$ BEGIN
  CREATE TYPE "CrmTemperature" AS ENUM ('FROID', 'TIEDE', 'CHAUD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Un concurrent. Nom unique, tel que saisi : la casse n'est pas comparée en base
-- (aucun précédent d'unicité insensible à la casse dans le dépôt).
-- offre, notes : texte libre, jamais dans le journal ni dans les logs (C-27).
CREATE TABLE IF NOT EXISTS "CrmConcurrent" (
  "id" SERIAL NOT NULL,
  "nom" TEXT NOT NULL,
  "type" "CrmTypeConcurrent" NOT NULL,
  "offre" TEXT,
  "siteWeb" TEXT,
  "notes" TEXT,
  "creeParId" INTEGER,
  "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmConcurrent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmConcurrent_creeParId_fkey" FOREIGN KEY ("creeParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrmConcurrent_nom_key" ON "CrmConcurrent"("nom");

-- Un relevé de prix d'un concurrent, daté. Montants facultatifs, en centimes,
-- jamais négatifs. conditions, source : texte libre, hors journal et logs.
CREATE TABLE IF NOT EXISTS "CrmReleveConcurrent" (
  "id" SERIAL NOT NULL,
  "concurrentId" INTEGER NOT NULL,
  "releveLe" TIMESTAMP(3) NOT NULL,
  "prixSalleMoisCentimes" INTEGER,
  "prixInstallationCentimes" INTEGER,
  "conditions" TEXT,
  "source" TEXT,
  "creeParId" INTEGER,
  "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmReleveConcurrent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmReleveConcurrent_concurrentId_fkey" FOREIGN KEY ("concurrentId") REFERENCES "CrmConcurrent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmReleveConcurrent_creeParId_fkey" FOREIGN KEY ("creeParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- La version d'un relevé, pour l'écriture conditionnelle de ses corrections (C-26).
-- Ajoutée aussi à part : une table créée avant elle (base de travail, `prisma db
-- push`) la reçoit, les relevés existants prennent l'instant de l'ajout.
ALTER TABLE "CrmReleveConcurrent" ADD COLUMN IF NOT EXISTS "majLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Le relevé en vigueur d'un concurrent : le premier dans cet ordre.
CREATE INDEX IF NOT EXISTS "CrmReleveConcurrent_concurrentId_releveLe_id_idx"
  ON "CrmReleveConcurrent"("concurrentId", "releveLe" DESC, "id" DESC);

-- Ajoutées à part pour qu'elles existent aussi sur une table créée par
-- `prisma db push`, qui ne connaît pas les CHECK.
DO $$ BEGIN
  ALTER TABLE "CrmReleveConcurrent"
    ADD CONSTRAINT "CrmReleveConcurrent_prixSalleMoisCentimes_positif"
    CHECK ("prixSalleMoisCentimes" IS NULL OR "prixSalleMoisCentimes" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmReleveConcurrent"
    ADD CONSTRAINT "CrmReleveConcurrent_prixInstallationCentimes_positif"
    CHECK ("prixInstallationCentimes" IS NULL OR "prixInstallationCentimes" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Le concurrent en place chez le prospect, et celui qui a gagné l'affaire
-- (sortie en Perdu, motif CONCURRENT). Supprimer un concurrent vide ces cases.
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "concurrentId" INTEGER;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "concurrentGagnantId" INTEGER;

DO $$ BEGIN
  ALTER TABLE "CrmOrganisation"
    ADD CONSTRAINT "CrmOrganisation_concurrentId_fkey"
    FOREIGN KEY ("concurrentId") REFERENCES "CrmConcurrent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmOrganisation"
    ADD CONSTRAINT "CrmOrganisation_concurrentGagnantId_fkey"
    FOREIGN KEY ("concurrentGagnantId") REFERENCES "CrmConcurrent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "CrmOrganisation_concurrentId_idx" ON "CrmOrganisation"("concurrentId");
CREATE INDEX IF NOT EXISTS "CrmOrganisation_concurrentGagnantId_idx" ON "CrmOrganisation"("concurrentGagnantId");

-- Forçage de la température : la valeur choisie, qui l'a posée, quand. La
-- température calculée n'a pas de colonne. Un auteur supprimé laisse le
-- forçage en place, sans auteur.
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "temperatureForcee" "CrmTemperature";
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "temperatureForceeParId" INTEGER;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "temperatureForceeLe" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "CrmOrganisation"
    ADD CONSTRAINT "CrmOrganisation_temperatureForceeParId_fkey"
    FOREIGN KEY ("temperatureForceeParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tout vide, ou la valeur et sa date présentes ensemble.
DO $$ BEGIN
  ALTER TABLE "CrmOrganisation"
    ADD CONSTRAINT "CrmOrganisation_temperatureForcee_coherente"
    CHECK (
      ("temperatureForcee" IS NULL AND "temperatureForceeParId" IS NULL AND "temperatureForceeLe" IS NULL)
      OR ("temperatureForcee" IS NOT NULL AND "temperatureForceeLe" IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
