-- La carte (lot U) : la position de chaque centre, calculée depuis son adresse.
-- Additif et idempotent, aucun miroir modifié.
--
-- La position vient du service de géocodage de la Géoplateforme (IGN), qui ne
-- reçoit que l'adresse publique du site : rue, code postal, ville. Elle est
-- calculée après l'écriture, jamais pendant (même principe que C-22), et n'est
-- pas journalisée : un point calculé par un service n'est pas un fait saisi.
-- Changer la rue, le code postal ou la ville efface la position et repasse le
-- centre en A_FAIRE, dans la même transaction que le changement.
--
-- Pas de flottant stocké : latitude et longitude en DECIMAL(9,6) (le
-- millionième de degré, une dizaine de centimètres), le score du service en
-- millièmes entiers.
--
-- Rejouable après `prisma db push` (npm run demarrer) : les noms sont ceux que
-- Prisma donne, et les CHECK, que `db push` ne connaît pas, sont ajoutées à part.

-- Où en est la position d'un centre. A_FAIRE : pas encore cherchée, ou adresse
-- changée depuis. ADRESSE_INCOMPLETE : il manque la rue, ou à la fois le code
-- postal et la ville ; rien n'a été envoyé au service, l'écran dit quoi ajouter.
-- AMBIGU : le service hésite (score faible, plusieurs lieux proches, ou la
-- commune seulement) ; la position la plus probable est gardée, à vérifier.
-- INTROUVABLE : le service n'a rien trouvé de crédible. On ajoute des valeurs,
-- on n'en renomme aucune.
DO $$ BEGIN
  CREATE TYPE "CrmGeocodageStatut" AS ENUM ('A_FAIRE', 'OK', 'AMBIGU', 'INTROUVABLE', 'ADRESSE_INCOMPLETE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Les centres existants passent en A_FAIRE par la valeur par défaut :
-- `npm run geocoder` les rattrape.
ALTER TABLE "CrmCentre" ADD COLUMN IF NOT EXISTS "geocodageStatut" "CrmGeocodageStatut" NOT NULL DEFAULT 'A_FAIRE';
ALTER TABLE "CrmCentre" ADD COLUMN IF NOT EXISTS "latitude" DECIMAL(9,6);
ALTER TABLE "CrmCentre" ADD COLUMN IF NOT EXISTS "longitude" DECIMAL(9,6);
ALTER TABLE "CrmCentre" ADD COLUMN IF NOT EXISTS "geocodageScore" INTEGER;
ALTER TABLE "CrmCentre" ADD COLUMN IF NOT EXISTS "geocodeLe" TIMESTAMP(3);

-- La carte lit les centres placés ; « Pas encore localisés » lit les autres
-- statuts, et `npm run geocoder` ceux à faire.
CREATE INDEX IF NOT EXISTS "CrmCentre_geocodageStatut_idx" ON "CrmCentre"("geocodageStatut");

-- Une latitude entre -90 et 90, une longitude entre -180 et 180, les deux
-- ensemble ou aucune.
DO $$ BEGIN
  ALTER TABLE "CrmCentre"
    ADD CONSTRAINT "CrmCentre_position_valide"
    CHECK (
      ("latitude" IS NULL AND "longitude" IS NULL)
      OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL
        AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Le score du service, en millièmes : de 0 à 1000.
DO $$ BEGIN
  ALTER TABLE "CrmCentre"
    ADD CONSTRAINT "CrmCentre_geocodage_score_valide"
    CHECK ("geocodageScore" IS NULL OR "geocodageScore" BETWEEN 0 AND 1000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Le statut et la position vont ensemble : OK a toujours une position ;
-- A_FAIRE, INTROUVABLE et ADRESSE_INCOMPLETE n'en ont jamais. AMBIGU garde la
-- position la plus probable, ou aucune.
DO $$ BEGIN
  ALTER TABLE "CrmCentre"
    ADD CONSTRAINT "CrmCentre_position_selon_statut"
    CHECK (
      ("geocodageStatut" <> 'OK' OR "latitude" IS NOT NULL)
      AND ("geocodageStatut" NOT IN ('A_FAIRE', 'INTROUVABLE', 'ADRESSE_INCOMPLETE') OR "latitude" IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
