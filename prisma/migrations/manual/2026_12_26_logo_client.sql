-- Migration manuelle : un seul logo par client, commun à Talk et Konnect (28/11/2026)
--
-- POURQUOI. Le logo vivait dans "KonnectSettings", par produit Konnect : GH Pontivy, qui
-- n'a que Talk, n'avait nulle part où déposer le sien. Il sert aussi, depuis ce lot,
-- d'image d'aperçu aux liens des SMS (relance no-show `/c/…`, dépôt d'ordonnance `/d/…`) :
-- Google Messages précharge le lien et affichait le logo Neuracorp.
-- Plan : lyrae/plans/2026-11-logo-du-client.md. Décision d'Enzo du 28/11/2026.
--
-- PAR CLIENT ("User"), PAS PAR PRODUIT. Talk et Konnect d'un même client sont deux
-- "UserProduct" sous le même "User" ; les liens des SMS retrouvent leur centre par
-- "centerId" (= "User"."id").
--
-- REPRISE. Les logos déjà déposés pour Konnect sont recopiés avec leur date : "maj" sert
-- d'ETag à Konnect, qui garde donc son cache sans rien retélécharger. Un client à plusieurs
-- produits Konnect garde le logo le plus récent. Les colonnes de "KonnectSettings" restent
-- (une colonne retirée est une donnée perdue), elles ne sont plus lues.
--
-- À PASSER AVANT LE BUILD : `/api/konnect-logo` lit cette table dès le déploiement.
-- Idempotent.

CREATE TABLE IF NOT EXISTS "ClientLogo" (
  "userId"    integer PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "contenu"   bytea,
  "type"      text,
  "nom"       text,
  "maj"       timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt" timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE "ClientLogo" IS
  'Logo du client, commun à Talk et Konnect. Image publique (portail Konnect, aperçu des liens SMS). "maj" sert d ETag.';

INSERT INTO "ClientLogo" ("userId", "contenu", "type", "nom", "maj")
SELECT DISTINCT ON (up."userId")
       up."userId", ks."logoContenu", ks."logoType", ks."logoNom", COALESCE(ks."logoMaj", NOW())
  FROM "KonnectSettings" ks
  JOIN "UserProduct" up ON up."id" = ks."userProductId"
 WHERE ks."logoContenu" IS NOT NULL AND ks."logoType" IS NOT NULL
 ORDER BY up."userId", ks."logoMaj" DESC NULLS LAST
ON CONFLICT ("userId") DO NOTHING;

-- Vérif :
--   SELECT "userId", "type", octet_length("contenu") AS octets, "maj" FROM "ClientLogo";
--   -- doit compter autant de clients que :
--   SELECT count(DISTINCT up."userId") FROM "KonnectSettings" ks
--     JOIN "UserProduct" up ON up."id" = ks."userProductId" WHERE ks."logoContenu" IS NOT NULL;
--
-- Rollback (le code d'avant relit "KonnectSettings", toujours rempli) :
--   DROP TABLE IF EXISTS "ClientLogo";
