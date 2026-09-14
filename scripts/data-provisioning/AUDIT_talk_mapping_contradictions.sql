-- AUDIT : un centre en service refuserait-il d'enregistrer son mapping LyraeTalk ?
-- =============================================================================
-- A PASSER AVANT DE PROMOUVOIR LA VALIDATION DE `POST /api/configuration/mapping`
-- (14/09/2026). Les trois requetes doivent renvoyer ZERO ligne.
--
-- POURQUOI CE CONTROLE EXISTE. Cette route n'a jamais rien valide : elle acceptait
-- n'importe quel tableau et l'ecrivait tel quel, la ou le `PUT` de
-- `/api/konnect-examens` refusait les memes contradictions depuis le premier jour.
-- Les douze mappings LyraeTalk en service ont donc ete ecrits SANS controle, et
-- peuvent porter aujourd'hui un etat que la route refusera demain.
--
-- L'ENJEU EST EXACTEMENT CELUI-LA : si une des requetes renvoie des lignes, le
-- centre concerne ne pourra plus enregistrer AUCUNE modification de son mapping
-- tant que la contradiction est la, y compris celle qui la corrigerait. On corrige
-- la donnee d'abord, on promeut ensuite. Ne pas promouvoir en l'ignorant.
--
-- Sur le VPS, depuis /var/www/Dashboard_pre-prod (c'est bien la production, le nom
-- du repertoire est trompeur), avec le DATABASE_URL du .env :
--
--   export DATABASE_URL=$(sudo grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | tr -d "\"'")
--   psql "$DATABASE_URL" -f scripts/data-provisioning/AUDIT_talk_mapping_contradictions.sql
--   unset DATABASE_URL
--
-- AUCUNE DONNEE N'EST MODIFIEE : ni UPDATE, ni INSERT, ni DELETE. Le script cree une
-- seule vue TEMPORAIRE, qui vit le temps de la session psql et disparait a la
-- deconnexion. Il peut donc se passer sur la production a n'importe quel moment.

-- `exams` porte DEUX FORMES en production, un tableau chez la plupart des centres et
-- un objet indexe chez d'autres (c'est pourquoi l'ecran fait
-- `Array.isArray(json) ? json : Object.values(json)`). Les deux sont depliees ici,
-- sinon l'audit passerait a cote des centres en forme d'objet.
CREATE OR REPLACE TEMP VIEW lignes_talk AS
SELECT ts."userProductId" AS upid,
       t.repere,
       t.e
  FROM "TalkSettings" ts
  CROSS JOIN LATERAL (
    SELECT a.ord::text AS repere, a.e
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(ts."exams") = 'array'
                  THEN ts."exams" ELSE '[]'::jsonb END
           ) WITH ORDINALITY AS a(e, ord)
    UNION ALL
    SELECT b.key AS repere, b.value AS e
      FROM jsonb_each(
             CASE WHEN jsonb_typeof(ts."exams") = 'object'
                  THEN ts."exams" ELSE '{}'::jsonb END
           ) AS b
  ) t;

\echo ''
\echo '── 0. Inventaire : forme de stockage et nombre de lignes par centre ──'
SELECT ts."userProductId"          AS upid,
       jsonb_typeof(ts."exams")    AS forme,
       COUNT(l.e)                  AS lignes,
       COUNT(l.e) FILTER (
         WHERE (l.e->>'performed') IS DISTINCT FROM 'false'
           AND btrim(COALESCE(l.e->>'codeExamenClient','')) = ''
       )                           AS attribues_sans_code_ris
  FROM "TalkSettings" ts
  LEFT JOIN lignes_talk l ON l.upid = ts."userProductId"
 GROUP BY 1, 2
 ORDER BY 1;
-- `attribues_sans_code_ris` est informatif, PAS bloquant : c'est l'etat de depart de
-- tout centre vierge (287 lignes a `performed: true` sans code). La route le compte et
-- l'ecran le dit apres enregistrement, elle ne le refuse pas.

\echo ''
\echo '── 1. Lignes sans code NEURACORP (doit etre vide) ──'
-- La route leve « Ligne N : code NEURACORP manquant. » Le code est la cle du mapping :
-- sans lui la ligne ne designe aucun examen, et la fusion avec l'existant n'a plus de
-- point d'ancrage. Correction : supprimer la ligne, elle ne sert a rien.
SELECT upid, repere, e
  FROM lignes_talk
 WHERE btrim(COALESCE(e->>'codeExamen','')) = ''
 ORDER BY upid, repere;

\echo ''
\echo '── 2. Code NEURACORP porte par deux lignes du meme centre (doit etre vide) ──'
-- La route repond « Le code NEURACORP « X » apparait plusieurs fois. » Correction :
-- garder la ligne qui porte le code RIS, supprimer l'autre.
SELECT upid,
       btrim(e->>'codeExamen')            AS code_neuracorp,
       COUNT(*)                           AS occurrences,
       string_agg(DISTINCT COALESCE(NULLIF(btrim(e->>'codeExamenClient'),''),'(vide)'),
                  ' | ')                  AS codes_ris_vus
  FROM lignes_talk
 WHERE btrim(COALESCE(e->>'codeExamen','')) <> ''
 GROUP BY 1, 2
HAVING COUNT(*) > 1
 ORDER BY 1, 2;

\echo ''
\echo '── 3. Code RIS attribue a deux examens du meme centre (doit etre vide) ──'
-- La route repond « Le code RIS « X » est attribue a deux examens differents. » Seules
-- les lignes ATTRIBUEES comptent (`performed` different de `false`) : une ligne non
-- confiee au robot ne reserve rien, deux lignes non attribuees peuvent partager un
-- code sans consequence. Meme regle que le `PUT` de Konnect.
--
-- Correction : decocher « attribue a Lyrae » sur la ligne en trop, ou corriger le code
-- RIS. C'est le cas le plus probable des trois, parce qu'un copier-coller de colonne
-- le produit sans rien signaler.
SELECT upid,
       btrim(e->>'codeExamenClient')                 AS code_ris,
       COUNT(*)                                      AS occurrences,
       string_agg(btrim(e->>'codeExamen'), ' | ' ORDER BY btrim(e->>'codeExamen'))
                                                     AS codes_neuracorp
  FROM lignes_talk
 WHERE btrim(COALESCE(e->>'codeExamenClient','')) <> ''
   AND (e->>'performed') IS DISTINCT FROM 'false'
 GROUP BY 1, 2
HAVING COUNT(*) > 1
 ORDER BY 1, 2;

\echo ''
\echo '── Fin. Requetes 1, 2 et 3 vides = la validation peut etre promue. ──'
