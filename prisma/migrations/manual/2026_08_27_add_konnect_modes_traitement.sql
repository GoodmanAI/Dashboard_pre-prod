-- Migration manuelle : mode de traitement des demandes, par centre LyraeKonnect
--
-- Lot D du plan `plans/2026-08-config-unifiee-dashboard.md`, premier ticket.
--
-- Le mode dit ce qui arrive a une demande de rendez-vous :
--   autonome            le patient choisit son creneau et le rendez-vous est pose ;
--   relecture           le rendez-vous est pose, puis le dossier part en relecture ;
--   orientation_directe aucun creneau n'est propose, le cabinet rappelle.
--
-- Deux niveaux de reglage, et l'examen precis prime sur la famille :
--   portee = 'famille'  cle = irm | scanner | radio | echo | autre
--   portee = 'examen'   cle = le code RIS de l'examen (colonne "codeExamenClient"
--                       de "KonnectExamens" : meme vocabulaire, meme centre)
--
-- ABSENCE DE LIGNE = 'autonome'. C'est voulu et il ne faut pas l'inverser : une
-- table vide laisse le parcours ouvert. Un defaut « relecture » bloquerait tous
-- les rendez-vous d'un centre mal configure, en silence.
--
-- CE QUI DEPEND DE CES DONNEES, cote portail : le moteur de regles, l'orientation
-- et la reservation. Un mode mal regle ne casse rien techniquement, mais change ce
-- que le patient peut faire.
--
-- Idempotent : sur a rejouer.

BEGIN;

CREATE TABLE IF NOT EXISTS "KonnectModesTraitement" (
  "id"            serial PRIMARY KEY,
  "userProductId" integer NOT NULL,

  -- 'famille' ou 'examen'. Validation dans la route, pas en CHECK : une erreur
  -- Postgres serait illisible pour l'utilisateur.
  "portee"        text NOT NULL,

  -- Famille d'examens, ou code RIS selon la portee.
  "cle"           text NOT NULL,

  -- 'autonome' | 'relecture' | 'orientation_directe'.
  "mode"          text NOT NULL,

  "createdAt"     timestamp with time zone NOT NULL DEFAULT NOW(),
  "updatedAt"     timestamp with time zone NOT NULL DEFAULT NOW(),

  CONSTRAINT "KonnectModesTraitement_userProductId_portee_cle_key"
    UNIQUE ("userProductId", "portee", "cle"),

  CONSTRAINT "KonnectModesTraitement_userProductId_fkey"
    FOREIGN KEY ("userProductId") REFERENCES "UserProduct"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "KonnectModesTraitement_userProductId_idx"
  ON "KonnectModesTraitement" ("userProductId");

COMMIT;
