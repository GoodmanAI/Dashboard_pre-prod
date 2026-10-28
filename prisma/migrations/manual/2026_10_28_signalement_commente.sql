-- Migration manuelle : signalement daté et commenté
--
-- Lot 0 du plan `plans/2026-10-amelioration-continue-lyraetalk.md` (workspace),
-- décision A6 (DECISIONS.md du 27/10/2026).
--
-- POURQUOI. Un signalement n'était qu'un booléen (`flagged`) : ni quand, ni pourquoi.
-- Le rapport du matin (daily-report) doit lire chaque jour les signalements de la
-- veille et savoir ce que le client a vu de travers.
--
-- DEUX COLONNES sur `CallConversation` :
--   - `flaggedAt`   : quand le client a signalé. NULL = pas signalé.
--   - `flagComment` : « Qu'est-ce qui s'est mal passé ? », facultatif, 500 caractères.
--     Peut contenir une donnée patient : effacé par `anonymise_appels.sh` avec la
--     transcription, jamais journalisé.
--
-- Les signalements d'avant sont datés de l'appel (`createdAt`) : ils ne remontent
-- pas comme signalements de la veille.
--
-- ⚠️ À appliquer AVANT de déployer le code : Prisma lit toutes les colonnes du
-- modèle, et un `findMany` sur `CallConversation` échouerait sans elles.
--   psql "$DATABASE_URL" -f prisma/migrations/manual/2026_10_28_signalement_commente.sql
--
-- Idempotent : `IF NOT EXISTS`, remplissage limité aux lignes à NULL. Additif.

BEGIN;

ALTER TABLE "CallConversation"
  ADD COLUMN IF NOT EXISTS "flaggedAt" timestamp(3),
  ADD COLUMN IF NOT EXISTS "flagComment" varchar(500);

UPDATE "CallConversation"
   SET "flaggedAt" = "createdAt"
 WHERE flagged = true
   AND "flaggedAt" IS NULL;

COMMIT;
