-- Nettoyage de quatre libelles d'examens qui portent des notes de travail
-- =============================================================================
-- CE QU'ON CORRIGE, et pourquoi ca presse. Ces quatre libelles sont desormais la
-- NOMENCLATURE PROPOSEE A TOUT NOUVEAU CLIENT (`ReferentielExamens`, semee depuis le
-- mapping de GH Pontivy le 11/09/2026). Deux d'entre eux contiennent un POINT
-- D'INTERROGATION : ce sont des questions qu'on s'est posees pendant la saisie et qui
-- sont restees dans la donnee.
--
--   N01RX074  « Radiographie des os du carpe (metacarpes?) »
--   N01RX039  « Radiographie du rachis cervico-thoraco-lombo-sacre (idem) + sacre? »
--   N01RX094  « Radiographie de sacrum (coccyx) »
--   N01MR140  « Scanner score clacique »        <- faute de frappe pour « calcique »
--
-- Les trois premieres corrections reprennent MOT POUR MOT les libelles du referentiel
-- pivot de Konnect (`repos/konnect/docs/pivot/proposition_pivot.csv`), deja relus. On
-- ne reinvente rien : on aligne Talk sur ce qui a ete valide.
--
-- ⚠️ CE SCRIPT MODIFIE AUSSI LE MAPPING DE PONTIVY (userProductId 22), ET C'EST
-- DELIBERE. Sans cela, rejouer le semis reintroduirait les libelles sales : la source
-- ferait revenir ce que la cible vient de corriger. On corrige donc la source.
--
-- CONSEQUENCE A CONNAITRE : LyraeTalk lit `TalkSettings.exams` pour reconnaitre
-- l'examen demande au telephone et pour le prononcer. Changer un libelle change donc ce
-- que le robot DIT. Ici c'est un gain sans ambiguite (« os du carpe (metacarpes?) » n'a
-- jamais du etre prononce a un patient), mais c'est bien une modification de la
-- configuration d'un centre EN SERVICE.
--
-- `N01MR140` n'est corrige QUE cote Dashboard : la meme faute existe dans le
-- referentiel pivot de Konnect et se corrige la-bas, dans le CSV versionne.
--
-- Idempotent : rejouer ne change rien une fois les libelles corrects.

BEGIN;

-- Les libelles voulus, en un seul endroit : les deux mises a jour ci-dessous s'en
-- servent, et ne peuvent donc pas diverger.
CREATE TEMP TABLE corrections_libelles (code text PRIMARY KEY, libelle text) ON COMMIT DROP;
INSERT INTO corrections_libelles VALUES
  ('N01RX074', 'Radiographie des os du carpe'),
  ('N01RX039', 'Radiographie du rachis cervico-thoraco-lombo-sacré'),
  ('N01RX094', 'Radiographie de sacrum'),
  ('N01MR140', 'Scanner score calcique');

-- 1) La nomenclature proposee aux nouveaux clients.
UPDATE "ReferentielExamens" r
   SET "libelle" = c.libelle
  FROM corrections_libelles c
 WHERE r."codeExamen" = c.code
   AND r."libelle" IS DISTINCT FROM c.libelle;

-- 2) La SOURCE, sinon le prochain semis ramenerait les libelles sales.
--
-- `WITH ORDINALITY` : `jsonb_agg` ne garantit pas l'ordre sans tri explicite, et
-- l'ordre des examens porte du sens a l'ecran comme dans le POST du mapping, qui
-- fusionne PAR INDEX avec l'existant. Le perdre decalerait toutes les lignes.
UPDATE "TalkSettings" ts
   SET "exams" = (
         SELECT jsonb_agg(
                  COALESCE(
                    (SELECT jsonb_set(e, '{libelle}', to_jsonb(c.libelle))
                       FROM corrections_libelles c
                      WHERE c.code = e->>'codeExamen'),
                    e
                  )
                  ORDER BY ord
                )
           FROM jsonb_array_elements(ts."exams") WITH ORDINALITY AS t(e, ord)
       )
 WHERE ts."userProductId" = 22
   AND EXISTS (
         SELECT 1
           FROM jsonb_array_elements(ts."exams") e
           JOIN corrections_libelles c ON c.code = e->>'codeExamen'
          WHERE e->>'libelle' IS DISTINCT FROM c.libelle
       );

COMMIT;

-- Controle : les quatre libelles, des deux cotes. Aucun ne doit porter « ? » ni
-- « clacique ».
SELECT 'referentiel' AS ou, r."codeExamen", r."libelle"
  FROM "ReferentielExamens" r
 WHERE r."codeExamen" IN ('N01RX074', 'N01RX039', 'N01RX094', 'N01MR140')
UNION ALL
SELECT 'pontivy', e->>'codeExamen', e->>'libelle'
  FROM "TalkSettings" ts, LATERAL jsonb_array_elements(ts."exams") e
 WHERE ts."userProductId" = 22
   AND e->>'codeExamen' IN ('N01RX074', 'N01RX039', 'N01RX094', 'N01MR140')
 ORDER BY 2, 1;

-- Controle plus large : reste-t-il des notes de travail dans la nomenclature ?
-- Un « ? » ou une parenthese ouverte non fermee dans un libelle destine au client.
SELECT "codeExamen", "libelle"
  FROM "ReferentielExamens"
 WHERE "libelle" LIKE '%?%'
    OR "libelle" LIKE '%(%' AND "libelle" NOT LIKE '%)%'
 ORDER BY "libelle";
