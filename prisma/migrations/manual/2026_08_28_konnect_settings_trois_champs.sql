-- Migration manuelle : les trois derniers champs que Konnect pilotait seul
--
-- Lot G4 du plan `plans/2026-08-konnect-fin-double-verite.md`.
--
-- POURQUOI CES TROIS-LA, ET POURQUOI MAINTENANT. Ils vivaient dans
-- `cabinet_parametres` cote Konnect sans equivalent ici, donc hors de
-- `CHAMPS_PILOTES` : les ajouter a cette liste sans les exposer ici les aurait
-- remis a leur defaut a chaque synchronisation. La console cabinet de Konnect
-- etait donc leur SEULE interface, et c'est ce qui lui donnait encore une raison
-- legitime d'ecrire. Ils passent ici AVANT que cette console ne soit fermee, sans
-- quoi ils deviendraient inaccessibles.
--
-- LES DEFAUTS SONT CEUX DE KONNECT, ET ILS NE SONT PAS ANODINS :
--
--   annulationDirecte = false. Fail-closed (AB-12). Quand c'est faux, le NON d'un
--   patient ne supprime RIEN dans le logiciel du centre : il cree une alerte que
--   le secretariat tranche. L'inverser par defaut ferait supprimer de vrais
--   rendez-vous des qu'un cabinet branche son RIS sans avoir rien parametre.
--
--   smsRappelMode = 'conditionnel'. Le SMS de secours ne part que si le patient
--   n'a ni confirme ni annule. Les deux autres valeurs sont 'opt_out_si_ics'
--   (aucun SMS si le calendrier a ete telecharge) et 'toujours' (historique).
--
--   codeCaracteristiqueConfirmationXplore = NULL. Code parametre dans Xplore
--   Administration, requis par ConfirmRendezVous (spec Xplore V41 p.26). PAR
--   CABINET, jamais une constante. NULL tant qu'il n'est pas releve a l'onboarding.
--
-- Les valeurs sont en camelCase ici et en snake_case dans la reponse de l'API,
-- comme les 14 autres : la frontiere est dans `src/lib/konnectConfig.ts`.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS).

ALTER TABLE "KonnectSettings"
  ADD COLUMN IF NOT EXISTS "annulationDirecte" boolean NOT NULL DEFAULT false;

ALTER TABLE "KonnectSettings"
  ADD COLUMN IF NOT EXISTS "smsRappelMode" text NOT NULL DEFAULT 'conditionnel';

ALTER TABLE "KonnectSettings"
  ADD COLUMN IF NOT EXISTS "codeCaracteristiqueConfirmationXplore" text;
