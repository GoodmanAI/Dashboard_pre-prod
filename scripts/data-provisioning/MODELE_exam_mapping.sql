-- MODELE : mapping des types d'examen d'un nouveau centre
-- =============================================================================
-- A COPIER pour chaque nouveau centre, en remplacant :
--   :UPID      le userProductId du centre
--   :DIM_xx    le code court que SON logiciel de gestion emploie pour ce type
--
-- Ne remplacer QUE les diminutifs. `examCode`, `fr` et `labelFr` sont la
-- nomenclature interne : ils sont identiques pour tous les centres et ne se
-- negocient pas.
--
-- ── La regle, et pourquoi elle existe ────────────────────────────────────────
--   "examCode"  = le type canonique. TOUJOURS US / MG / RX / MR / CT.
--   "fr"        = le libelle, sans accent, "Radio" et non "Radiographie".
--                 Ces valeurs exactes sont celles que `examCodeMap`
--                 (api/configuration/route.ts) sait retraduire en code.
--   "labelFr"   = le code canonique, identique a "examCode".
--   "diminutif" = LE SEUL CHAMP PROPRE AU CENTRE. C'est ce que LyraeTalk renvoie
--                 dans `stats.exam_type_id`, donc ce qui sert a retrouver le
--                 libelle d'un rendez-vous pris.
--
-- Le modele precedent (`pontivy_exam_mapping_2026_08_05.sql`) mettait le code du
-- RIS dans `examCode` et le code canonique dans `labelFr`, c'est-a-dire
-- l'inverse. Combine a l'ancien ecran de saisie qui ecrivait "Scanner" dans les
-- cinq `fr`, cela a produit trois conventions concurrentes dans une table de
-- cinq colonnes, et des rendez-vous d'echographie affiches "Scanner" pendant
-- deux mois. Ne pas repartir de ce fichier-la.
--
-- ── Exemple : RIM29SUD, dont le logiciel note la radio DX ────────────────────
--   ('RX', 'Radio', 'RX', 'DX')     <- diminutif DX, examCode RX
--
-- ── Exemple : Le Creusot, qui note EC / RA / MA / IR / SC ────────────────────
--   ('US', 'Echographie',  'US', 'EC')
--   ('RX', 'Radio',        'RX', 'RA')
--   ...
--
-- Un centre dont le logiciel utilise les codes standards met simplement le code
-- canonique en diminutif.
--
-- Application :
--   psql "$DATABASE_URL" -v UPID=23 -f scripts/data-provisioning/MODELE_exam_mapping.sql

\set ON_ERROR_STOP on

BEGIN;

DELETE FROM "ExamMapping" WHERE "userProductId" = :UPID;

INSERT INTO "ExamMapping" ("userProductId", "examCode", "fr", "labelFr", "diminutif") VALUES
  (:UPID, 'US', 'Echographie',  'US', 'US'),   -- <- remplacer le dernier champ
  (:UPID, 'MG', 'Mammographie', 'MG', 'MG'),   -- <- remplacer le dernier champ
  (:UPID, 'RX', 'Radio',        'RX', 'RX'),   -- <- remplacer le dernier champ
  (:UPID, 'MR', 'IRM',          'MR', 'MR'),   -- <- remplacer le dernier champ
  (:UPID, 'CT', 'Scanner',      'CT', 'CT');   -- <- remplacer le dernier champ

COMMIT;

-- Controle immediat : les cinq types, la bonne nomenclature, les diminutifs du
-- centre. A relire avant de passer a la suite de l'installation.
SELECT "examCode", "fr", "labelFr", "diminutif"
  FROM "ExamMapping" WHERE "userProductId" = :UPID ORDER BY "examCode";
