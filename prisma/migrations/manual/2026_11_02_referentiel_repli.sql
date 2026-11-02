-- Migration manuelle : `repliSur` sur le referentiel d'examens (02/11/2026)
--
-- POURQUOI. Un examen ajoute au referentiel (premier cas : N01MR141, IRM du rachis
-- dorso-lombaire) arrive chez un centre deja configure NON PRATIQUE et sans code RIS.
-- Or la phrase du patient qui y mene etait hier captee par un examen voisin (l'IRM
-- lombaire) que le centre reservait. Sans repli, le centre transfererait ce qu'il
-- reservait la veille.
--
-- CE QUE LA COLONNE PORTE. La liste ORDONNEE des examens parents d'un examen ajoute
-- (`{N01MR044,N01MR043}` pour N01MR141). Elle est portee par le referentiel, jamais
-- saisie par le client. A la lecture du mapping (Talk, Questions examens, Konnect),
-- une ligne non parametree herite du premier parent qui a un code RIS chez le centre
-- (`src/lib/referentielRepli.ts`), et chaque ligne de `/api/configuration/get/mapping`
-- porte `repliSur` (LyraeTalk, drapeau `V2_REPLI_PARENT`).
--
-- Plan : lyrae/plans/2026-11-ajout-examen-au-referentiel.md.
--
-- Le code tolere l'absence de la colonne (`referentielEnBase()` retombe sur les trois
-- colonnes d'origine) : cette migration peut passer avant ou apres le build. Elle doit
-- passer AVANT `scripts/data-provisioning/2026_11_02_examen_N01MR141.sql`.
--
-- Idempotente, additive.
--   psql "$DATABASE_URL" -f prisma/migrations/manual/2026_11_02_referentiel_repli.sql

ALTER TABLE "ReferentielExamens"
  ADD COLUMN IF NOT EXISTS "repliSur" text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN "ReferentielExamens"."repliSur" IS
  'Parents d un examen ajoute, dans l ordre de preference. Tant que le centre n a pas parametre la ligne, elle suit le premier parent qui a un code RIS chez lui. Vide pour un examen sans repli.';

-- Verif :
--   SELECT "codeExamen", "repliSur" FROM "ReferentielExamens" WHERE "repliSur" <> '{}';
--
-- Rollback (apres avoir remis le code d'avant, qui ne lit pas la colonne ; le code
-- actuel la tolere absente) :
--   ALTER TABLE "ReferentielExamens" DROP COLUMN IF EXISTS "repliSur";
