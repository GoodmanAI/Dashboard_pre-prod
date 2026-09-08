-- Migration manuelle : les rappels de RDV s'activent centre par centre
--
-- POURQUOI. `app.rappels.service` (cron quotidien 08:00 cote Konnect) itere sur
-- TOUS les tenants et envoie les rappels J-N. Aucune garde par cabinet : le seul
-- frein est `KONNECT_NOTIFIER_ENABLED`, qui est global. Consequence : le jour ou
-- l'on arme ce drapeau pour qu'un client recoive ses confirmations, TOUS les
-- centres se mettent a relancer leurs patients, cabinet de demonstration compris.
--
-- LE DEFAUT EST `false`, ET C'EST DELIBERE. Toute la configuration Konnect est
-- fail-closed : un centre non parametre ne declenche aucun traitement sensible.
-- Ecrire au patient en est un. Un defaut `true` ferait partir des relances chez
-- tous les centres des l'armement du notifier, ce qui est exactement l'accident
-- qu'on cherche a eviter.
--
-- Corollaire a connaitre : un vrai client devra COCHER cette case pour que ses
-- patients soient relances. C'est un geste d'installation de plus, assume.
--
-- CE QUE CE REGLAGE NE COUVRE PAS : le SMS de secours H-44
-- (`app.confirmation.sms_secours`), qui relance un patient n'ayant ni confirme ni
-- annule. C'est un envoi voisin mais rattache a la confirmation, pas au rappel.
-- A trancher separement.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS).

ALTER TABLE "KonnectSettings"
  ADD COLUMN IF NOT EXISTS "rappelsActifs" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "KonnectSettings"."rappelsActifs" IS
  'Le portail relance le patient avant son RDV (rappels J-N). Defaut false : ecrire au patient est un traitement sensible, il se demande.';

-- Verif :
--   SELECT "userProductId", "rappelsActifs" FROM "KonnectSettings";
--
-- Rollback :
--   ALTER TABLE "KonnectSettings" DROP COLUMN IF EXISTS "rappelsActifs";
--     -- A ne faire QUE si `rappels_actifs` a d'abord ete retire de CHAMPS_PILOTES
--     -- cote Konnect : sinon la synchronisation suivante ne verrait plus le champ
--     -- et preserverait la derniere valeur connue, ce qui est le bon comportement
--     -- mais fige le reglage sans interface.
