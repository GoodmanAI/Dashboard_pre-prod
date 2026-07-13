-- =============================================================================
-- Migration manuelle : durcissement de l'authentification (Phase 2)
-- =============================================================================
--
-- Contexte : ajoute les deux mecanismes anti-bruteforce implementes dans
-- src/lib/loginSecurity.ts :
--   1. Account lockout par utilisateur (5 echecs consecutifs -> 15 min de lock)
--      -> 2 nouvelles colonnes sur la table "User"
--   2. Rate limit par IP via historique en base (5 echecs / 15 min / IP -> 429)
--      -> nouvelle table "LoginAttempt" + 2 indexes composites
--
-- Bien que "User" et "LoginAttempt" soient declares dans prisma/schema.prisma,
-- on applique le changement en SQL manuel plutot que via `prisma migrate deploy`
-- (le dossier prisma/migrations Prisma-auto n'est pas trackable en l'etat,
-- cf. .gitignore). Ce fichier reproduit EXACTEMENT le SQL que Prisma aurait
-- genere pour ces trois changements. Apres application :
--   - `npx prisma generate` regenere le client TypeScript (typage des nouveaux
--     champs et de la table)
--   - le code applicatif (loginSecurity.ts) fonctionne
--
-- Securite :
--   - Additive uniquement (2 ADD COLUMN + 1 CREATE TABLE + 2 CREATE INDEX)
--   - Retrocompatible : le code actuel qui ignore ces colonnes/table continue
--     de fonctionner
--   - Encapsulee dans BEGIN/COMMIT -> rollback auto si erreur
--   - Verification integree : leve une exception si tout n'est pas en place
--
-- Rollback (apres COMMIT, uniquement si necessaire) :
--   BEGIN;
--   DROP TABLE IF EXISTS "LoginAttempt";
--   ALTER TABLE "User" DROP COLUMN IF EXISTS "failedLoginAttempts";
--   ALTER TABLE "User" DROP COLUMN IF EXISTS "lockedUntil";
--   COMMIT;
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Colonnes de lockout sur "User"
-- ---------------------------------------------------------------------------

ALTER TABLE "User"
  ADD COLUMN "failedLoginAttempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil"         timestamp(3);

-- ---------------------------------------------------------------------------
-- 2) Table d'historique pour le rate limit IP
-- ---------------------------------------------------------------------------

CREATE TABLE "LoginAttempt" (
  "id"        serial       PRIMARY KEY,
  "ip"        text         NOT NULL,
  "email"     text,
  "success"   boolean      NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index composites pour les requetes du rate limiter :
--   count(*) WHERE ip = ? AND createdAt >= ?
--   count(*) WHERE email = ? AND createdAt >= ?
CREATE INDEX "LoginAttempt_ip_createdAt_idx"    ON "LoginAttempt" ("ip", "createdAt");
CREATE INDEX "LoginAttempt_email_createdAt_idx" ON "LoginAttempt" ("email", "createdAt");

-- ---------------------------------------------------------------------------
-- 3) Verification integree : ceinture ET bretelles.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  user_cols  integer;
  table_ok   boolean;
  idx_count  integer;
BEGIN
  -- Les 2 nouvelles colonnes doivent etre presentes sur User
  SELECT COUNT(*) INTO user_cols
    FROM information_schema.columns
   WHERE table_name = 'User'
     AND column_name IN ('failedLoginAttempts', 'lockedUntil');
  IF user_cols <> 2 THEN
    RAISE EXCEPTION 'Migration incomplete: only % of 2 User columns present', user_cols;
  END IF;

  -- La table LoginAttempt doit exister
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_name = 'LoginAttempt'
  ) INTO table_ok;
  IF NOT table_ok THEN
    RAISE EXCEPTION 'Migration incomplete: LoginAttempt table not created';
  END IF;

  -- Les 2 indexes doivent exister
  SELECT COUNT(*) INTO idx_count
    FROM pg_indexes
   WHERE tablename = 'LoginAttempt'
     AND indexname IN ('LoginAttempt_ip_createdAt_idx', 'LoginAttempt_email_createdAt_idx');
  IF idx_count <> 2 THEN
    RAISE EXCEPTION 'Migration incomplete: only % of 2 LoginAttempt indexes present', idx_count;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- Verifications post-migration (a lancer manuellement pour confirmer) :
-- =============================================================================
--
-- 1. Colonnes sur User (les 2 nouvelles doivent apparaitre en bas) :
--    \d "User"
--
-- 2. Table LoginAttempt (structure + indexes) :
--    \d "LoginAttempt"
--
-- 3. Aucune data User perdue (compter les lignes, doit etre inchange) :
--    SELECT COUNT(*) FROM "User";
--
-- 4. LoginAttempt initialement vide :
--    SELECT COUNT(*) FROM "LoginAttempt";  -- doit renvoyer 0
--
-- 5. Verifier les defauts sur User (toutes les lignes existantes doivent
--    avoir failedLoginAttempts = 0 et lockedUntil = NULL) :
--    SELECT "id", "email", "failedLoginAttempts", "lockedUntil"
--      FROM "User" LIMIT 5;
