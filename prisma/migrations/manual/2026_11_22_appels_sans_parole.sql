-- Appels sans parole du patient (22/11/2026, décision d'Enzo).
--
-- Un appel où le patient n'a dit aucun mot sort de la liste des appels, des totaux et des
-- pourcentages du client ; il est compté à part (tuile « Appels sans parole »). Mesuré le
-- 22/11 sur 30 jours (appels de plus de 15 s) : 701 sur 4 037 à Pontivy, 27 à Menton, 17 à
-- Cognac. Code : src/lib/appelsSansParole.ts. Plan : workspace plans/2026-11-appels-sans-parole.md.
--
-- `nbToursPatient` : nombre de lignes du patient non vides. La transcription est effacée au
-- bout de trois mois (rétention) : la colonne garde l'information pour les statistiques.
-- NULL = inconnu (ligne déjà anonymisée) : l'appel reste compté.
--
-- Additif et idempotent : une colonne, remplie pour les seules lignes qui portent encore leur
-- transcription. À relancer une fois après le déploiement du code, pour les appels arrivés
-- entre ce fichier et le redémarrage (UPDATE ... WHERE "nbToursPatient" IS NULL).
--
-- Le locuteur se lit au PRÉFIXE de la ligne (`Patient:`), comme `lireTour` ; `speaker` sert
-- seulement pour l'ancien format sans préfixe.

ALTER TABLE "CallConversation" ADD COLUMN IF NOT EXISTS "nbToursPatient" integer;

UPDATE "CallConversation" c
   SET "nbToursPatient" = (
         SELECT count(*)
           FROM jsonb_array_elements(c.steps::jsonb) s
          WHERE (
                  s->>'text' LIKE 'Patient:%'
                  OR (s->>'speaker' = 'User'
                      AND s->>'text' NOT LIKE 'Lyrae:%'
                      AND s->>'text' NOT LIKE 'WaitSound:%')
                )
            AND regexp_replace(
                  regexp_replace(coalesce(s->>'text', ''), '^Patient:\s*', ''),
                  '\s*/\d{2}:\d{2}:\d{2}\s*$', ''
                ) ~ '\S'
       )
 WHERE c."nbToursPatient" IS NULL
   AND c."anonymiseeLe" IS NULL
   AND jsonb_typeof(c.steps::jsonb) = 'array';

-- Contrôle :
--   SELECT "userProductId", count(*) FILTER (WHERE "nbToursPatient" = 0) AS sans_parole,
--          count(*) FILTER (WHERE "nbToursPatient" IS NULL) AS inconnus
--     FROM "CallConversation"
--    WHERE "createdAt" >= now() - interval '30 days'
--      AND (stats::jsonb #> '{duration}') > '15'::jsonb
--    GROUP BY 1 ORDER BY 1;
--
-- Retour : le code ancien ignore la colonne ; pour la retirer :
--   ALTER TABLE "CallConversation" DROP COLUMN IF EXISTS "nbToursPatient";
