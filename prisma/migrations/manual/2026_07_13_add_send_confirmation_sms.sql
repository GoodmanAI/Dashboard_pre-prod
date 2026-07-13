-- =============================================================================
-- Migration manuelle : ajout du flag "sendConfirmationSms" a SmsConfirmationConfig
-- =============================================================================
--
-- Contexte : nouvelle section UI "Confirmation de RDV par SMS" (a ne pas
-- confondre avec la section "Rappel de RDV par SMS (No-show)" qui utilise les
-- colonnes enabledExamTypes / postesByType / reminderDays / cutoffHours).
--
-- Ce flag simple (true/false, decoche par defaut) indique si le bot doit
-- envoyer un SMS de confirmation au patient IMMEDIATEMENT apres qu'il a pris
-- un RDV par LyraeTalk. Le bot le lit via GET /api/configuration.
--
-- La table SmsConfirmationConfig est geree hors Prisma (SQL direct via pg).
-- Cette migration n'est PAS trackee par prisma migrate. Fichier versionne
-- dans le repo pour tracer le changement.
--
-- Securite :
--   - Additive (1 ADD COLUMN)
--   - Retrocompatible : le code actuel ignore la colonne tant qu'elle n'est
--     pas lue explicitement
--   - Encapsulee dans BEGIN/COMMIT -> rollback auto si erreur
--   - Verification integree : leve une exception si la colonne n'est pas
--     presente apres l'ALTER
--
-- Rollback (si jamais on veut annuler apres COMMIT) :
--   ALTER TABLE "SmsConfirmationConfig"
--     DROP COLUMN IF EXISTS "sendConfirmationSms";
-- =============================================================================

BEGIN;

ALTER TABLE "SmsConfirmationConfig"
  ADD COLUMN "sendConfirmationSms" boolean NOT NULL DEFAULT false;

-- Verification integree : ceinture ET bretelles.
DO $$
DECLARE
  cols_added integer;
BEGIN
  SELECT COUNT(*) INTO cols_added
    FROM information_schema.columns
   WHERE table_name = 'SmsConfirmationConfig'
     AND column_name = 'sendConfirmationSms';
  IF cols_added <> 1 THEN
    RAISE EXCEPTION 'Migration incomplete: sendConfirmationSms column not present';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- Verifications post-migration (a lancer manuellement pour confirmer) :
-- =============================================================================
--
-- 1. Structure de la table (la nouvelle colonne doit apparaitre) :
--    \d "SmsConfirmationConfig"
--
-- 2. Data intactes (compter les lignes existantes, doit etre inchange) :
--    SELECT COUNT(*) FROM "SmsConfirmationConfig";
--
-- 3. Valeur par defaut appliquee sur les lignes existantes :
--    SELECT "userProductId", "sendConfirmationSms" FROM "SmsConfirmationConfig";
--
--    -> "sendConfirmationSms" doit etre 'f' (false) sur toutes les lignes existantes
