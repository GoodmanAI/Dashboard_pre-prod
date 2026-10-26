-- =============================================================================
-- Droit de page « Questionnaires des patients » de Konnect (26/10/2026)
-- =============================================================================
--
-- La page `konnect_questionnaires` est nouvelle (plan workspace
-- plans/2026-10-konnect-questionnaires-centre.md). Un compte principal
-- (`permissions` NULL) y a acces d'office ; un sous-compte, non, tant que la cle
-- n'est pas dans ses permissions. On la donne au meme niveau que son droit
-- `ordonnances` : c'est le meme travail, rappeler un patient qui n'a pas rempli
-- ses questionnaires, pour l'autre canal.
--
-- Idempotent : une cle deja posee n'est pas touchee. A lancer apres le
-- deploiement du code (la cle est sans effet avant).
--   psql "$DATABASE_URL" -f scripts/data-provisioning/2026_10_26_droit_questionnaires_konnect.sql
-- =============================================================================

BEGIN;

UPDATE "User" u
   SET "permissions" = u."permissions"
         || jsonb_build_object('konnect_questionnaires', u."permissions"->>'ordonnances')
 WHERE u."permissions" IS NOT NULL
   AND jsonb_typeof(u."permissions") = 'object'
   AND u."permissions" ? 'ordonnances'
   AND u."permissions"->>'ordonnances' IN ('read', 'write')
   AND NOT (u."permissions" ? 'konnect_questionnaires');

SELECT COUNT(*) AS comptes_avec_le_droit
  FROM "User"
 WHERE "permissions" ? 'konnect_questionnaires';

COMMIT;
