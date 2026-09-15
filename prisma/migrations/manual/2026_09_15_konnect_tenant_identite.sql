-- Migration manuelle : l'identite d'un cabinet nait au Dashboard (lot 4E)
--
-- POURQUOI. Jusqu'ici l'identifiant de cabinet du portail naissait chez Konnect
-- (`tenant.id`, un `gen_random_uuid()` de sa propre base), et le Dashboard ne faisait
-- que le REFERENCER : on creait le cabinet par curl sur `POST /console/cabinets`, on
-- recopiait l'UUID a la main dans l'ecran « Identifiants externes ». Deux gestes, deux
-- outils, un copier-coller, et aucun moyen pour le Dashboard de verifier que l'UUID
-- saisi designe quelque chose.
--
-- On inverse : le Dashboard genere l'identifiant a l'affiliation du produit, et Konnect
-- tire la liste des cabinets attendus puis les cree lui-meme. Le sens de circulation ne
-- change pas, le Dashboard ne peut toujours pas appeler Konnect (decision du 08/09/2026,
-- VPN) : c'est une lecture de plus sur le pont.
--
-- CE QUE CETTE MIGRATION AJOUTE. Konnect exige deux choses que le Dashboard ne stockait
-- pas : un `slug` (NOT NULL UNIQUE chez lui) et un `name`. Le `name` se lit deja sur
-- `User`. Le `slug`, non : il devient une colonne ici, parce que le Dashboard devient
-- l'autorite de l'identite et qu'une autorite garde ce qu'elle attribue.
--
-- LE SLUG EST NULLABLE, ET L'INDEX EST PARTIEL. Les cabinets deja rattaches n'en ont
-- pas : leur identite est nee ailleurs, et leur en fabriquer un retroactivement
-- risquerait de heurter un slug deja pris cote Konnect. Ils gardent donc `NULL`, la
-- route des cabinets attendus les ignore, et rien ne bouge pour eux.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS).

ALTER TABLE "KonnectTenantMapping"
  ADD COLUMN IF NOT EXISTS "slug" text;

COMMENT ON COLUMN "KonnectTenantMapping"."slug" IS
  'Identifiant lisible du cabinet, attribue par le Dashboard a l''affiliation. NULL pour les cabinets nes chez Konnect avant le 15/09/2026.';

-- Index PARTIEL : plusieurs lignes peuvent porter NULL, une seule peut porter un slug
-- donne. Un UNIQUE ordinaire suffirait en PostgreSQL (les NULL n'y sont pas egaux entre
-- eux), mais le dire explicitement evite d'avoir a connaitre cette subtilite pour relire
-- la contrainte.
CREATE UNIQUE INDEX IF NOT EXISTS "KonnectTenantMapping_slug_key"
  ON "KonnectTenantMapping" ("slug")
  WHERE "slug" IS NOT NULL;

-- Verif :
--   SELECT "userProductId", "tenantId", "slug" FROM "KonnectTenantMapping" ORDER BY "id";
--   -- Attendu juste apres la migration : la colonne existe, toutes les lignes a NULL.
--
-- Rollback :
--   DROP INDEX IF EXISTS "KonnectTenantMapping_slug_key";
--   ALTER TABLE "KonnectTenantMapping" DROP COLUMN IF EXISTS "slug";
--     -- Sans danger tant que la route /api/konnect-tenants-attendus n'est pas servie :
--     -- elle est le seul lecteur de cette colonne.
