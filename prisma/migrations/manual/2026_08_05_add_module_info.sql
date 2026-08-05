-- =============================================================================
-- Migration manuelle : brique Module Info (FAQ patient)
-- =============================================================================
--
-- Contexte : le robot IA d'accueil medical (LyraeTalk / Azure Functions
-- module_info) doit avoir acces a une base de Q/R editable par le client
-- depuis le dashboard, avec :
--   - Un endpoint GET public interroge par la brique Azure (avec ETag/304)
--   - Un webhook de warm-up appele apres chaque mutation pour permettre
--     a Azure de reconstruire sa base de connaissances
--
-- Cette migration cree :
--
-- 1) "ModuleInfoItem" : une ligne par Q/R editable
--    - id : slug lisible auto-genere (ex "urgence-sans-rdv")
--    - userProductId : rattachement au centre (FK cascade)
--    - question / reponse : chaines non-vides
--    - categorie : chaine libre optionnelle
--    - enabled : bool (defaut true) - filtre applique cote GET public
--    - order : entier pour ordonner l'affichage (defaut 0)
--
-- 2) Nouvelle colonne "UserProduct.moduleInfoVersion" : timestamptz avec
--    @updatedAt Prisma - bumpee automatiquement a chaque UPDATE de la
--    ligne UserProduct, mais on la mettra a jour EXPLICITEMENT dans le
--    code applicatif a chaque CRUD sur un ModuleInfoItem du centre pour
--    servir de "version" dans le JSON public + ETag HTTP.
--
-- Idempotent : safe a rerunner.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) ModuleInfoItem
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ModuleInfoItem" (
  "id"            text PRIMARY KEY,
  "userProductId" int NOT NULL REFERENCES "UserProduct"("id") ON DELETE CASCADE,
  "question"      text NOT NULL,
  "reponse"       text NOT NULL,
  "categorie"     text,
  "enabled"       boolean NOT NULL DEFAULT true,
  "order"         int NOT NULL DEFAULT 0,
  "createdAt"     timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt"     timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "ModuleInfoItem_question_notempty" CHECK (length(trim("question")) > 0),
  CONSTRAINT "ModuleInfoItem_reponse_notempty"  CHECK (length(trim("reponse")) > 0)
);

-- Index chaud : lister les items actifs d'un centre, tries par order asc
CREATE INDEX IF NOT EXISTS "ModuleInfoItem_userProductId_enabled_order_idx"
  ON "ModuleInfoItem" ("userProductId", "enabled", "order");

-- Index secondaire : recherche par categorie (utile pour filtres UI futurs)
CREATE INDEX IF NOT EXISTS "ModuleInfoItem_userProductId_categorie_idx"
  ON "ModuleInfoItem" ("userProductId", "categorie");

-- ---------------------------------------------------------------------------
-- 2) UserProduct.moduleInfoVersion
-- ---------------------------------------------------------------------------
-- Version bumpee explicitement dans le code applicatif a chaque CRUD sur un
-- ModuleInfoItem. Sert de ETag pour le GET public + payload du webhook Azure.
-- Format timestamptz -> serialise en ISO 8601 dans le JSON.
ALTER TABLE "UserProduct"
  ADD COLUMN IF NOT EXISTS "moduleInfoVersion" timestamptz NOT NULL DEFAULT NOW();

-- ---------------------------------------------------------------------------
-- 3) Verification
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl_ok  boolean;
  col_ok  boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'ModuleInfoItem'
  ) INTO tbl_ok;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'UserProduct' AND column_name = 'moduleInfoVersion'
  ) INTO col_ok;
  IF NOT (tbl_ok AND col_ok) THEN
    RAISE EXCEPTION 'Migration incomplete: ModuleInfoItem ou UserProduct.moduleInfoVersion manquant';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- Rollback :
--   DROP TABLE IF EXISTS "ModuleInfoItem";
--   ALTER TABLE "UserProduct" DROP COLUMN IF EXISTS "moduleInfoVersion";
-- =============================================================================
