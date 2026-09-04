-- Normalisation de ExamMapping."examCode" sur la nomenclature canonique
-- =============================================================================
-- Suite de 2026_09_04_repare_exam_mapping.sql, qui remettait `fr` et `labelFr`
-- d'aplomb. Celui-ci s'occupe de `examCode`.
--
-- Contexte. Trois chemins ont ecrit dans cette table avec trois conventions :
--
--   | Chemin                            | examCode      | fr           | labelFr   |
--   |-----------------------------------|---------------|--------------|-----------|
--   | ecran diminutifs, avant le 06/08  | canonique     | "Scanner" x5 | "CT"      |
--   | ecran diminutifs, apres le 06/08  | rang "0".."4" | par position | undefined |
--   | script de provisionnement Pontivy | code RIS      | correct      | canonique |
--
-- Audit du 2026-09-04 sur les treize centres : une seule ligne restait hors
-- nomenclature, la radio de Pontivy (userProductId 22) :
--
--     examCode 'DX' | fr 'Radio' | labelFr 'RX' | diminutif 'DX'
--
-- Le code canonique y est dans `labelFr`. On le remet dans `examCode` en
-- PRESERVANT `diminutif` : 'DX' est le code que le logiciel de Pontivy emploie
-- pour une radio, c'est lui que LyraeTalk renvoie dans `stats.exam_type_id`, et
-- le perdre casserait l'affichage de tous les rendez-vous de radio du centre.
--
-- Le code ne depend plus de cette normalisation depuis le 2026-09-04
-- (`src/lib/examTypes.ts`, fonction `codeCanonique`, retrouve le type depuis
-- `labelFr` puis `fr`). Ce fichier evite simplement que la table continue de
-- porter trois conventions, et que la prochaine requete SQL ecrite a la main
-- tombe dans le piege.
--
-- Idempotent : rejouable sans effet de bord.
-- Application : psql "$DATABASE_URL" -f prisma/migrations/manual/2026_09_04_normalise_exam_code.sql

BEGIN;

-- examCode hors nomenclature, code canonique recuperable depuis labelFr.
UPDATE "ExamMapping" AS em
   SET "examCode" = em."labelFr"
 WHERE em."examCode" NOT IN ('US', 'MG', 'RX', 'MR', 'CT')
   AND em."labelFr" IN ('US', 'MG', 'RX', 'MR', 'CT')
   -- Ne pas violer @@unique([userProductId, examCode]) si le centre porte deja
   -- une ligne au code canonique.
   AND NOT EXISTS (
     SELECT 1 FROM "ExamMapping" autre
      WHERE autre."userProductId" = em."userProductId"
        AND autre."examCode" = em."labelFr"
   );

-- Meme chose, code recuperable depuis le libelle. En DERNIER recours : `fr` est
-- la colonne qui a ete corrompue, plusieurs centres l'ont eue a 'Scanner' sur
-- leurs cinq lignes. On ne l'utilise donc que la ou `labelFr` n'a rien donne.
UPDATE "ExamMapping" AS em
   SET "examCode" = v."examCode"
  FROM (VALUES
          ('Echographie',  'US'),
          ('Mammographie', 'MG'),
          ('Radio',        'RX'),
          ('IRM',          'MR'),
          ('Scanner',      'CT')
       ) AS v("fr", "examCode")
 WHERE em."examCode" NOT IN ('US', 'MG', 'RX', 'MR', 'CT')
   AND em."fr" = v."fr"
   AND NOT EXISTS (
     SELECT 1 FROM "ExamMapping" autre
      WHERE autre."userProductId" = em."userProductId"
        AND autre."examCode" = v."examCode"
   );

-- `labelFr` porte le code canonique, `fr` le libelle. On realigne les lignes
-- qu'on vient de renommer.
UPDATE "ExamMapping" AS em
   SET "fr"      = v."fr",
       "labelFr" = v."examCode"
  FROM (VALUES
          ('US', 'Echographie'),
          ('MG', 'Mammographie'),
          ('RX', 'Radio'),
          ('MR', 'IRM'),
          ('CT', 'Scanner')
       ) AS v("examCode", "fr")
 WHERE em."examCode" = v."examCode"
   AND (em."fr" IS DISTINCT FROM v."fr" OR em."labelFr" IS DISTINCT FROM v."examCode");

COMMIT;

-- Controle. Doit renvoyer zero ligne.
--   SELECT "userProductId", "examCode", "fr", "labelFr", "diminutif"
--     FROM "ExamMapping"
--    WHERE "examCode" NOT IN ('US','MG','RX','MR','CT')
--       OR ("examCode", "fr", "labelFr") NOT IN (
--            ('US','Echographie','US'), ('MG','Mammographie','MG'),
--            ('RX','Radio','RX'), ('MR','IRM','MR'), ('CT','Scanner','CT'))
--    ORDER BY "userProductId", "examCode";
--
-- Et le diminutif de Pontivy, qui doit toujours valoir DX :
--   SELECT "examCode", "diminutif" FROM "ExamMapping"
--    WHERE "userProductId" = 22 ORDER BY "examCode";
