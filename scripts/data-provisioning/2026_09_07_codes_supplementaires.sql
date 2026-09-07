-- Codes d'examen supplementaires des centres en service
-- =============================================================================
-- Ces quatre codes vivent aujourd'hui dans le `getInitInfo.js` de LyraeTalk
-- (`userProductIdToTypeExams`) et nulle part en base. Sans eux, la migration de
-- la configuration vers le Dashboard les perdrait, et un patient qui appelle
-- pour deplacer l'examen concerne ne serait plus compris.
--
-- CE NE SONT PAS DES MODALITES RESERVABLES. Le patient ne peut pas demander un
-- panoramique au robot : ces lignes servent a RELIRE un rendez-vous deja pris,
-- que le logiciel du centre renvoie avec son code maison. Elles ne comptent pas
-- dans la requete 2 de l'audit, qui n'exige que les cinq canoniques.
--
-- Source : repos/lyraetalk/src/helpers/calls/handlers/utils/dashboard/getInitInfo.js
--          `userProductIdToTypeExams`, releve le 2026-09-07.
--
--   | upid | code | ce que c'est          | centre                    |
--   |------|------|-----------------------|---------------------------|
--   | 12   | PA   | panoramique dentaire  | Cognac                    |
--   | 15   | UI   | echographie injectee  | CH Menton                 |
--   | 15   | CI   | scanner injecte       | CH Menton                 |
--   | 18   | OT   | osteodensitometrie    | Quimper                   |
--   | 20   | OT   | osteodensitometrie    | Fouesnant                 |
--   | 21   | OT   | osteodensitometrie    | Pont-l'Abbe               |
--   | 22   | OT   | osteodensitometrie    | Pontivy                   |
--
-- ⚠️ VERIFIER LES upid AVANT DE JOUER : ce sont les `userProductId` releves dans
-- le code du robot, pas une lecture de cette base. Un identifiant qui aurait
-- change rattacherait le code au mauvais centre, en silence.
--
--   SELECT up."id", u."name" FROM "UserProduct" up
--     JOIN "User" u ON u."id" = up."userId"
--    WHERE up."id" IN (12,15,18,20,21,22);
--
-- Idempotent : ON CONFLICT sur (userProductId, examCode), sur a rejouer.
--
--   psql "$DATABASE_URL" -f scripts/data-provisioning/2026_09_07_codes_supplementaires.sql

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO "ExamMapping" ("userProductId", "examCode", "fr", "labelFr", "diminutif") VALUES
  (12, 'PA', 'Panoramique dentaire', 'PA', 'PA'),
  (15, 'UI', 'Echographie injectee', 'UI', 'UI'),
  (15, 'CI', 'Scanner injecte',      'CI', 'CI'),
  (18, 'OT', 'Osteodensitometrie',   'OT', 'OT'),
  (20, 'OT', 'Osteodensitometrie',   'OT', 'OT'),
  (21, 'OT', 'Osteodensitometrie',   'OT', 'OT'),
  (22, 'OT', 'Osteodensitometrie',   'OT', 'OT')
ON CONFLICT ("userProductId", "examCode") DO UPDATE
  SET "fr"        = EXCLUDED."fr",
      "labelFr"   = EXCLUDED."labelFr",
      -- Le diminutif est le code du logiciel du centre : ne pas l'ecraser s'il
      -- a deja ete ajuste a la main, comme le DX de Pontivy l'a ete.
      "diminutif" = COALESCE(NULLIF(btrim("ExamMapping"."diminutif"), ''), EXCLUDED."diminutif");

COMMIT;

-- Controle : sept lignes, et les centres gardent leurs cinq canoniques.
SELECT "userProductId" AS upid, "examCode", "fr", "labelFr", "diminutif"
  FROM "ExamMapping"
 WHERE "examCode" IN ('PA','UI','CI','OT')
 ORDER BY "userProductId", "examCode";

-- Rollback :
--   DELETE FROM "ExamMapping" WHERE "examCode" IN ('PA','UI','CI','OT');
--     -- Sans consequence tant que LyraeTalk lit encore sa table en dur.
