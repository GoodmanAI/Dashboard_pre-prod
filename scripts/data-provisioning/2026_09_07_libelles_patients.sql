-- Libelles dits et ecrits au patient : alignement des trois centres en service
-- =============================================================================
-- Arbitrage du 2026-09-07. Ces valeurs sortent a deux endroits :
--
--   - PRONONCEES par le robot a chaque annonce de creneau (via `siteCodeToName`,
--     encore en dur dans getInitInfo.js, aligne dans le meme lot) ;
--   - ECRITES dans les convocations et les SMS de confirmation (via
--     `siteDetails[].centerName`, qui vient d'ICI depuis que LyraeTalk resout la
--     fiche par `getSiteFiche` — avant, le Dashboard etait ignore de ces deux
--     canaux et le code gagnait toujours).
--
-- C'est ce changement de source qui rend l'alignement urgent : sans lui, les
-- convocations de Menton seraient parties en « CH MENTON » et celles de Quimper
-- en « RIM29SUD Quimper », un nom interne que le patient ne connait pas.
--
--   | upid | centerName avant     | apres              | address2 avant   | apres         |
--   |------|----------------------|--------------------|------------------|---------------|
--   | 12   | Imagerie Medicale Cognac (deja bon)      | 16100 Cognac (deja bon)          |
--   | 15   | CH MENTON            | CH Menton          | 06200 MENTON     | 06200 Menton  |
--   | 18   | RIM29SUD Quimper     | Centre Quimper     | 29000  Quimper   | 29000 Quimper |
--
-- Cognac n'est pas modifie : sa fiche etait deja juste en base, c'est le code du
-- robot qui portait « IMAGERIE MEDICALE COGNAC » et « CHATEAUBERNARD ».
--
-- ⚠️ VERIFIER LES upid AVANT DE JOUER, comme pour tout script de ce dossier :
--   SELECT up."id", u."name" FROM "UserProduct" up
--     JOIN "User" u ON u."id" = up."userId" WHERE up."id" IN (12,15,18);
--
-- Idempotent : rejouer ne fait rien de plus.
--
--   psql "$DATABASE_URL" -f scripts/data-provisioning/2026_09_07_libelles_patients.sql

\set ON_ERROR_STOP on

BEGIN;

-- CH Menton : le sigle reste, les capitales partent. « CH MENTON » se lit comme
-- un cri dans un mail, et la synthese vocale detache les majuscules.
UPDATE "TalkSettings"
   SET "centerName" = 'CH Menton',
       "address2"   = '06200 Menton'
 WHERE "userProductId" = 15;

-- Quimper : « RIM29SUD » est le nom interne du groupe, colle en capitales et
-- imprononcable par la synthese vocale. Le patient a appele le centre de
-- Quimper, c'est ce nom qu'il attend. Le double espace de l'adresse part aussi.
UPDATE "TalkSettings"
   SET "centerName" = 'Centre Quimper',
       "address2"   = '29000 Quimper'
 WHERE "userProductId" = 18;

COMMIT;

-- Controle des trois centres tranches.
SELECT "userProductId" AS upid, "centerName", "address", "address2"
  FROM "TalkSettings" WHERE "userProductId" IN (12, 15, 18)
 ORDER BY "userProductId";

-- Balayage des AUTRES centres : les memes defauts s'y trouvent probablement.
-- Ces lignes ne sont pas des erreurs en soi, elles demandent une relecture.
\echo '── Fiches a relire : capitales, espaces doubles, code postal absent ──'
SELECT ts."userProductId" AS upid, u."name" AS client,
       ts."centerName", ts."address2",
       CASE
         WHEN ts."centerName" = upper(ts."centerName")
              AND ts."centerName" ~ '[A-Z]{4,}'        THEN 'nom tout en capitales'
         WHEN ts."address2" ~ '\s\s'                    THEN 'espace double dans l''adresse'
         WHEN ts."address2" !~ '^\d{5}'                 THEN 'adresse sans code postal en tete'
       END AS a_relire
  FROM "TalkSettings" ts
  JOIN "UserProduct" up ON up."id" = ts."userProductId"
  JOIN "User" u ON u."id" = up."userId"
 WHERE up."removedAt" IS NULL
   AND ( (ts."centerName" = upper(ts."centerName") AND ts."centerName" ~ '[A-Z]{4,}')
      OR ts."address2" ~ '\s\s'
      OR ts."address2" !~ '^\d{5}' )
 ORDER BY ts."userProductId";
