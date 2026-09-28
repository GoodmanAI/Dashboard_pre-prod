-- Migration manuelle : rétention des appels par centre
--
-- Lot 1 du plan `plans/2026-09-retention-des-appels.md` (workspace).
--
-- POURQUOI. `CallConversation` garde tout, pour toujours : la transcription
-- (`steps`) et, dans `stats`, le numéro appelant (`phoneNumber`) et les entités
-- extraites (`entites` : nom, prénom, date de naissance). Passé un délai réglé par
-- centre, un job de nuit (`scripts/db-maintenance/anonymise_appels.sh`) vide ces
-- trois champs et garde le reste de `stats`, qui fait les statistiques.
--
-- TROIS COLONNES :
--   - `UserProduct."retentionAppelsMois"` : le délai, en mois. 3 par défaut, de 1
--     à 24, réglé par l'admin seul (écran « Installation Talk »).
--   - `CallConversation."anonymiseeLe"` : quand le job est passé. NULL = la ligne
--     porte encore sa transcription.
--   - `CallConversation."nbTours"` : la longueur de `steps` au moment de l'écriture.
--     Les écrans ne comptent un appel que s'il a plus d'un échange, et le
--     calculaient sur `steps`. Une fois `steps` vidé, ce calcul sortirait l'appel
--     des statistiques ; `nbTours` garde l'information. NULL = pas encore rempli,
--     les lectures retombent alors sur la longueur de `steps`.
--
-- COMMENT. Deux parties, à lancer séparément :
--   1. les colonnes et le remplissage, dans une transaction (ce fichier jusqu'au
--      COMMIT) ;
--   2. l'index, `CONCURRENTLY`, donc HORS transaction : psql SANS `-1`.
--   psql "$DATABASE_URL" -f prisma/migrations/manual/2026_09_28_retention_appels.sql
--
-- ⚠️ À appliquer AVANT de déployer le code : Prisma lit toutes les colonnes du
-- modèle, et un `findMany` sur `CallConversation` échouerait sans elles.
--
-- Idempotent : `IF NOT EXISTS`, remplissage limité aux lignes à NULL. Additif :
-- aucune donnée existante n'est modifiée hors de `nbTours`.

BEGIN;

ALTER TABLE "UserProduct"
  ADD COLUMN IF NOT EXISTS "retentionAppelsMois" integer NOT NULL DEFAULT 3;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserProduct_retentionAppelsMois_check'
  ) THEN
    ALTER TABLE "UserProduct"
      ADD CONSTRAINT "UserProduct_retentionAppelsMois_check"
      CHECK ("retentionAppelsMois" BETWEEN 1 AND 24);
  END IF;
END $$;

ALTER TABLE "CallConversation"
  ADD COLUMN IF NOT EXISTS "anonymiseeLe" timestamp(3),
  ADD COLUMN IF NOT EXISTS "nbTours" integer;

-- `steps` vaut `{}` par défaut et non un tableau : `jsonb_array_length` échoue sur
-- un objet, d'où le CASE.
UPDATE "CallConversation"
   SET "nbTours" = CASE WHEN jsonb_typeof(steps::jsonb) = 'array'
                        THEN jsonb_array_length(steps::jsonb) ELSE 0 END
 WHERE "nbTours" IS NULL;

COMMIT;

-- Le chemin du job : les lignes pas encore anonymisées, par date. Partiel, donc
-- de plus en plus petit à mesure que le job passe.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CallConversation_aAnonymiser_idx"
  ON "CallConversation" ("createdAt")
  WHERE "anonymiseeLe" IS NULL;

-- Vérif :
--   \d "CallConversation"
--   SELECT COUNT(*) FROM "CallConversation" WHERE "nbTours" IS NULL;   -- 0
--   SELECT "retentionAppelsMois", COUNT(*) FROM "UserProduct" GROUP BY 1;  -- 3 partout
--
-- Rollback (sans perte : aucune transcription n'est touchée par ce fichier) :
--   DROP INDEX CONCURRENTLY IF EXISTS "CallConversation_aAnonymiser_idx";
--   ALTER TABLE "CallConversation" DROP COLUMN IF EXISTS "anonymiseeLe",
--                                  DROP COLUMN IF EXISTS "nbTours";
--   ALTER TABLE "UserProduct" DROP COLUMN IF EXISTS "retentionAppelsMois";
