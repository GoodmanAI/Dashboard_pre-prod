-- Mapping des types d'examen : IMM Macon (10) et GIE IRM Macon (11)
-- =============================================================================
-- L'audit du 2026-09-04 a montre que ces deux centres n'ont AUCUNE ligne dans
-- ExamMapping, alors que leur logiciel de gestion emploie ses propres codes.
-- Ils sont declares dans LyraeTalk (`userProductIdToTypeExams`, getInitInfo.js) :
--
--     US -> EC     RX -> RA     MG -> MA     MR -> IR     CT -> SC
--
-- Sans ces lignes, un rendez-vous pris chez eux remonte `exam_type_id = 'EC'` et
-- s'affiche « EC » au lieu de « Echographie », faute de savoir traduire le code.
-- C'est la meme famille de probleme que les rendez-vous de Quimper affiches
-- « Scanner », par l'autre bout : la, le libelle etait faux ; ici, il manque.
--
-- Les codes ci-dessous viennent de getInitInfo.js, source de verite cote robot.
-- A RELIRE avec le centre avant application : si son RIS a change de codes
-- depuis, c'est getInitInfo qu'il faut corriger d'abord, pas ce fichier.
--
-- Convention : cf. scripts/data-provisioning/MODELE_exam_mapping.sql
-- Controle   : psql "$DATABASE_URL" -f scripts/data-provisioning/AUDIT_exam_mapping.sql
--
-- Application :
--   psql "$DATABASE_URL" -f scripts/data-provisioning/macon_exam_mapping_2026_09_04.sql

\set ON_ERROR_STOP on

BEGIN;

DELETE FROM "ExamMapping" WHERE "userProductId" IN (10, 11);

INSERT INTO "ExamMapping" ("userProductId", "examCode", "fr", "labelFr", "diminutif") VALUES
  -- IMM Macon
  (10, 'US', 'Echographie',  'US', 'EC'),
  (10, 'MG', 'Mammographie', 'MG', 'MA'),
  (10, 'RX', 'Radio',        'RX', 'RA'),
  (10, 'MR', 'IRM',          'MR', 'IR'),
  (10, 'CT', 'Scanner',      'CT', 'SC'),
  -- GIE IRM Macon
  (11, 'US', 'Echographie',  'US', 'EC'),
  (11, 'MG', 'Mammographie', 'MG', 'MA'),
  (11, 'RX', 'Radio',        'RX', 'RA'),
  (11, 'MR', 'IRM',          'MR', 'IR'),
  (11, 'CT', 'Scanner',      'CT', 'SC');

COMMIT;

SELECT "userProductId" AS upid, "examCode", "fr", "diminutif"
  FROM "ExamMapping" WHERE "userProductId" IN (10, 11)
 ORDER BY "userProductId", "examCode";
