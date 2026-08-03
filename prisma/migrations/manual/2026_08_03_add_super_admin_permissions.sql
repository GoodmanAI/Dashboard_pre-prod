-- Chantier 3 (Lot A) - Multi-account management
-- =====================================================================
-- 1) Ajout de la valeur SUPER_ADMIN a l'enum Role
-- 2) Ajout des colonnes User.permissions (JSONB) + User.tokenVersion (INT)
--
-- Contexte :
--   - SUPER_ADMIN : nouveau role au-dessus de ADMIN, unique compte pouvant
--     creer/supprimer des ADMIN, creer des CLIENT et creer des sous-comptes
--     CLIENT avec permissions granulaires.
--   - permissions : override JSONB (null = acces complet du role, {...} =
--     acces granulaire par page pour les sous-comptes CLIENT). Format :
--     { "ordonnances": "write", "tickets": "read", "stats": "none" }
--   - tokenVersion : compteur pour la revocation JWT (kick a distance).
--     Incremente = tous les JWT existants du compte deviennent invalides
--     au prochain refresh (jwt callback les rejette).
--
-- Idempotent : safe a rerunner. ALTER TYPE ADD VALUE est protege par le
-- DO block (Postgres ne peut pas mettre ALTER TYPE dans une transaction
-- avec d'autres commandes sur ce type).
-- =====================================================================

-- 1) Ajouter SUPER_ADMIN a l'enum Role (avant ADMIN pour hierarchie visuelle)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'SUPER_ADMIN'
      AND enumtypid = 'public."Role"'::regtype
  ) THEN
    ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN' BEFORE 'ADMIN';
  END IF;
END
$$;

-- 2) Ajouter User.permissions (JSONB nullable)
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "permissions" JSONB;

-- 3) Ajouter User.tokenVersion (INT NOT NULL DEFAULT 0)
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- 4) Index sur role pour requetes "liste des SUPER_ADMIN" / "liste des ADMIN"
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User" ("role");

-- =====================================================================
-- ETAPE MANUELLE POST-MIGRATION (a executer une seule fois) :
--
--   UPDATE "User"
--   SET "role" = 'SUPER_ADMIN'
--   WHERE "email" = 'enzo.jakobasch@gmail.com';
--
-- Adapter l'email si le compte SUPER_ADMIN doit etre un autre.
-- =====================================================================
