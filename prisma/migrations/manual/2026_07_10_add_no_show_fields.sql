-- =============================================================================
-- Migration manuelle : ajout des champs "no-show" à SmsConfirmationConfig
-- =============================================================================
--
-- Contexte : feat/no-show — le cron AI2Xplore a besoin, par centre, de :
--   - postesByType   : mapping typeExamen → liste de NumeroPoste Xplore
--   - reminderDays   : cadence des relances (ex: [3, 2] pour J-3 et J-2)
--   - cutoffHours    : pas de SMS s'il reste moins de X heures avant le RDV
--
-- La table `SmsConfirmationConfig` est gérée hors Prisma (SQL direct via pg).
-- Cette migration n'est PAS trackée par `prisma migrate`. À appliquer manuellement
-- via psql. Le fichier est versionné dans le repo pour tracer le changement.
--
-- Sécurité :
--   - Additive uniquement (3 ADD COLUMN)
--   - Rétrocompatible : le code actuel ne connaît pas ces colonnes
--   - Encapsulée dans BEGIN/COMMIT → rollback auto si erreur
--   - Vérification intégrée : lève une exception si moins de 3 colonnes ajoutées
--
-- Rollback (si jamais on veut annuler après COMMIT) :
--   ALTER TABLE "SmsConfirmationConfig"
--     DROP COLUMN IF EXISTS "postesByType",
--     DROP COLUMN IF EXISTS "reminderDays",
--     DROP COLUMN IF EXISTS "cutoffHours";
-- =============================================================================

BEGIN;

ALTER TABLE "SmsConfirmationConfig"
  ADD COLUMN "postesByType" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "reminderDays" jsonb,
  ADD COLUMN "cutoffHours"  integer;

-- Vérification intégrée : la migration échoue si les 3 colonnes ne sont pas
-- présentes après l'ALTER — ceinture ET bretelles.
DO $$
DECLARE
  cols_added integer;
BEGIN
  SELECT COUNT(*) INTO cols_added
    FROM information_schema.columns
   WHERE table_name = 'SmsConfirmationConfig'
     AND column_name IN ('postesByType', 'reminderDays', 'cutoffHours');
  IF cols_added <> 3 THEN
    RAISE EXCEPTION 'Migration incomplete: only % of 3 columns present', cols_added;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- Vérifications post-migration (à lancer manuellement pour confirmer) :
-- =============================================================================
--
-- 1. Structure de la table (les 3 nouvelles colonnes doivent apparaître) :
--    \d "SmsConfirmationConfig"
--
-- 2. Data intactes (compter les lignes existantes, doit être inchangé) :
--    SELECT COUNT(*) FROM "SmsConfirmationConfig";
--
-- 3. Valeurs par défaut appliquées :
--    SELECT "userProductId", "enabledExamTypes", "postesByType",
--           "reminderDays", "cutoffHours"
--      FROM "SmsConfirmationConfig" LIMIT 5;
--
--    → "postesByType" doit être '{}' (défaut) sur toutes les lignes existantes
--    → "reminderDays" et "cutoffHours" doivent être NULL
