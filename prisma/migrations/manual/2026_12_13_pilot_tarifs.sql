-- Grille tarifaire commune et datée (lot S). Additif et idempotent, aucun
-- miroir modifié (seules les relations inverses de User et Product, côté
-- Prisma, n'ont pas de colonne).
--
-- Propositions, contrats et grilles sont en HT. La seule grille TTC était celle
-- de l'apport d'affaires (C-63) : la première grille en est reprise ici, une
-- seule fois, convertie exactement comme `prixHt()` (src/lib/apports/calcul.ts).
-- La grille en vigueur est la plus récente dont la date d'application ne
-- dépasse pas aujourd'hui : calculée à la lecture (C-08), jamais stockée.
-- L'argent est en centimes, en entiers ; un taux en pour-mille entier.
--
-- Rejouable après `prisma db push` (npm run demarrer) : les noms d'index et de
-- clés étrangères sont ceux que Prisma donne.
--
-- ALTER TYPE ... ADD VALUE n'est suivi d'aucun usage de la valeur ajoutée dans
-- ce fichier : le fichier entier passe en une transaction, et une valeur ajoutée
-- n'est utilisable qu'après la validation.
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'GRILLE_TARIFAIRE_CREEE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'GRILLE_TARIFAIRE_MODIFIEE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'TARIF_AJOUTE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'TARIF_MODIFIE';
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'TARIF_SUPPRIME';
-- Une grille à venir que rien n'utilise se supprime (erreur de saisie, hausse abandonnée).
ALTER TYPE "CrmTypeEvenement" ADD VALUE IF NOT EXISTS 'GRILLE_TARIFAIRE_SUPPRIMEE';

-- Une prestation est facturée une fois (mission ponctuelle, vente d'un
-- connecteur RIS), comptée au début officiel comme une mise en service.
ALTER TYPE "CrmTypeLigne" ADD VALUE IF NOT EXISTS 'PRESTATION';

-- Ce sur quoi porte un tarif. On ajoute des valeurs, on n'en renomme aucune.
DO $$ BEGIN
  CREATE TYPE "CrmBaseTarif" AS ENUM ('PAR_SALLE', 'PAR_SITE', 'PAR_ORGANISATION', 'POURCENTAGE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Une grille, une date d'application (minuit UTC, une grille par jour).
-- notes : texte libre, jamais dans le journal ni dans les logs (C-27).
-- « Modifiable tant qu'aucune proposition ne l'utilise » est une règle de
-- l'application, pas une contrainte.
CREATE TABLE IF NOT EXISTS "CrmGrilleTarifaire" (
  "id" SERIAL NOT NULL,
  "applicableLe" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "creeParId" INTEGER,
  "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "majLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmGrilleTarifaire_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmGrilleTarifaire_creeParId_fkey" FOREIGN KEY ("creeParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrmGrilleTarifaire_applicableLe_key" ON "CrmGrilleTarifaire"("applicableLe");

-- Un tarif HT d'une grille. code : stable, unique dans la grille, retrouvé par
-- le code sans dépendre du libellé. productId facultatif : le connecteur RIS
-- n'est pas un produit du catalogue. Un produit supprimé laisse le tarif, sans
-- produit. Montant vide : « Prix à renseigner ».
CREATE TABLE IF NOT EXISTS "CrmTarif" (
  "id" SERIAL NOT NULL,
  "grilleId" INTEGER NOT NULL,
  "productId" INTEGER,
  "libelle" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "type" "CrmTypeLigne" NOT NULL,
  "base" "CrmBaseTarif" NOT NULL,
  "montantHtCentimes" INTEGER,
  "pourMille" INTEGER,
  "ordre" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "CrmTarif_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmTarif_grilleId_fkey" FOREIGN KEY ("grilleId") REFERENCES "CrmGrilleTarifaire"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmTarif_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrmTarif_grilleId_code_key" ON "CrmTarif"("grilleId", "code");

-- Les CHECK sont ajoutées à part pour exister aussi sur des tables créées par
-- `prisma db push`, qui ne les connaît pas.
DO $$ BEGIN
  ALTER TABLE "CrmGrilleTarifaire"
    ADD CONSTRAINT "CrmGrilleTarifaire_applicableLe_minuit"
    CHECK ("applicableLe" = date_trunc('day', "applicableLe"));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmTarif"
    ADD CONSTRAINT "CrmTarif_libelle_renseigne"
    CHECK (length(btrim("libelle")) > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Un code court, en capitales : TALK, CONNECTEUR_RIS, INSTALLATION_TALK.
DO $$ BEGIN
  ALTER TABLE "CrmTarif"
    ADD CONSTRAINT "CrmTarif_code_format"
    CHECK ("code" ~ '^[A-Z][A-Z0-9_]*$' AND length("code") <= 40);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmTarif"
    ADD CONSTRAINT "CrmTarif_montantHtCentimes_positif"
    CHECK ("montantHtCentimes" IS NULL OR "montantHtCentimes" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmTarif"
    ADD CONSTRAINT "CrmTarif_pourMille_borne"
    CHECK ("pourMille" IS NULL OR "pourMille" BETWEEN 0 AND 1000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Un pourcentage a un taux et pas de montant ; une autre base n'a pas de taux.
DO $$ BEGIN
  ALTER TABLE "CrmTarif"
    ADD CONSTRAINT "CrmTarif_base_coherente"
    CHECK (
      ("base" = 'POURCENTAGE' AND "pourMille" IS NOT NULL AND "montantHtCentimes" IS NULL)
      OR ("base" <> 'POURCENTAGE' AND "pourMille" IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- La grille d'une version de proposition. RESTRICT : une grille utilisée ne se
-- supprime pas. Aucune suppression existante ne passe par une grille (une
-- organisation supprimée emporte ses propositions, pas les grilles).
ALTER TABLE "CrmProposition" ADD COLUMN IF NOT EXISTS "grilleId" INTEGER;

DO $$ BEGIN
  ALTER TABLE "CrmProposition"
    ADD CONSTRAINT "CrmProposition_grilleId_fkey"
    FOREIGN KEY ("grilleId") REFERENCES "CrmGrilleTarifaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "CrmProposition_grilleId_idx" ON "CrmProposition"("grilleId");

-- Une ligne peut ne porter aucun produit (prestation, connecteur RIS). Elle a
-- alors un libellé, gardé par la validation et par une CHECK. Les lignes
-- existantes ont toutes un produit : la CHECK les accepte.
ALTER TABLE "CrmLigneProposition" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "CrmLigneContrat" ALTER COLUMN "productId" DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE "CrmLigneProposition"
    ADD CONSTRAINT "CrmLigneProposition_libelle_sans_produit"
    CHECK ("productId" IS NOT NULL OR ("libelle" IS NOT NULL AND length(btrim("libelle")) > 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CrmLigneContrat"
    ADD CONSTRAINT "CrmLigneContrat_libelle_sans_produit"
    CHECK ("productId" IS NOT NULL OR ("libelle" IS NOT NULL AND length(btrim("libelle")) > 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Le réel figé d'une ligne sans produit (prestation, connecteur RIS) : figé sans
-- produit, sous le produit 0 de la clé texte (AAAA-MM|organisation|0|centre ou 0),
-- comme une ligne sans centre. La clé étrangère vers Product reste. Rejouable :
-- DROP NOT NULL sur une colonne déjà facultative ne fait rien.
ALTER TABLE "CrmCaMensuel" ALTER COLUMN "productId" DROP NOT NULL;

-- Geste commercial : la ligne est offerte (installation, salle).
ALTER TABLE "CrmLigneProposition" ADD COLUMN IF NOT EXISTS "offerte" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CrmLigneContrat" ADD COLUMN IF NOT EXISTS "offerte" BOOLEAN NOT NULL DEFAULT false;

-- La première grille, une seule fois : si aucune grille n'existe. Elle reprend
-- les réglages de l'apport d'affaires (ligne id = 1, sinon les valeurs par
-- défaut de src/lib/apports/referentiel.ts), datée du jour de l'application
-- (minuit UTC).
--
-- TTC vers HT comme `prixHt()` : Math.round(ttc × 10000 / (10000 + tvaPdm)),
-- le demi vers le haut. En entiers positifs : (2 × ttc × 10000 + coef) div
-- (2 × coef), calculé en bigint. Les frais d'installation sont rangés dans la
-- grille TTC des réglages de l'apport : convertis de même. Leur base suit le
-- mode d'installation (site, groupe, salle).
-- Le connecteur RIS est en points de base dans l'apport (1500 = 15 %) : en
-- pour-mille, divisé par 10, le demi vers le haut (1525 donnerait 153).
-- Desk et NoShow n'ont pas de prix dans la grille de l'apport : montant vide.
-- Un produit absent de Product laisse le tarif sans produit, et un NOTICE le
-- dit : ses lignes préremplies seraient hors catalogue (la page Tarifs l'affiche
-- aussi). Les noms sont ceux de src/lib/checklist/definition.ts.
DO $$
DECLARE
  p RECORD;
  coef BIGINT;
  grille INTEGER;
  base_installation "CrmBaseTarif";
  nom TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM "CrmGrilleTarifaire") THEN
    RETURN;
  END IF;

  FOREACH nom IN ARRAY ARRAY['LyraeTalk', 'Konnect', 'Desk', 'NoShow'] LOOP
    IF NOT EXISTS (SELECT 1 FROM "Product" WHERE "name" = nom) THEN
      RAISE NOTICE 'Grille tarifaire : produit « % » introuvable, ses tarifs restent sans produit (lignes préremplies hors catalogue).', nom;
    END IF;
  END LOOP;

  SELECT
    COALESCE(a."talkTtcCentimes", 32500) AS talk,
    COALESCE(a."konnectTtcCentimes", 9500) AS konnect,
    COALESCE(a."tvaPdm", 2000) AS tva,
    COALESCE(a."connecteurRisPdm", 1500) AS ris,
    COALESCE(a."installationTalkCentimes", 75000) AS inst_talk,
    COALESCE(a."installationKonnectCentimes", 45000) AS inst_konnect,
    COALESCE(a."modeInstallation", 'site') AS mode
  INTO p
  FROM (SELECT 1) AS d
  LEFT JOIN "CrmParametresApport" a ON a."id" = 1;

  coef := 10000 + p.tva;
  base_installation := CASE p.mode
    WHEN 'salle' THEN 'PAR_SALLE'::"CrmBaseTarif"
    WHEN 'groupe' THEN 'PAR_ORGANISATION'::"CrmBaseTarif"
    ELSE 'PAR_SITE'::"CrmBaseTarif"
  END;

  INSERT INTO "CrmGrilleTarifaire" ("applicableLe", "notes", "creeLe", "majLe")
  VALUES (date_trunc('day', timezone('UTC', now())), 'Reprise de la grille de l''apport d''affaires', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  RETURNING "id" INTO grille;

  INSERT INTO "CrmTarif" ("grilleId", "productId", "libelle", "code", "type", "base", "montantHtCentimes", "pourMille", "ordre") VALUES
    (grille, (SELECT "id" FROM "Product" WHERE "name" = 'LyraeTalk'), 'Talk', 'TALK', 'ABONNEMENT', 'PAR_SALLE',
      ((2 * p.talk::BIGINT * 10000 + coef) / (2 * coef))::INTEGER, NULL, 10),
    (grille, (SELECT "id" FROM "Product" WHERE "name" = 'Konnect'), 'Konnect', 'KONNECT', 'ABONNEMENT', 'PAR_SALLE',
      ((2 * p.konnect::BIGINT * 10000 + coef) / (2 * coef))::INTEGER, NULL, 20),
    (grille, (SELECT "id" FROM "Product" WHERE "name" = 'Desk'), 'Desk', 'DESK', 'ABONNEMENT', 'PAR_SALLE',
      NULL, NULL, 30),
    (grille, (SELECT "id" FROM "Product" WHERE "name" = 'NoShow'), 'NoShow', 'NOSHOW', 'ABONNEMENT', 'PAR_SALLE',
      NULL, NULL, 40),
    (grille, NULL, 'Connecteur RIS', 'CONNECTEUR_RIS', 'ABONNEMENT', 'POURCENTAGE',
      NULL, ((p.ris + 5) / 10)::INTEGER, 50),
    (grille, (SELECT "id" FROM "Product" WHERE "name" = 'LyraeTalk'), 'Installation et formation Talk', 'INSTALLATION_TALK', 'MISE_EN_SERVICE', base_installation,
      ((2 * p.inst_talk::BIGINT * 10000 + coef) / (2 * coef))::INTEGER, NULL, 60),
    (grille, (SELECT "id" FROM "Product" WHERE "name" = 'Konnect'), 'Installation et formation Konnect', 'INSTALLATION_KONNECT', 'MISE_EN_SERVICE', base_installation,
      ((2 * p.inst_konnect::BIGINT * 10000 + coef) / (2 * coef))::INTEGER, NULL, 70);
END $$;

-- À chaque passage, en lecture seule : un tarif de produit de la grille en
-- vigueur sans produit relié est signalé (un produit supprimé ou renommé, une
-- base où le SQL a tourné avant les produits). Rien n'est écrit.
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT tarif."code"
    FROM "CrmTarif" tarif
    WHERE tarif."productId" IS NULL
      AND tarif."code" IN ('TALK', 'KONNECT', 'DESK', 'NOSHOW', 'INSTALLATION_TALK', 'INSTALLATION_KONNECT')
      AND tarif."grilleId" = (
        SELECT g."id" FROM "CrmGrilleTarifaire" g
        WHERE g."applicableLe" <= date_trunc('day', timezone('UTC', now()))
        ORDER BY g."applicableLe" DESC LIMIT 1
      )
    ORDER BY tarif."ordre", tarif."id"
  LOOP
    RAISE NOTICE 'Grille tarifaire en vigueur : le tarif % n''est relié à aucun produit (lignes préremplies hors catalogue).', t."code";
  END LOOP;
END $$;
