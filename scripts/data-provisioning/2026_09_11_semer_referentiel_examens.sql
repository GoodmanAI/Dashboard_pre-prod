-- Semis du referentiel d'examens depuis un mapping LyraeTalk de reference
-- =============================================================================
-- CE QUE FAIT CE SCRIPT. Il remplit `ReferentielExamens`, la nomenclature commune qui
-- amorce le mapping de tout NOUVEAU centre (LyraeTalk comme LyraeKonnect), a partir du
-- mapping d'un client existant deja complet.
--
-- POURQUOI UN CLIENT ET PAS LE BLOB AZURE. Le referentiel etait lu dans un blob a
-- chaque affichage d'ecran, et la chaine de connexion manque sur le VPS de production
-- (Q35). Le mapping d'un client eprouve par l'usage porte la meme nomenclature, ne
-- demande aucun acces Azure, et se relit en SQL. Decision du 11/09/2026.
--
-- LE CLIENT DE REFERENCE : GH Pontivy, userProductId 22, 287 examens, le plus complet
-- des douze mappings en service (releve du 11/09/2026). Les autres en portent 264 a
-- 266.
--
-- ⚠️ AUCUN CODE CLIENT N'EST REPRIS, et c'est tout le point. `codeExamenClient` est le
-- code RIS du cabinet : il differe par definition d'un centre a l'autre, et c'est
-- PRECISEMENT ce que le nouveau client doit remplir. Semer ceux de Pontivy donnerait a
-- chacun des codes qui n'existent pas chez lui, et des rendez-vous refuses par son RIS.
-- Meme raison pour `typeExamenClient` et `libelleClient`.
--
-- Ne sont repris que les trois champs de nomenclature : `codeExamen`, `typeExamen`,
-- `libelle`.
--
-- Idempotent : `ON CONFLICT` met a jour. Rejouer apres avoir enrichi le mapping de
-- reference reporte les nouveautes sans toucher au reste.
--
-- Usage :
--   psql "$DATABASE_URL" -f scripts/data-provisioning/2026_09_11_semer_referentiel_examens.sql
--
-- Pour semer depuis un AUTRE client, changer la valeur ci-dessous. C'est une decision
-- produit : le mapping choisi devient la liste proposee a tous les nouveaux centres.

\set source_user_product_id 22

BEGIN;

-- `DISTINCT ON` : un mapping peut porter deux lignes pour un meme code (doublon de
-- saisie). On garde la premiere rencontree plutot que d'echouer sur la cle primaire.
INSERT INTO "ReferentielExamens" ("codeExamen", "typeExamen", "libelle", "source", "importeLe")
SELECT DISTINCT ON (e->>'codeExamen')
       e->>'codeExamen',
       NULLIF(TRIM(COALESCE(e->>'typeExamen', '')), ''),
       NULLIF(TRIM(COALESCE(e->>'libelle', '')), ''),
       'talk:' || :'source_user_product_id',
       NOW()
  FROM "TalkSettings" ts,
       LATERAL jsonb_array_elements(ts."exams") e
 WHERE ts."userProductId" = :source_user_product_id
   -- Une ligne sans code de nomenclature n'amorce rien : elle ne designe aucun examen.
   AND NULLIF(TRIM(COALESCE(e->>'codeExamen', '')), '') IS NOT NULL
 ORDER BY e->>'codeExamen'
ON CONFLICT ("codeExamen") DO UPDATE
   SET "typeExamen" = EXCLUDED."typeExamen",
       "libelle"    = EXCLUDED."libelle",
       "source"     = EXCLUDED."source",
       "importeLe"  = EXCLUDED."importeLe";

COMMIT;

-- Controle : combien de lignes, et d'ou elles viennent.
SELECT "source", count(*) AS examens, max("importeLe") AS dernier_import
  FROM "ReferentielExamens"
 GROUP BY "source";

-- Controle de non-contamination : AUCUNE colonne de code client ne doit exister ici.
-- Si cette requete renvoie des lignes, la table a ete alteree hors de ce script.
SELECT column_name
  FROM information_schema.columns
 WHERE table_name = 'ReferentielExamens'
   AND column_name ILIKE '%client%';
