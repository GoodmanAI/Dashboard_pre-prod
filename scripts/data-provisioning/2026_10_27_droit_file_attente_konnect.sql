-- =============================================================================
-- Droit de page « Liste d'attente » de Konnect (27/10/2026)
-- =============================================================================
--
-- La page `konnect_file_attente` est nouvelle (plan workspace
-- plans/2026-10-file-attente-konnect.md, K12). Un compte principal
-- (`permissions` NULL) y a acces d'office ; un sous-compte, non, tant que la cle
-- n'est pas dans ses permissions. On la donne au meme niveau que son droit
-- `konnect_demandes_rappel` : la file remplace le rappel pour les examens qui
-- l'ont ouverte, c'est le meme travail de secretariat.
--
-- Idempotent : une cle deja posee n'est pas touchee. A lancer apres le
-- deploiement du code (la cle est sans effet avant).
--   psql "$DATABASE_URL" -f scripts/data-provisioning/2026_10_27_droit_file_attente_konnect.sql
-- =============================================================================

BEGIN;

UPDATE "User" u
   SET "permissions" = u."permissions"
         || jsonb_build_object('konnect_file_attente', u."permissions"->>'konnect_demandes_rappel')
 WHERE u."permissions" IS NOT NULL
   AND jsonb_typeof(u."permissions") = 'object'
   AND u."permissions" ? 'konnect_demandes_rappel'
   AND u."permissions"->>'konnect_demandes_rappel' IN ('read', 'write')
   AND NOT (u."permissions" ? 'konnect_file_attente');

SELECT COUNT(*) AS comptes_avec_le_droit
  FROM "User"
 WHERE "permissions" ? 'konnect_file_attente';

COMMIT;
