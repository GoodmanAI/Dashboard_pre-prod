-- Migration manuelle : le referentiel d'examens vit en base, plus dans un blob
--
-- POURQUOI. La nomenclature d'examens NEURACORP est une donnee de REFERENCE, commune a
-- tous les clients. Elle etait lue dans un blob Azure A CHAQUE affichage d'un ecran de
-- mapping, ce qui la faisait dependre de trois choses : une chaine de connexion
-- presente dans l'environnement de chaque serveur, un container, un nom de blob, et la
-- disponibilite d'Azure a cet instant. Trois points de rupture pour une liste qui
-- change quelques fois par an.
--
-- Constate le 03/09/2026 (OPEN_QUESTIONS Q35) : la variable manque sur le VPS de
-- production. Un NOUVEAU CLIENT LYRAETALK arrive donc sur un tableau vide, sans meme un
-- message, le blob etant sa SEULE source d'amorcage. Konnect s'en tire un peu mieux, il
-- retombe sur le mapping Talk du meme client, mais pas quand le client n'a que Konnect.
--
-- CE QUE CETTE TABLE EST. Un instantane de la nomenclature, seme depuis un mapping
-- LyraeTalk de reference (decision du 11/09/2026 : GH Pontivy, userProductId 22, le
-- plus complet avec 287 examens). Elle ne porte QUE la partie commune :
--
--   codeExamen / typeExamen / libelle  -> nomenclature NEURACORP, la meme pour tous
--
-- ⚠️ ELLE NE PORTE AUCUN CODE CLIENT, et c'est le point central. `codeExamenClient`
-- est le code RIS du cabinet : il differe par definition d'un centre a l'autre, et
-- c'est PRECISEMENT ce que le client doit remplir. Le semer depuis un autre client
-- donnerait a chacun les codes de Pontivy, donc des rendez-vous poses sur des codes qui
-- n'existent pas chez lui.
--
-- CE QUE LE BLOB DEVIENT. Un moyen de RAFRAICHIR cette table quand NEURACORP publie une
-- nouvelle nomenclature, depuis un ecran interne. Ce qui disparait, c'est la dependance
-- au blob pour SERVIR un ecran client.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS "ReferentielExamens" (
  "codeExamen"  text PRIMARY KEY,
  "typeExamen"  text,
  "libelle"     text,
  -- D'ou vient cette ligne : 'talk:<userProductId>' ou 'neuracorp'. Sert a savoir ce
  -- qu'on relit, et a tracer une nomenclature semee depuis un client donne.
  "source"      text NOT NULL,
  "importeLe"   timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE "ReferentielExamens" IS
  'Nomenclature d examens commune a tous les clients, instantanee en base. Amorce le mapping d un nouveau centre (LyraeTalk comme LyraeKonnect). Ne porte AUCUN code RIS client : c est ce que le client remplit.';

COMMENT ON COLUMN "ReferentielExamens"."source" IS
  'talk:<userProductId> quand la ligne vient du mapping d un client de reference, neuracorp quand elle vient du blob Azure.';

-- Verif :
--   SELECT "source", count(*) FROM "ReferentielExamens" GROUP BY 1;
--   SELECT * FROM "ReferentielExamens" ORDER BY "codeExamen" LIMIT 10;
--
-- Alimentation (script dedie, hors migration : il LIT une autre table et le choix du
-- client de reference est une decision produit, pas un schema) :
--   node scripts/data-provisioning/semer-referentiel-examens.js 22
--
-- Rollback :
--   DROP TABLE IF EXISTS "ReferentielExamens";
--   -- A ne faire QU'APRES avoir remis `referentielNeuracorp()` en source d amorcage,
--   -- sinon les ecrans de mapping d un nouveau centre repartent vides.
