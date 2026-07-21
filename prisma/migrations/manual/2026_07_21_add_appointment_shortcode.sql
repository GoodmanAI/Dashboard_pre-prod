-- =============================================================================
-- Migration manuelle : ajout du champ "shortCode" a AppointmentConfirmation
-- =============================================================================
--
-- Contexte : chantier feat/rdv-short-url-and-filter — on veut que le lien
-- envoye au patient par SMS tienne dans un seul segment (160 chars en GSM-7,
-- 70 chars en UCS-2). Le token HMAC actuel fait 43 chars, l'URL complete
-- 83 chars, ce qui fait passer les SMS avec accents en 2 segments → surcout.
--
-- La colonne "shortCode" recevra une string base64url de 10 chars (~60 bits
-- d'entropie), generee cote code via crypto.randomBytes. Le token HMAC reste
-- present pour la verification interne (double-lookup possible), c'est
-- uniquement l'URL patient qui bascule vers le format court.
--
-- Table AppointmentConfirmation est geree hors Prisma (SQL direct via pg).
-- Cette migration n'est PAS trackee par prisma migrate.
--
-- Securite :
--   - Additive (1 ADD COLUMN + 1 CREATE UNIQUE INDEX)
--   - Retrocompatible : les anciens rows auront shortCode = NULL (autorise
--     par UNIQUE, qui n'exclut pas les NULL en Postgres). Ils sont de toute
--     facon expires depuis longtemps (TTL 7 jours), donc pas de risque.
--   - Encapsulee dans BEGIN/COMMIT
--   - Verification integree
--
-- Rollback (apres COMMIT si necessaire) :
--   DROP INDEX IF EXISTS "AppointmentConfirmation_shortCode_key";
--   ALTER TABLE "AppointmentConfirmation" DROP COLUMN IF EXISTS "shortCode";
-- =============================================================================

BEGIN;

ALTER TABLE "AppointmentConfirmation"
  ADD COLUMN "shortCode" text;

CREATE UNIQUE INDEX "AppointmentConfirmation_shortCode_key"
  ON "AppointmentConfirmation" ("shortCode");

DO $$
DECLARE
  col_ok  boolean;
  idx_ok  boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'AppointmentConfirmation'
       AND column_name = 'shortCode'
  ) INTO col_ok;
  IF NOT col_ok THEN
    RAISE EXCEPTION 'Migration incomplete: shortCode column not present';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE tablename = 'AppointmentConfirmation'
       AND indexname = 'AppointmentConfirmation_shortCode_key'
  ) INTO idx_ok;
  IF NOT idx_ok THEN
    RAISE EXCEPTION 'Migration incomplete: shortCode unique index missing';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- Verifications post-migration :
-- =============================================================================
--
-- 1. Structure de la table (la nouvelle colonne doit apparaitre) :
--    \d "AppointmentConfirmation"
--
-- 2. Aucune data perdue (compter avant/apres — doit etre inchange) :
--    SELECT COUNT(*) FROM "AppointmentConfirmation";
--
-- 3. shortCode est NULL pour les anciens rows (attendu) :
--    SELECT COUNT(*) FROM "AppointmentConfirmation" WHERE "shortCode" IS NULL;
--    → doit correspondre au total (rows d'avant la migration)
