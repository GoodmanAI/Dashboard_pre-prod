-- Migration manuelle : premiers pas d'un nouveau client
--
-- Plan `plans/2026-10-onboarding-dashboard-talk.md` (Véga 659620).
--
-- À la première connexion, un client LyraeTalk voit sur son accueil une carte
-- « Premiers pas » en quatre étapes : correspondance des examens, classeur à
-- exporter et réimporter, réglages qui comptent, doubles examens. Les étapes 1 à
-- 3 se cochent d'après le registre de complétude ; la 4 n'a pas de verdict
-- possible et se coche quand le client clique « J'ai compris ». Les pages de
-- statistiques portent une phrase qu'on ferme une fois.
--
-- La colonne garde ce que la personne a fait de ces aides, PAR UTILISATEUR (une
-- secrétaire et son responsable ne lisent pas la même chose) et en base plutôt
-- que dans le navigateur : un client change de poste, la question ne doit pas
-- revenir à chaque fois.
--
--   null                                   jamais ouvert : sommaire et visite de bienvenue
--   { "masque": true }                     sommaire rangé (« Masquer »), pas de visite seule
--   { "visite": true }                     visite de bienvenue déjà lancée
--   { "chapitres": ["correspondance"] }    chapitres du tutoriel vus jusqu'au bout
--
-- 30/10 : la carte à quatre étapes devient le tutoriel en chapitres
-- (`plans/2026-10-tutoriel-client-talk.md`), même colonne.
--
-- **LES COMPTES EXISTANTS SONT MARQUÉS « MASQUÉ ».** Sans cela, les clients en
-- production (Menton, Cognac, Pontivy…) verraient surgir demain une carte qui
-- leur explique ce qu'ils ont rempli il y a des mois. Seuls les comptes créés
-- après cette migration voient la carte d'eux-mêmes ; un ancien client peut la
-- rouvrir depuis le menu du profil ou la recherche.
--
-- Additive et idempotente : le UPDATE ne touche que les lignes encore à null,
-- et un second passage ne fait rien.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "premiersPas" JSONB;

UPDATE "User"
SET "premiersPas" = '{"masque": true}'::jsonb
WHERE "premiersPas" IS NULL;

-- Contrôle : aucun compte ne doit rester à null juste après le passage.
SELECT count(*) AS comptes_sans_etat FROM "User" WHERE "premiersPas" IS NULL;
