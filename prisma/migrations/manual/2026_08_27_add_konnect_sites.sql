-- Migration manuelle : sites d'un centre LyraeKonnect
--
-- Lot C du plan `plans/2026-08-config-unifiee-dashboard.md`, second ticket.
--
-- Un cabinet a plusieurs lieux d'exercice. Le RIS les distingue par un `site_id` ;
-- Konnect a besoin, en face, de l'adresse en clair pour la dire au patient. L'API
-- Xplore n'expose aucune adresse (gap H12) : c'est donc au client de la saisir, et
-- cette table est l'endroit ou il le fait.
--
-- CE QUI DEPEND DE CES DONNEES, cote portail :
--   - l'ecran de verification avant reservation, qui affiche au patient OU aller ;
--   - le relais liste d'attente, qui rapproche les patients par code postal.
-- Un site sans code postal ne casse rien mais degrade les deux : le patient voit un
-- nom de site sans adresse, et le rapprochement geographique ne peut pas jouer.
--
-- `siteId` est la cle de jointure avec le RIS. Le renommer casse le rapprochement
-- en silence, comme `examenCode` pour le catalogue.
--
-- Idempotent : sur a rejouer.

BEGIN;

CREATE TABLE IF NOT EXISTS "KonnectSites" (
  "id"            serial PRIMARY KEY,
  "userProductId" integer NOT NULL,

  -- Identifiant du site dans le RIS. Cle de jointure, saisie telle quelle.
  "siteId"        text NOT NULL,

  -- Nom du site tel que le patient le lit (« Centre Lumiere - Batiment B »).
  "libelle"       text,

  -- Code postal : 5 chiffres. Sert au rapprochement geographique du relais liste
  -- d'attente, en plus de l'affichage. Non contraint ici, la validation est dans
  -- la route : un CHECK renverrait une erreur Postgres illisible a l'utilisateur.
  "codePostal"    text NOT NULL DEFAULT '',

  -- Rue et numero. Le reste de l'adresse (ville) se deduit du code postal.
  "adresse"       text,

  "createdAt"     timestamp with time zone NOT NULL DEFAULT NOW(),
  "updatedAt"     timestamp with time zone NOT NULL DEFAULT NOW(),

  CONSTRAINT "KonnectSites_userProductId_siteId_key"
    UNIQUE ("userProductId", "siteId"),

  CONSTRAINT "KonnectSites_userProductId_fkey"
    FOREIGN KEY ("userProductId") REFERENCES "UserProduct"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "KonnectSites_userProductId_idx"
  ON "KonnectSites" ("userProductId");

COMMIT;
