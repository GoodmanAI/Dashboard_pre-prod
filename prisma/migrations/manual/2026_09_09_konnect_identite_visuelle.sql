-- Migration manuelle : Konnect prend les couleurs et le logo du cabinet
--
-- POURQUOI. Konnect s'integre en iframe dans le site de chaque cabinet de radiologie,
-- et chaque cabinet a sa charte. Le portail est aujourd'hui bleu Lyrae chez tout le
-- monde : au milieu d'un site vert, l'encart a l'air d'un corps etranger, et le patient
-- doute d'etre encore chez son centre.
--
-- DEUX COULEURS, PAS UN THEME. `couleurPrincipale` peint les boutons, les liens et les
-- etats actifs ; `couleurSecondaire` peint le bandeau du haut. Le reste (gris, lignes,
-- vert de succes, rouge d'erreur) reste celui de Konnect : le rouge d'un message
-- d'erreur n'est pas une couleur de marque, et le repeindre nuirait a sa lecture.
--
-- NULL VEUT DIRE « PALETTE LYRAE ». C'est le meme fail-closed que partout ailleurs
-- dans cette table : un centre non parametre garde le comportement livre, il ne se
-- retrouve pas avec du noir ou du blanc par accident.
--
-- LE LOGO EST STOCKE ICI, PAS REFERENCE PAR UNE URL. Le champ `logoUrl` existant
-- demandait une adresse chez un hebergeur qu'on ne maitrise pas : le jour ou le cabinet
-- refait son site, le logo disparait du parcours patient sans que personne ne le voie.
-- Et il n'a JAMAIS servi (absent de `/cabinet-public`, aucun <img> dans le parcours,
-- et la CSP de l'iframe est `img-src 'self'`, qui bloque toute image tierce).
--
-- `logoUrl` N'EST PAS SUPPRIME. Des centres l'ont peut-etre rempli, et une colonne
-- qu'on retire est une donnee qu'on perd. Il devient de la trace, plus une source.
--
-- `logoMaj` SERT D'ETAG. Konnect tire le binaire (il ne peut pas etre pousse : le
-- portail est derriere un VPN, cf. DECISIONS.md 08/09/2026) et le met en cache. Sans
-- horodatage, il retelechargerait l'image a chaque synchronisation.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS).

ALTER TABLE "KonnectSettings"
  ADD COLUMN IF NOT EXISTS "couleurPrincipale" text,
  ADD COLUMN IF NOT EXISTS "couleurSecondaire" text,
  ADD COLUMN IF NOT EXISTS "logoContenu"       bytea,
  ADD COLUMN IF NOT EXISTS "logoType"          text,
  ADD COLUMN IF NOT EXISTS "logoNom"           text,
  ADD COLUMN IF NOT EXISTS "logoMaj"           timestamptz;

COMMENT ON COLUMN "KonnectSettings"."couleurPrincipale" IS
  'Couleur des boutons, liens et etats actifs du portail patient (#rrggbb). NULL = palette Lyrae.';
COMMENT ON COLUMN "KonnectSettings"."couleurSecondaire" IS
  'Couleur du bandeau du haut du portail patient (#rrggbb). NULL = derivee de la principale.';
COMMENT ON COLUMN "KonnectSettings"."logoContenu" IS
  'Logo du cabinet, binaire. Televerse par le client, tire par Konnect qui le sert depuis sa propre origine (la CSP de l iframe interdit les images tierces).';
COMMENT ON COLUMN "KonnectSettings"."logoType" IS
  'Type MIME du logo (image/png, image/jpeg, image/webp, image/svg+xml).';
COMMENT ON COLUMN "KonnectSettings"."logoNom" IS
  'Nom du fichier depose, affiche dans l ecran de configuration. Aucun role fonctionnel.';
COMMENT ON COLUMN "KonnectSettings"."logoMaj" IS
  'Date du dernier depot. Sert d ETag a Konnect, qui met le binaire en cache.';

-- Verif :
--   SELECT "userProductId", "couleurPrincipale", "couleurSecondaire",
--          "logoType", octet_length("logoContenu") AS octets, "logoMaj"
--     FROM "KonnectSettings";
--
-- Rollback :
--   ALTER TABLE "KonnectSettings"
--     DROP COLUMN IF EXISTS "couleurPrincipale",
--     DROP COLUMN IF EXISTS "couleurSecondaire",
--     DROP COLUMN IF EXISTS "logoContenu",
--     DROP COLUMN IF EXISTS "logoType",
--     DROP COLUMN IF EXISTS "logoNom",
--     DROP COLUMN IF EXISTS "logoMaj";
--   -- A ne faire QU'APRES avoir retire `couleur_principale` / `couleur_secondaire`
--   -- des CHAMPS_PILOTES cote Konnect.
