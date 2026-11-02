-- =============================================================================
-- Ajout de l'examen N01MR141 « IRM du rachis dorso-lombaire » au referentiel
-- (02/11/2026)
-- =============================================================================
--
-- Plan : lyrae/plans/2026-11-ajout-examen-au-referentiel.md (decisions du 02/11).
-- Procedure generale : RUNBOOK.md, « Ajouter un examen au referentiel ».
--
-- Ecrit UNE ligne dans "ReferentielExamens" : N01MR141 / MR / source neuracorp /
-- repliSur {N01MR044,N01MR043}. Rien d'autre : chez un centre deja configure, la
-- ligne apparait a la LECTURE du mapping, non pratiquee, avec le code RIS de l'IRM
-- lombaire (sinon dorsale). Elle n'est ecrite chez le centre que quand il enregistre.
--
-- ORDRE :
--   1. scripts/data-provisioning/2026_11_02_controle_N01MR141.sql (lecture seule) ;
--   2. prisma/migrations/manual/2026_11_02_referentiel_repli.sql ;
--   3. build et redemarrage du Dashboard (le code qui lit `repliSur`) ;
--   4. ce script.
--
-- GARDES (calculees, le script s'arrete et annule s'il en echoue une) :
--   - la colonne "repliSur" existe ;
--   - les deux parents sont au referentiel ;
--   - N01MR141 n'existe nulle part sous un autre type ou un autre libelle
--     (ReferentielExamens, TalkSettings.exams de tous les centres, KonnectExamens).
--
-- Idempotent : relance sans effet si la ligne est deja la, a l'identique.
--   psql "$DATABASE_URL" -f scripts/data-provisioning/2026_11_02_examen_N01MR141.sql
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off

BEGIN;

DO $$
DECLARE
  v_code    constant text   := 'N01MR141';
  v_type    constant text   := 'MR';
  v_libelle constant text   := 'IRM du rachis dorso-lombaire';
  v_parents constant text[] := ARRAY['N01MR044', 'N01MR043'];
  v_conflits text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'ReferentielExamens' AND column_name = 'repliSur'
  ) THEN
    RAISE EXCEPTION 'Colonne "repliSur" absente : passer d''abord prisma/migrations/manual/2026_11_02_referentiel_repli.sql';
  END IF;

  SELECT string_agg(p, ', ') INTO v_conflits
    FROM unnest(v_parents) p
   WHERE NOT EXISTS (SELECT 1 FROM "ReferentielExamens" r WHERE r."codeExamen" = p);
  IF v_conflits IS NOT NULL THEN
    RAISE EXCEPTION 'Parents absents du referentiel : %', v_conflits;
  END IF;

  -- Referentiel : meme code, autre type ou autre libelle.
  SELECT string_agg(format('ReferentielExamens type=%s libelle=%s', r."typeExamen", r."libelle"), ' | ')
    INTO v_conflits
    FROM "ReferentielExamens" r
   WHERE r."codeExamen" = v_code
     AND (r."typeExamen" IS DISTINCT FROM v_type OR r."libelle" IS DISTINCT FROM v_libelle);
  IF v_conflits IS NOT NULL THEN
    RAISE EXCEPTION 'Code % deja pris : %', v_code, v_conflits;
  END IF;

  -- TalkSettings.exams : objet indexe par code, ou tableau de lignes.
  SELECT string_agg(format('TalkSettings userProductId=%s type=%s libelle=%s',
                           t."userProductId", t.ligne->>'typeExamen', t.ligne->>'libelle'), ' | ')
    INTO v_conflits
    FROM (
      SELECT ts."userProductId", e.value AS ligne
        FROM "TalkSettings" ts,
             jsonb_each(CASE WHEN jsonb_typeof(ts."exams"::jsonb) = 'object'
                             THEN ts."exams"::jsonb ELSE '{}'::jsonb END) e
       WHERE e.key = v_code
      UNION ALL
      SELECT ts."userProductId", el AS ligne
        FROM "TalkSettings" ts,
             jsonb_array_elements(CASE WHEN jsonb_typeof(ts."exams"::jsonb) = 'array'
                                       THEN ts."exams"::jsonb ELSE '[]'::jsonb END) el
       WHERE el->>'codeExamen' = v_code
    ) t
   WHERE (t.ligne->>'typeExamen') IS DISTINCT FROM v_type
      OR (t.ligne->>'libelle') IS DISTINCT FROM v_libelle;
  IF v_conflits IS NOT NULL THEN
    RAISE EXCEPTION 'Code % deja pris : %', v_code, v_conflits;
  END IF;

  -- KonnectExamens.
  SELECT string_agg(format('KonnectExamens userProductId=%s type=%s libelle=%s',
                           k."userProductId", k."typeExamen", k."libelle"), ' | ')
    INTO v_conflits
    FROM "KonnectExamens" k
   WHERE k."codeExamen" = v_code
     AND (k."typeExamen" IS DISTINCT FROM v_type OR k."libelle" IS DISTINCT FROM v_libelle);
  IF v_conflits IS NOT NULL THEN
    RAISE EXCEPTION 'Code % deja pris : %', v_code, v_conflits;
  END IF;

  INSERT INTO "ReferentielExamens" ("codeExamen", "typeExamen", "libelle", "source", "repliSur")
  VALUES (v_code, v_type, v_libelle, 'neuracorp', v_parents)
  ON CONFLICT ("codeExamen") DO UPDATE
     SET "repliSur"  = EXCLUDED."repliSur",
         -- `importeLe` fait bouger l'ETag de l'ecran de mapping Konnect.
         "importeLe" = NOW()
   WHERE "ReferentielExamens"."repliSur" IS DISTINCT FROM EXCLUDED."repliSur";

  -- Controle avant COMMIT : la ligne doit etre exactement celle attendue.
  IF (SELECT count(*) FROM "ReferentielExamens"
       WHERE "codeExamen" = v_code AND "typeExamen" = v_type
         AND "libelle" = v_libelle AND "repliSur" = v_parents) <> 1 THEN
    RAISE EXCEPTION 'Ligne % absente ou differente apres insertion', v_code;
  END IF;
END
$$;

-- Verdict calcule.
SELECT r."codeExamen",
       r."typeExamen",
       r."libelle",
       r."source",
       r."repliSur",
       r."importeLe",
       (SELECT count(*) FROM "ReferentielExamens" WHERE "codeExamen" = 'N01MR141') AS lignes_n01mr141,
       (SELECT count(*) FROM "ReferentielExamens")                                  AS lignes_referentiel,
       CASE WHEN r."repliSur" = ARRAY['N01MR044', 'N01MR043']::text[]
             AND r."typeExamen" = 'MR'
             AND r."libelle" = 'IRM du rachis dorso-lombaire'
            THEN 'conforme' ELSE 'NON CONFORME' END                                 AS verdict
  FROM "ReferentielExamens" r
 WHERE r."codeExamen" = 'N01MR141';

COMMIT;
