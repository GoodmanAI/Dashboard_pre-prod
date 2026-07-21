-- =============================================================================
-- Migration manuelle : ajout du champ "verificationCode" a AppointmentConfirmation
-- =============================================================================
--
-- Contexte : refonte de la verification patient sur les liens SMS de rappel
-- no-show. Avant : le patient devait saisir prenom + nom + date de naissance
-- pour confirmer/annuler, et le dashboard comparait a ce que l'API metier
-- avait envoye a init. Probleme : parfois la fiche patient cote metier a des
-- infos fausses/differentes → un patient legitime tapait SES vraies infos et
-- ne passait pas le filtre → il ne pouvait ni confirmer ni annuler.
--
-- Nouvelle logique : AI2Xplore (via le dashboard) genere un code a 6 chiffres,
-- le dashboard le retourne dans la reponse d'init, AI2Xplore l'inclut dans
-- le SMS envoye au patient. Le patient tape juste ce code (input numerique
-- mobile-friendly). Le rate limit existant (3 essais → LOCKED) suffit a
-- rendre le brute-force impraticable (3 / 1_000_000 = 0.0003%).
--
-- Ce chantier n'est PAS en prod (aucun SMS envoye avec l'ancien flow),
-- donc pas de retrocompat : la nouvelle colonne est NOT NULL. Les 24 rows
-- expires deja presents en DB sont backfilles a '000000' (impossible en
-- pratique de faire matcher, et de toute facon leur token est expire).
--
-- Table AppointmentConfirmation est geree hors Prisma (SQL direct via pg).
--
-- Securite :
--   - 3 etapes : ADD COLUMN nullable → UPDATE backfill → SET NOT NULL
--   - Encapsulee dans BEGIN/COMMIT (rollback auto si erreur)
--   - Verification integree en fin de transaction
--
-- Rollback (apres COMMIT si necessaire) :
--   ALTER TABLE "AppointmentConfirmation" DROP COLUMN IF EXISTS "verificationCode";
-- =============================================================================

BEGIN;

-- 1) Ajouter la colonne (nullable au depart pour pouvoir backfill).
ALTER TABLE "AppointmentConfirmation"
  ADD COLUMN "verificationCode" varchar(6);

-- 2) Backfill des rows existants (expires — le '000000' ne sera jamais utilise
--    en pratique, il sert juste a rendre la colonne NOT NULL sans souci).
UPDATE "AppointmentConfirmation"
   SET "verificationCode" = '000000'
 WHERE "verificationCode" IS NULL;

-- 3) Rendre la colonne NOT NULL — invariant tenu par tous les prochains
--    INSERT via /api/rdv/init.
ALTER TABLE "AppointmentConfirmation"
  ALTER COLUMN "verificationCode" SET NOT NULL;

-- 4) Verification.
DO $$
DECLARE
  col_type text;
  col_nullable text;
  nb_null integer;
BEGIN
  SELECT data_type, is_nullable
    INTO col_type, col_nullable
    FROM information_schema.columns
   WHERE table_name = 'AppointmentConfirmation'
     AND column_name = 'verificationCode';

  IF col_type IS NULL THEN
    RAISE EXCEPTION 'Migration incomplete: verificationCode column not created';
  END IF;
  IF col_nullable <> 'NO' THEN
    RAISE EXCEPTION 'Migration incomplete: verificationCode still nullable (got %)', col_nullable;
  END IF;

  SELECT COUNT(*) INTO nb_null
    FROM "AppointmentConfirmation"
   WHERE "verificationCode" IS NULL;
  IF nb_null > 0 THEN
    RAISE EXCEPTION 'Migration incomplete: % rows still have NULL verificationCode', nb_null;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- Verifications post-migration :
-- =============================================================================
--
-- 1. Structure de la table (colonne presente + NOT NULL) :
--    \d "AppointmentConfirmation"
--
-- 2. Backfill applique aux vieux rows expires :
--    SELECT "id", "status", "verificationCode"
--      FROM "AppointmentConfirmation"
--     ORDER BY "id" DESC LIMIT 30;
--    → les rows avant migration ont "verificationCode" = '000000'
--    → les rows crees APRES le deploiement du code auront un code aleatoire
