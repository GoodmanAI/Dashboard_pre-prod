-- =============================================================================
-- Controle avant l'ajout de N01MR141 (02/11/2026), LECTURE SEULE
-- =============================================================================
--
-- A lancer AVANT 2026_11_02_examen_N01MR141.sql. N'ecrit rien (transaction en
-- lecture seule, annulee a la fin).
--   psql "$DATABASE_URL" -f scripts/data-provisioning/2026_11_02_controle_N01MR141.sql
--
-- Rend :
--   1. les codes N01MR1xx deja utilises, par source (referentiel, Talk, Konnect) ;
--   2. N01MR141 partout ou il apparait deja (vide attendu) ;
--   3. par centre Talk : l'etat de N01MR044 et N01MR043, et ce que N01MR141 heritera ;
--   4. par centre Konnect : idem, plus « Reservable en ligne » et « Ordonnance ».
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off

BEGIN TRANSACTION READ ONLY;

-- Lignes Talk a plat (objet indexe par code, ou tableau de lignes) : CTE
-- `talk_lignes`, repetee dans chaque requete (une vue temporaire est refusee en
-- lecture seule).

-- 1. Codes N01MR1xx deja utilises.
WITH talk_lignes AS (
  SELECT ts."userProductId", e.key AS code, e.value AS ligne
    FROM "TalkSettings" ts,
         jsonb_each(CASE WHEN jsonb_typeof(ts."exams"::jsonb) = 'object'
                         THEN ts."exams"::jsonb ELSE '{}'::jsonb END) e
  UNION ALL
  SELECT ts."userProductId", el->>'codeExamen' AS code, el AS ligne
    FROM "TalkSettings" ts,
         jsonb_array_elements(CASE WHEN jsonb_typeof(ts."exams"::jsonb) = 'array'
                                   THEN ts."exams"::jsonb ELSE '[]'::jsonb END) el
)
SELECT code,
       string_agg(DISTINCT source, ', ' ORDER BY source) AS sources,
       count(*)                                           AS lignes,
       string_agg(DISTINCT libelle, ' | ')                AS libelles
  FROM (
    SELECT "codeExamen" AS code, 'referentiel' AS source, "libelle" AS libelle
      FROM "ReferentielExamens"
    UNION ALL
    SELECT code, 'talk', ligne->>'libelle' FROM talk_lignes
    UNION ALL
    SELECT "codeExamen", 'konnect', "libelle" FROM "KonnectExamens"
  ) t
 WHERE code ~ '^N01MR1[0-9]{2}$'
 GROUP BY code
 ORDER BY code;

-- 2. N01MR141 deja present ? (aucune ligne attendue)
WITH talk_lignes AS (
  SELECT ts."userProductId", e.key AS code, e.value AS ligne
    FROM "TalkSettings" ts,
         jsonb_each(CASE WHEN jsonb_typeof(ts."exams"::jsonb) = 'object'
                         THEN ts."exams"::jsonb ELSE '{}'::jsonb END) e
  UNION ALL
  SELECT ts."userProductId", el->>'codeExamen' AS code, el AS ligne
    FROM "TalkSettings" ts,
         jsonb_array_elements(CASE WHEN jsonb_typeof(ts."exams"::jsonb) = 'array'
                                   THEN ts."exams"::jsonb ELSE '[]'::jsonb END) el
)
SELECT 'referentiel' AS ou, NULL::int AS "userProductId", "typeExamen", "libelle"
  FROM "ReferentielExamens" WHERE "codeExamen" = 'N01MR141'
UNION ALL
SELECT 'talk', "userProductId", ligne->>'typeExamen', ligne->>'libelle'
  FROM talk_lignes WHERE code = 'N01MR141'
UNION ALL
SELECT 'konnect', "userProductId", "typeExamen", "libelle"
  FROM "KonnectExamens" WHERE "codeExamen" = 'N01MR141';

WITH talk_lignes AS (
  SELECT ts."userProductId", e.key AS code, e.value AS ligne
    FROM "TalkSettings" ts,
         jsonb_each(CASE WHEN jsonb_typeof(ts."exams"::jsonb) = 'object'
                         THEN ts."exams"::jsonb ELSE '{}'::jsonb END) e
  UNION ALL
  SELECT ts."userProductId", el->>'codeExamen' AS code, el AS ligne
    FROM "TalkSettings" ts,
         jsonb_array_elements(CASE WHEN jsonb_typeof(ts."exams"::jsonb) = 'array'
                                   THEN ts."exams"::jsonb ELSE '[]'::jsonb END) el
)
SELECT CASE WHEN EXISTS (SELECT 1 FROM "ReferentielExamens" WHERE "codeExamen" = 'N01MR141')
              OR EXISTS (SELECT 1 FROM talk_lignes WHERE code = 'N01MR141')
              OR EXISTS (SELECT 1 FROM "KonnectExamens" WHERE "codeExamen" = 'N01MR141')
            THEN 'N01MR141 deja utilise : verifier la liste 2 avant d''inserer'
            ELSE 'N01MR141 libre' END AS verdict_code,
       (SELECT count(*) FROM "ReferentielExamens"
         WHERE "codeExamen" IN ('N01MR044', 'N01MR043')) AS parents_au_referentiel;

