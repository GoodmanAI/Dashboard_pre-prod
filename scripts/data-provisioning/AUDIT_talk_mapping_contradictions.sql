-- AUDIT : un centre en service refuserait-il d'enregistrer son mapping LyraeTalk ?
-- =============================================================================
-- A PASSER AVANT DE PROMOUVOIR LA VALIDATION DE `POST /api/configuration/mapping`
-- (14/09/2026). Lire le VERDICT en fin de sortie : il est calcule.
--
-- Les blocs 1 et 2 doivent rendre ZERO ligne. Les blocs 0 et 3 sont informatifs et
-- rendent des lignes en fonctionnement normal.
--
-- POURQUOI CE CONTROLE EXISTE. Cette route n'a jamais rien valide : elle acceptait
-- n'importe quel tableau et l'ecrivait tel quel, la ou le `PUT` de
-- `/api/konnect-examens` refusait les configurations contradictoires depuis le
-- premier jour. Les douze mappings LyraeTalk en service ont donc ete ecrits SANS
-- controle, et peuvent porter aujourd'hui un etat que la route refuserait demain.
--
-- L'ENJEU EST EXACTEMENT CELUI-LA : si un bloc bloquant rend des lignes, le centre
-- concerne ne pourra plus enregistrer AUCUNE modification de son mapping tant que la
-- contradiction est la, y compris celle qui la corrigerait. On corrige la donnee
-- d'abord, on promeut ensuite. Ne pas promouvoir en l'ignorant.
--
-- ET IL A DEJA SERVI, DES SON PREMIER PASSAGE : il a montre que la regle « un code
-- RIS ne sert qu'a un examen », reprise de Konnect, interdisait la configuration
-- normale de dix centres. La regle a ete retiree, pas la donnee corrigee. Voir le
-- bloc 3.
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
--
-- ⚠️ LE PAGER EST COUPE, ET CE N'EST PAS DU CONFORT. Passe le 14/09/2026, la requete 3
-- de la premiere version rendait 223 lignes : psql les a envoyees dans `less`, l'ecran
-- n'a donc affiche NI en-tete NI compte pour ce bloc, exactement comme un resultat
-- vide. Et la ligne de conclusion, ecrite en dur, annoncait « tout est vide » sans rien
-- verifier. Un audit qui se lit de travers est pire que pas d'audit : il a failli
-- autoriser une mise en service qui aurait bloque dix centres.
\pset pager off

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
\echo '── 3. INFORMATIF : codes RIS partages par plusieurs examens (comptage seul) ──'
-- ⚠️ CE BLOC N'EST PAS UN DEFAUT, ET IL A FAILLI ETRE TRAITE COMME TEL.
--
-- La premiere version de cet audit demandait zero ligne ici, par symetrie avec le
-- `PUT` de Konnect, qui refuse bel et bien qu'un code RIS serve a deux examens. Le
-- passage du 14/09/2026 a rendu 223 groupes sur dix centres en service. Ce n'est pas
-- de la donnee sale, c'est le modele du RIS : `MAIN` sert a cinq examens chez Pontivy
-- (main droite, main gauche, les deux...), `PIED` a cinq, `AVTBRAS` a deux. Le code
-- RIS designe l'examen generique, la lateralite vit ailleurs.
--
-- La regle est juste chez Konnect parce que le sens de lecture y est inverse : son
-- catalogue porte le code RIS comme IDENTITE de l'examen reservable, et le portail
-- demande le cote separement. LyraeTalk lit code NEURACORP -> code RIS, une seule
-- entree par cle, aucune ambiguite. Deux produits, deux facons de porter la
-- lateralite, une regle qui ne se partage pas.
--
-- On compte donc, sans rien exiger. Un chiffre qui s'effondrerait d'un audit a l'autre
-- signalerait qu'un import a ecrase des codes ; c'est tout ce que ce bloc surveille.
SELECT upid,
       COUNT(*)                                      AS codes_ris_partages,
       SUM(occurrences)                              AS lignes_concernees,
       MAX(occurrences)                              AS partage_le_plus_large
  FROM (
    SELECT upid,
           btrim(e->>'codeExamenClient') AS code_ris,
           COUNT(*)                      AS occurrences
      FROM lignes_talk
     WHERE btrim(COALESCE(e->>'codeExamenClient','')) <> ''
       AND (e->>'performed') IS DISTINCT FROM 'false'
     GROUP BY 1, 2
    HAVING COUNT(*) > 1
  ) g
 GROUP BY 1
 ORDER BY 1;

\echo ''
\echo '── Verdict (calcule, pas annonce) ──'
-- La version precedente affichait « requetes 1, 2 et 3 vides » en dur, quoi qu'elles
-- aient rendu. Celle-ci compte.
SELECT CASE WHEN COALESCE(sans_code, 0) + COALESCE(neuracorp_double, 0) = 0
            THEN 'OK : aucune contradiction, la validation peut etre mise en service.'
            ELSE 'STOP : ' || COALESCE(sans_code, 0) || ' ligne(s) sans code NEURACORP, '
                 || COALESCE(neuracorp_double, 0) || ' code(s) NEURACORP en double. '
                 || 'Corriger la donnee AVANT de builder, sinon le centre concerne ne '
                 || 'pourra plus rien enregistrer.'
       END AS verdict
  FROM (
    SELECT (SELECT COUNT(*) FROM lignes_talk
             WHERE btrim(COALESCE(e->>'codeExamen','')) = '')            AS sans_code,
           (SELECT COUNT(*) FROM (
              SELECT upid, btrim(e->>'codeExamen') AS c
                FROM lignes_talk
               WHERE btrim(COALESCE(e->>'codeExamen','')) <> ''
               GROUP BY 1, 2
              HAVING COUNT(*) > 1
            ) d)                                                         AS neuracorp_double
  ) t;
