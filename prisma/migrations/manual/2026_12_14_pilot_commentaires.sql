-- Commentaires avec alerte, et département de chaque compte de l'équipe (lot T).
-- Additif et idempotent, aucun miroir modifié (seules les relations inverses de
-- User, côté Prisma, n'ont pas de colonne).
--
-- Un commentaire se pose sur une fiche client et peut prévenir personne, toute
-- l'équipe, un département ou une personne. L'alerte vit dans Pilot seulement,
-- comme une demande (C-58) : bloc « Pour vous » et pastille, pas d'e-mail.
-- Les destinataires sont figés à l'écriture : qui était dans le département à
-- ce moment-là, l'auteur jamais. `texte` est du texte libre : ni le journal ni
-- les logs n'en portent de copie (C-22, C-27). Un commentaire supprimé part
-- vraiment, avec ses destinataires : son texte ne survit nulle part.
--
-- Le département d'un compte vit dans sa propre table, pour tous les comptes de
-- l'équipe, super-administrateur compris : celui-ci n'a pas de ligne
-- `CrmAccesPilot` (C-64), et lui en donner une pour le seul département aurait
-- exigé un rôle Pilot factice ou facultatif.
--
-- Rejouable après `prisma db push` (npm run demarrer) : les noms d'index, de
-- clés et de clés étrangères sont ceux que Prisma donne.
--
-- ALTER TYPE ... ADD VALUE n'est suivi d'aucun usage de la valeur ajoutée dans
-- ce fichier : le fichier entier passe en une transaction, et une valeur ajoutée
-- n'est utilisable qu'après la validation.
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'COMMENTAIRE_ECRIT';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'COMMENTAIRE_SUPPRIME';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'DEPARTEMENT_MODIFIE';

-- Les départements de l'équipe, proposés et en attente de validation. On ajoute
-- des valeurs, on n'en renomme aucune.
DO $$ BEGIN
  CREATE TYPE "CrmDepartement" AS ENUM ('COMMERCIAL', 'PROJET', 'TECHNIQUE', 'DIRECTION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Qui un commentaire prévient. AUCUN : une note pour l'équipe, sans alerte.
DO $$ BEGIN
  CREATE TYPE "CrmCibleCommentaire" AS ENUM ('AUCUN', 'TOUS', 'DEPARTEMENT', 'PERSONNE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Le département d'un compte de l'équipe (ADMIN ou SUPER_ADMIN). Pas de ligne :
-- département pas encore choisi, l'écran Équipe le demande. Le compte supprimé
-- emporte sa ligne. Le rôle et les droits restent dans `CrmAccesPilot` et le
-- rôle du Dashboard : cette table ne dit rien d'autre que le département.
CREATE TABLE IF NOT EXISTS "CrmDepartementCompte" (
  "userId" INTEGER NOT NULL,
  "departement" "CrmDepartement" NOT NULL,
  "majLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmDepartementCompte_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "CrmDepartementCompte_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Les membres d'un département, lus à l'écriture d'un commentaire qui le vise.
CREATE INDEX IF NOT EXISTS "CrmDepartementCompte_departement_idx" ON "CrmDepartementCompte"("departement");

-- Un commentaire sur une fiche client. 2 000 signes au plus, jamais vide ni
-- fait que d'espaces. L'auteur supprimé laisse le commentaire, sans auteur.
-- La personne visée supprimée aussi : la cible reste PERSONNE, sans personne
-- (comme `temperatureForceeParId`), et les destinataires figés disent qui a été
-- prévenu.
CREATE TABLE IF NOT EXISTS "CrmCommentaire" (
  "id" SERIAL NOT NULL,
  "organisationId" INTEGER NOT NULL,
  "auteurId" INTEGER,
  "texte" TEXT NOT NULL,
  "cible" "CrmCibleCommentaire" NOT NULL DEFAULT 'AUCUN',
  "departementCible" "CrmDepartement",
  "personneCibleId" INTEGER,
  "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmCommentaire_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmCommentaire_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "CrmOrganisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmCommentaire_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CrmCommentaire_personneCibleId_fkey" FOREIGN KEY ("personneCibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- Les commentaires d'une fiche, du plus récent au plus ancien, l'id départage.
CREATE INDEX IF NOT EXISTS "CrmCommentaire_organisationId_creeLe_id_idx"
  ON "CrmCommentaire"("organisationId", "creeLe" DESC, "id" DESC);

-- Ajoutées à part pour qu'elles existent aussi sur une table créée par
-- `prisma db push`, qui ne connaît pas les CHECK.
DO $$ BEGIN
  ALTER TABLE "CrmCommentaire"
    ADD CONSTRAINT "CrmCommentaire_texte_valide"
    CHECK (char_length("texte") BETWEEN 1 AND 2000 AND "texte" ~ '[^[:space:]]');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- La cible et son complément vont ensemble. DEPARTEMENT : le département, pas
-- de personne. PERSONNE : pas de département ; la personne est exigée à
-- l'écriture par le service, et vidée si son compte disparaît. AUCUN, TOUS :
-- ni l'un ni l'autre.
DO $$ BEGIN
  ALTER TABLE "CrmCommentaire"
    ADD CONSTRAINT "CrmCommentaire_cible_coherente"
    CHECK (
      ("cible" IN ('AUCUN', 'TOUS') AND "departementCible" IS NULL AND "personneCibleId" IS NULL)
      OR ("cible" = 'DEPARTEMENT' AND "departementCible" IS NOT NULL AND "personneCibleId" IS NULL)
      OR ("cible" = 'PERSONNE' AND "departementCible" IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- On ne se prévient pas soi-même (comme on ne se demande rien, C-58).
DO $$ BEGIN
  ALTER TABLE "CrmCommentaire"
    ADD CONSTRAINT "CrmCommentaire_personne_pas_auteur"
    CHECK ("personneCibleId" IS NULL OR "auteurId" IS NULL OR "personneCibleId" <> "auteurId");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Qui un commentaire a prévenu, figé à l'écriture, et quand il l'a lu. Le bloc
-- « Pour vous » et la pastille lisent les lignes non lues d'un destinataire.
-- L'auteur n'en fait jamais partie : garde du service (une CHECK ne voit pas
-- l'auteur, qui est dans l'autre table). Le commentaire supprimé emporte ses
-- destinataires ; un compte supprimé emporte ses alertes, qui ne prévenaient
-- plus personne.
CREATE TABLE IF NOT EXISTS "CrmDestinataireCommentaire" (
  "id" SERIAL NOT NULL,
  "commentaireId" INTEGER NOT NULL,
  "destinataireId" INTEGER NOT NULL,
  "luLe" TIMESTAMP(3),
  CONSTRAINT "CrmDestinataireCommentaire_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmDestinataireCommentaire_commentaireId_fkey" FOREIGN KEY ("commentaireId") REFERENCES "CrmCommentaire"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmDestinataireCommentaire_destinataireId_fkey" FOREIGN KEY ("destinataireId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrmDestinataireCommentaire_commentaireId_destinataireId_key"
  ON "CrmDestinataireCommentaire"("commentaireId", "destinataireId");
CREATE INDEX IF NOT EXISTS "CrmDestinataireCommentaire_destinataireId_luLe_idx"
  ON "CrmDestinataireCommentaire"("destinataireId", "luLe");