-- 3. Centres Talk : parents et heritage prevu.
WITH talk_lignes AS (
  SELECT ts."userProductId", e.key AS code, e.value AS ligne
    FROM "TalkSettings" ts,
         jsonb_each(CASE WHEN jsonb_typeof(ts."exams"::jsonb) = 'object'
                         THEN ts."exams"::jsonb ELSE '{}'::jsonb END) e
  UNION ALL
  SELECT ts."userProductId", el->>'codeExamen' AS code, el AS ligne
    FROM "TalkSettings" ts,
         jsonb_array_elements(CASE WHEN jsonb_typeof(ts."exams"::jsonb) = 'array'
                                   THEN ts."exams"::jsonb ELSE '[]'::jsonb END) el
), c AS (
  SELECT up."id" AS "userProductId", u."name" AS client, up."removedAt"
    FROM "TalkSettings" ts
    JOIN "UserProduct" up ON up."id" = ts."userProductId"
    JOIN "User" u ON u."id" = up."userId"
), p AS (
  SELECT "userProductId", code,
         ((ligne->'performed') IS DISTINCT FROM 'false'::jsonb) AS performed,
         NULLIF(btrim(COALESCE(ligne->>'codeExamenClient', '')), '') AS code_ris,
         ligne->>'codeExamenClientInject'                       AS code_injecte,
         ligne->'postes'                                        AS postes
    FROM talk_lignes
   WHERE code IN ('N01MR044', 'N01MR043')
)
SELECT c."userProductId", c.client, (c."removedAt" IS NOT NULL) AS retire,
       l.performed AS lomb_pratique, l.code_ris AS lomb_ris, l.code_injecte AS lomb_inj,
       d.performed AS dors_pratique, d.code_ris AS dors_ris,
       CASE WHEN l.code_ris IS NOT NULL THEN 'N01MR044'
            WHEN d.code_ris IS NOT NULL THEN 'N01MR043'
            ELSE 'aucun' END                                    AS herite_de,
       COALESCE(l.code_ris, d.code_ris)                         AS ris_herite,
       CASE WHEN l.code_ris IS NOT NULL THEN l.postes ELSE d.postes END AS postes_herites
  FROM c
  LEFT JOIN p l ON l."userProductId" = c."userProductId" AND l.code = 'N01MR044'
  LEFT JOIN p d ON d."userProductId" = c."userProductId" AND d.code = 'N01MR043'
 ORDER BY retire, c."userProductId";

-- 4. Centres Konnect : parents et heritage prevu. Un centre sans aucune ligne est
--    vierge : il sera amorce, pas complete.
WITH c AS (
  SELECT k."userProductId", u."name" AS client, count(*) AS lignes
    FROM "KonnectExamens" k
    JOIN "UserProduct" up ON up."id" = k."userProductId"
    JOIN "User" u ON u."id" = up."userId"
   GROUP BY k."userProductId", u."name"
), p AS (
  SELECT "userProductId", "codeExamen" AS code, "performed",
         NULLIF(btrim("codeExamenClient"), '') AS code_ris,
         "codeExamenInjection", "postes", "reservableEnLigne", "ordoOblig"
    FROM "KonnectExamens"
   WHERE "codeExamen" IN ('N01MR044', 'N01MR043')
)
SELECT c."userProductId", c.client, c.lignes,
       l."performed" AS lomb_pratique, l.code_ris AS lomb_ris,
       d."performed" AS dors_pratique, d.code_ris AS dors_ris,
       CASE WHEN l.code_ris IS NOT NULL THEN 'N01MR044'
            WHEN d.code_ris IS NOT NULL THEN 'N01MR043'
            ELSE 'aucun' END                                         AS herite_de,
       COALESCE(l.code_ris, d.code_ris)                              AS ris_herite,
       CASE WHEN l.code_ris IS NOT NULL THEN l."postes" ELSE d."postes" END AS postes_herites,
       CASE WHEN l.code_ris IS NOT NULL THEN l."reservableEnLigne" ELSE d."reservableEnLigne" END AS reservable_herite,
       CASE WHEN l.code_ris IS NOT NULL THEN l."ordoOblig" ELSE d."ordoOblig" END AS ordo_herite
  FROM c
  LEFT JOIN p l ON l."userProductId" = c."userProductId" AND l.code = 'N01MR044'
  LEFT JOIN p d ON d."userProductId" = c."userProductId" AND d.code = 'N01MR043'
 ORDER BY c."userProductId";

ROLLBACK;
