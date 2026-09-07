-- AUDIT : le mapping des types d'examen de tous les centres est-il sain ?
-- =============================================================================
-- A passer APRES chaque installation de centre, et avant toute campagne de
-- verification. Les trois requetes doivent renvoyer ZERO ligne.
--
-- Ce qu'elles attrapent est exactement ce qui s'est produit entre juillet et
-- septembre 2026 : des rendez-vous d'echographie et de mammographie affiches
-- « Scanner » pendant deux mois, sans qu'aucune erreur ne soit levee nulle part.
--
--   psql "$DATABASE_URL" -f scripts/data-provisioning/AUDIT_exam_mapping.sql

-- Nomenclature : cinq codes canoniques, plus quatre codes SUPPLEMENTAIRES que
-- certains centres emploient pour relire un rendez-vous deja pris (cf.
-- src/lib/examTypes.ts). Ces quatre-la ne sont pas des modalites : ils ne sont
-- ni reservables, ni comptes dans la requete 2.
--
--   PA  panoramique dentaire       (12 Cognac)
--   UI  echographie injectee       (15 Menton)
--   CI  scanner injecte            (15 Menton)
--   OT  osteodensitometrie         (18/20/21 Quimper, 22 Pontivy)

\echo '── 1. Lignes hors nomenclature (doit etre vide) ──'
SELECT em."userProductId" AS upid, em."examCode", em."fr", em."labelFr", em."diminutif",
       CASE
         WHEN em."examCode" NOT IN ('US','MG','RX','MR','CT','PA','UI','CI','OT')
                                                              THEN 'examCode hors nomenclature'
         WHEN em."labelFr" IS DISTINCT FROM em."examCode"     THEN 'labelFr desaligne'
         WHEN btrim(COALESCE(em."diminutif", '')) = ''        THEN 'diminutif vide'
         WHEN em."examCode" IN ('US','MG','RX','MR','CT')
              AND em."fr" IS DISTINCT FROM v."fr"             THEN 'libelle desaligne'
       END AS probleme
  FROM "ExamMapping" em
  LEFT JOIN (VALUES ('US','Echographie'),('MG','Mammographie'),
                    ('RX','Radio'),('MR','IRM'),('CT','Scanner'))
       AS v("examCode","fr") ON v."examCode" = em."examCode"
 WHERE em."examCode" NOT IN ('US','MG','RX','MR','CT','PA','UI','CI','OT')
    OR em."labelFr" IS DISTINCT FROM em."examCode"
    OR btrim(COALESCE(em."diminutif", '')) = ''
    -- Le libelle n'est controle que sur les cinq canoniques : les codes
    -- supplementaires portent un libelle libre, aucune table ne le fixe.
    OR (em."examCode" IN ('US','MG','RX','MR','CT')
        AND em."fr" IS DISTINCT FROM v."fr")
 ORDER BY em."userProductId", em."examCode";

\echo '── 2. Centres sans les cinq lignes canoniques (doit etre vide) ──'
-- On compte les CANONIQUES seulement. Un centre peut porter des lignes
-- supplementaires (PA, UI, CI, OT) en plus : elles ne doivent ni manquer a
-- l'appel ni faire passer le compte a six.
SELECT up."id" AS upid, u."name",
       COUNT(em."id") FILTER (
         WHERE em."examCode" IN ('US','MG','RX','MR','CT')
       ) AS canoniques,
       string_agg(em."examCode", ', ' ORDER BY em."examCode") AS codes
  FROM "UserProduct" up
  JOIN "User" u ON u."id" = up."userId"
  LEFT JOIN "ExamMapping" em ON em."userProductId" = up."id"
 WHERE up."productId" = 2 AND up."removedAt" IS NULL
 GROUP BY up."id", u."name"
HAVING COUNT(em."id") FILTER (
         WHERE em."examCode" IN ('US','MG','RX','MR','CT')
       ) <> 5
 ORDER BY up."id";

\echo '── 3. Diminutifs en collision dans un meme centre (doit etre vide) ──'
-- Deux types partageant un diminutif rendent l'un des deux inaffichable : le
-- libelle est indexe par diminutif, le second ecrase le premier.
SELECT "userProductId" AS upid, "diminutif", COUNT(*) AS types,
       string_agg("examCode", ', ' ORDER BY "examCode") AS codes
  FROM "ExamMapping"
 GROUP BY "userProductId", "diminutif"
HAVING COUNT(*) > 1
 ORDER BY "userProductId";
