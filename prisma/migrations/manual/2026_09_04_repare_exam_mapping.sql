-- Réparation des lignes ExamMapping corrompues par l'ancien écran des diminutifs
-- =============================================================================
-- Contexte. L'écran /talk/parametrage/mapping_exam/type_exam déduisait le
-- libellé français de la POSITION de la ligne :
--
--     fr = code == 0 ? "Echographie" : code == 1 ? "Mammographie"
--        : code == 2 ? "Radio" : code == 3 ? "IRM" : "Scanner"
--
-- Au premier enregistrement d'un centre neuf, cette route renvoyait les valeurs
-- par défaut, dont les clés sont "US"/"MG"/"RX"/"MR"/"CT". Aucune n'est égale à
-- 0, 1, 2 ni 3 : les CINQ lignes tombaient dans le dernier `else` et partaient
-- en base avec fr = 'Scanner'. Sur le groupe Quimper (userProductId 18), les six
-- rendez-vous pris les 1er et 2 septembre 2026, quatre mammographies et deux
-- échographies, s'affichaient donc tous « Scanner » dans la liste des appels, et
-- le registre de complétude réclamait des codes courts pourtant renseignés.
--
-- Le code ne dépend plus de `fr` depuis le 2026-09-04 (src/lib/examLabels.ts et
-- src/lib/completude/talk.ts lisent `examCode`). Ce fichier remet malgré tout la
-- table d'aplomb : `fr` reste exporté par /api/configuration et lisible en SQL,
-- et une colonne dont on sait qu'elle ment est un piège pour la prochaine
-- personne.
--
-- Idempotent : rejouable sans effet de bord.
-- Application : psql "$DATABASE_URL" -f prisma/migrations/manual/2026_09_04_repare_exam_mapping.sql

BEGIN;

-- 1. Lignes dont l'examCode est intact : on réaligne fr et labelFr dessus.
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

-- 2. Lignes dont l'examCode a été écrasé par un index "0".."4" (le POST de
--    l'ancien écran renvoyait Object.entries d'un TABLEAU, donc des rangs).
--    Le rang correspond à l'ordre historique de l'API, qui n'a jamais bougé :
--    0=Echographie, 1=Mammographie, 2=Radio, 3=IRM, 4=Scanner.
UPDATE "ExamMapping" AS em
   SET "examCode" = v."examCode",
       "fr"       = v."fr",
       "labelFr"  = v."examCode"
  FROM (VALUES
          ('0', 'US', 'Echographie'),
          ('1', 'MG', 'Mammographie'),
          ('2', 'RX', 'Radio'),
          ('3', 'MR', 'IRM'),
          ('4', 'CT', 'Scanner')
       ) AS v("rang", "examCode", "fr")
 WHERE em."examCode" = v."rang"
   -- Ne pas violer @@unique([userProductId, examCode]) si le centre porte déjà
   -- une ligne au bon code : dans ce cas la ligne indexée est un doublon, elle
   -- est supprimée juste après.
   AND NOT EXISTS (
     SELECT 1 FROM "ExamMapping" autre
      WHERE autre."userProductId" = em."userProductId"
        AND autre."examCode" = v."examCode"
   );

-- 3. Doublons résiduels : une ligne indexée que l'étape 2 n'a pas pu renommer
--    parce que le bon code existait déjà. On garde la ligne canonique.
DELETE FROM "ExamMapping"
 WHERE "examCode" IN ('0', '1', '2', '3', '4');

-- 4. Diminutif vide : le défaut est le code canonique lui-même.
UPDATE "ExamMapping"
   SET "diminutif" = "examCode"
 WHERE btrim(COALESCE("diminutif", '')) = '';

COMMIT;

-- Contrôle. Doit renvoyer zéro ligne.
--   SELECT "userProductId", "examCode", "fr", "labelFr", "diminutif"
--     FROM "ExamMapping"
--    WHERE ("examCode", "fr") NOT IN (
--            ('US','Echographie'), ('MG','Mammographie'), ('RX','Radio'),
--            ('MR','IRM'), ('CT','Scanner'))
--    ORDER BY "userProductId", "examCode";
--
-- Et pour voir le résultat sur Quimper :
--   SELECT "examCode", "fr", "diminutif" FROM "ExamMapping"
--    WHERE "userProductId" = 18 ORDER BY "examCode";
