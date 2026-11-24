-- Qui fait quoi (lot X, C-91). Additif et idempotent, aucun miroir modifié
-- (seules les relations inverses de User, côté Prisma, n'ont pas de colonne).
--
-- Retour du président, 20/11/2026 : chaque alerte dit le poste et la personne
-- qui doit agir. Décision de cadrage D-3 : toute alerte va d'office au
-- directeur général, qui la réattribue à la main si besoin.
--
-- Les alertes restent calculées à la lecture (C-08, C-35) : seules deux
-- décisions humaines sont stockées ici, qui est le directeur général et à qui
-- une alerte a été confiée.
--
-- Rejouable après `prisma db push` (npm run demarrer) : les noms d'index, de
-- clés et de clés étrangères sont ceux que Prisma donne.
--
-- ALTER TYPE ... ADD VALUE n'est suivi d'aucun usage de la valeur ajoutée dans
-- ce fichier : le fichier entier passe en une transaction, et une valeur ajoutée
-- n'est utilisable qu'après la validation.
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'ALERTE_ATTRIBUEE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'DIRECTEUR_GENERAL_DESIGNE';

-- Le directeur général : une seule ligne, id = 1. Le super-administrateur le
-- désigne dans l'écran Équipe. Sans ligne, ou si son accès est retiré, les
-- alertes vont au premier super-administrateur : aucune ne reste sans
-- personne. Le compte supprimé emporte la ligne.
CREATE TABLE IF NOT EXISTS "CrmDirecteurGeneral" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "userId" INTEGER NOT NULL,
  "modifieParId" INTEGER,
  "majLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmDirecteurGeneral_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmDirecteurGeneral_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmDirecteurGeneral_modifieParId_fkey" FOREIGN KEY ("modifieParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrmDirecteurGeneral_userId_key" ON "CrmDirecteurGeneral"("userId");
DO $$ BEGIN
  ALTER TABLE "CrmDirecteurGeneral" ADD CONSTRAINT "CrmDirecteurGeneral_une_ligne" CHECK ("id" = 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- À qui une alerte a été confiée. La clé est celle du groupe de l'alerte
-- (« suivi-12 », « mise-en-service-34 », ou la clé de l'alerte seule) : une
-- alerte qui revient sur le même dossier pour la même cause retrouve la même
-- personne. Une ligne par dossier et par groupe. La personne supprimée emporte
-- la ligne : l'alerte revient au directeur général. L'auteur supprimé laisse
-- la ligne, sans auteur.
CREATE TABLE IF NOT EXISTS "CrmAttributionAlerte" (
  "id" SERIAL NOT NULL,
  "organisationId" INTEGER NOT NULL,
  "cleGroupe" TEXT NOT NULL,
  "attribueeAId" INTEGER NOT NULL,
  "parId" INTEGER,
  "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmAttributionAlerte_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmAttributionAlerte_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "CrmOrganisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmAttributionAlerte_attribueeAId_fkey" FOREIGN KEY ("attribueeAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmAttributionAlerte_parId_fkey" FOREIGN KEY ("parId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrmAttributionAlerte_organisationId_cleGroupe_key" ON "CrmAttributionAlerte"("organisationId", "cleGroupe");
-- Les alertes confiées à une personne, lues par son filtre « À moi ».
CREATE INDEX IF NOT EXISTS "CrmAttributionAlerte_attribueeAId_idx" ON "CrmAttributionAlerte"("attribueeAId");
DO $$ BEGIN
  ALTER TABLE "CrmAttributionAlerte" ADD CONSTRAINT "CrmAttributionAlerte_cleGroupe_longueur" CHECK (char_length("cleGroupe") BETWEEN 1 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
