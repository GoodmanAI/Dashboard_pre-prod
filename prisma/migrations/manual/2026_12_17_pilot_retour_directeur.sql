-- Retour du directeur projet (lot W, CHOIX.md C-87 à C-90). Additif et
-- idempotent, aucun miroir modifié, aucune valeur d'énumération ajoutée.
--
-- Rejouable après `prisma db push` (npm run demarrer) : les noms sont ceux que
-- Prisma donne, et les CHECK, que `db push` ne connaît pas, sont ajoutées à part.

-- ---------------------------------------------------------------------------
-- Le métier d'un contact (C-88) : gérant, radiologue, prestataire informatique.
-- Saisie libre, la liste proposée vit dans le code. À côté du rôle dans la
-- décision, qui reste : les deux disent des choses différentes.
-- ---------------------------------------------------------------------------
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "metier" TEXT;

-- ---------------------------------------------------------------------------
-- L'identité légale, remplie depuis l'annuaire des entreprises (C-89). Des
-- données publiques d'entreprise, aucune donnée patient. Le nom affiché
-- (`raisonSocialeNom`) reste celui que l'équipe choisit.
-- ---------------------------------------------------------------------------
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "siren" TEXT;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "denominationLegale" TEXT;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "siretSiege" TEXT;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "siegeAdresse" TEXT;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "siegeCodePostal" TEXT;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "siegeVille" TEXT;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "codeNaf" TEXT;
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "formeJuridique" TEXT;
-- Le jour où l'identité a été lue dans l'annuaire ; vide si elle a été saisie à la main.
ALTER TABLE "CrmOrganisation" ADD COLUMN IF NOT EXISTS "annuaireLuLe" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "CrmOrganisation_siren_idx" ON "CrmOrganisation"("siren");

DO $$ BEGIN
  ALTER TABLE "CrmOrganisation" ADD CONSTRAINT "CrmOrganisation_siren_valide"
    CHECK ("siren" IS NULL OR "siren" ~ '^[0-9]{9}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CrmOrganisation" ADD CONSTRAINT "CrmOrganisation_siret_siege_valide"
    CHECK ("siretSiege" IS NULL OR "siretSiege" ~ '^[0-9]{14}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Un centre est un établissement : son SIRET et son numéro FINESS, s'il en a.
ALTER TABLE "CrmCentre" ADD COLUMN IF NOT EXISTS "siret" TEXT;
ALTER TABLE "CrmCentre" ADD COLUMN IF NOT EXISTS "finess" TEXT;
DO $$ BEGIN
  ALTER TABLE "CrmCentre" ADD CONSTRAINT "CrmCentre_siret_valide"
    CHECK ("siret" IS NULL OR "siret" ~ '^[0-9]{14}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Une ligne de tarif qui montre son calcul (C-90) : quantité × prix unitaire,
-- moins la remise de la ligne. La base dit ce qu'on compte (salles, sites).
-- Sur une proposition, `montantCentimes` reste le brut (quantité × prix) ; sur
-- un contrat, il reste le net (C-39). Le serveur le calcule, l'écran ne le
-- saisit plus quand la quantité et le prix sont donnés.
-- `remisePourMille` vide : la ligne suit la remise de la version.
-- ---------------------------------------------------------------------------
ALTER TABLE "CrmLigneProposition" ADD COLUMN IF NOT EXISTS "quantite" INTEGER;
ALTER TABLE "CrmLigneProposition" ADD COLUMN IF NOT EXISTS "prixUnitaireCentimes" INTEGER;
ALTER TABLE "CrmLigneProposition" ADD COLUMN IF NOT EXISTS "baseQuantite" "CrmBaseTarif";
ALTER TABLE "CrmLigneProposition" ADD COLUMN IF NOT EXISTS "remisePourMille" INTEGER;
ALTER TABLE "CrmLigneContrat" ADD COLUMN IF NOT EXISTS "quantite" INTEGER;
ALTER TABLE "CrmLigneContrat" ADD COLUMN IF NOT EXISTS "prixUnitaireCentimes" INTEGER;
ALTER TABLE "CrmLigneContrat" ADD COLUMN IF NOT EXISTS "baseQuantite" "CrmBaseTarif";
ALTER TABLE "CrmLigneContrat" ADD COLUMN IF NOT EXISTS "remisePourMille" INTEGER;

-- La quantité et le prix vont ensemble ; une quantité positive, un prix
-- positif ou nul, une remise de 0 à 100 %, une base qui n'est pas un pourcentage.
DO $$ BEGIN
  ALTER TABLE "CrmLigneProposition" ADD CONSTRAINT "CrmLigneProposition_quantite_valide"
    CHECK (("quantite" IS NULL AND "prixUnitaireCentimes" IS NULL AND "baseQuantite" IS NULL)
      OR ("quantite" IS NOT NULL AND "prixUnitaireCentimes" IS NOT NULL AND "quantite" > 0 AND "prixUnitaireCentimes" >= 0
        AND ("baseQuantite" IS NULL OR "baseQuantite" <> 'POURCENTAGE')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CrmLigneProposition" ADD CONSTRAINT "CrmLigneProposition_remise_valide"
    CHECK ("remisePourMille" IS NULL OR "remisePourMille" BETWEEN 0 AND 1000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CrmLigneContrat" ADD CONSTRAINT "CrmLigneContrat_quantite_valide"
    CHECK (("quantite" IS NULL AND "prixUnitaireCentimes" IS NULL AND "baseQuantite" IS NULL)
      OR ("quantite" IS NOT NULL AND "prixUnitaireCentimes" IS NOT NULL AND "quantite" > 0 AND "prixUnitaireCentimes" >= 0
        AND ("baseQuantite" IS NULL OR "baseQuantite" <> 'POURCENTAGE')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CrmLigneContrat" ADD CONSTRAINT "CrmLigneContrat_remise_valide"
    CHECK ("remisePourMille" IS NULL OR "remisePourMille" BETWEEN 0 AND 1000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
