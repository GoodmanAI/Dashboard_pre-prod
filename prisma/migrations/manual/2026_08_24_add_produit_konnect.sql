-- Migration manuelle : le produit LyraeKonnect et sa correspondance de centres
--
-- Étape 3 du plan `plans/2026-08-dashboard-multi-produit.md` du workspace.
--
-- Deux choses, indissociables :
--
--   1) La ligne `Product` « LyraeKonnect ». Le référentiel `src/lib/produits.ts`
--      la déclare déjà côté code depuis le commit 5c1834d, mais aucune base ne
--      la contient : tant qu'elle manque, aucun `UserProduct` ne peut être
--      rattaché au produit et le sélecteur n'aurait rien à afficher.
--
--   2) La table `KonnectTenantMapping`, qui relie un cabinet Konnect à un
--      centre du Dashboard. Cette correspondance n'existait NULLE PART :
--      Konnect identifie ses cabinets par un UUID (`tenant_id`, sa clé
--      d'isolation RLS), le Dashboard par un entier (`UserProduct.id`), et rien
--      ne les reliait — ni table, ni colonne, ni convention.
--
-- Pourquoi une migration manuelle et non Prisma : `INSERT` de donnée de
-- référence + table hors `schema.prisma`, comme `ExternalCenterMapping`, dont
-- cette table reprend la forme (même rôle : traduire l'identifiant d'un centre
-- vu par une brique voisine vers le `userProductId` local).
--
-- Différence assumée avec `ExternalCenterMapping` : celle-ci accepte N codes
-- pour un `UserProduct`, ici la relation est 1 ↔ 1, contrainte dans les DEUX
-- sens. Un `tenant_id` Konnect désigne exactement un cabinet, et le chemin
-- inverse (Dashboard → Konnect, nécessaire dès que le Dashboard devient
-- appelant) doit être tout aussi déterministe.
--
-- Idempotent : sûr à rejouer.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Le produit
-- ---------------------------------------------------------------------------
-- `Product."updatedAt"` n'a PAS de DEFAULT en base (Prisma le pose côté client
-- via `@updatedAt`) : en SQL brut il faut le fournir, sans quoi l'INSERT viole
-- la contrainte NOT NULL.
-- `"name"` porte une contrainte UNIQUE : ON CONFLICT rend le rejeu inoffensif.

INSERT INTO "Product" ("name", "description", "createdAt", "updatedAt")
VALUES (
  'LyraeKonnect',
  'Portail patient web de prise de rendez-vous',
  NOW(),
  NOW()
)
ON CONFLICT ("name") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) La correspondance cabinet Konnect <-> centre Dashboard
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "KonnectTenantMapping" (
  "id"            serial PRIMARY KEY,
  -- Centre côté Dashboard. CASCADE : si le UserProduct disparaît, la
  -- correspondance n'a plus d'objet.
  "userProductId" integer NOT NULL,
  -- `tenant_id` côté Konnect — UUID, clé d'isolation RLS. Voir GLOSSARY.md §1 :
  -- c'est le septième nom des identifiants de centre de l'écosystème.
  "tenantId"      uuid    NOT NULL,
  "createdAt"     timestamp with time zone NOT NULL DEFAULT NOW(),
  "updatedAt"     timestamp with time zone NOT NULL DEFAULT NOW(),

  CONSTRAINT "KonnectTenantMapping_userProductId_key" UNIQUE ("userProductId"),
  CONSTRAINT "KonnectTenantMapping_tenantId_key"      UNIQUE ("tenantId"),
  CONSTRAINT "KonnectTenantMapping_userProductId_fkey"
    FOREIGN KEY ("userProductId") REFERENCES "UserProduct"("id") ON DELETE CASCADE
);

COMMIT;

-- Vérif :
--   SELECT "id", "name" FROM "Product" WHERE "name" = 'LyraeKonnect';
--   \d "KonnectTenantMapping"
--
-- Rattachement de la démo (à jouer SÉPARÉMENT, une fois le UserProduct créé
-- depuis l'admin — le userProductId 2 du plan est celui du compte sandbox,
-- il n'est PAS supposé valide sur une autre base) :
--   INSERT INTO "KonnectTenantMapping" ("userProductId", "tenantId")
--   VALUES (<userProductId>, '11111111-1111-1111-1111-111111111111');
--
-- Rollback :
--   DROP TABLE IF EXISTS "KonnectTenantMapping";
--   DELETE FROM "Product" WHERE "name" = 'LyraeKonnect';
--     -- ATTENTION : ce DELETE cascade sur "UserProduct" et tout ce qui y pend.
--     -- Ne le jouer que si AUCUN centre n'a encore été rattaché au produit.
