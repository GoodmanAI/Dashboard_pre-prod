-- Migration manuelle : l'annuaire des médecins d'un centre Talk
--
-- Plan workspace `plans/2026-10-questions-sur-le-rdv-lyraetalk.md` (§7, 03/11/2026),
-- décision du 28/10 (`DECISIONS.md`, « Le nom du médecin prévu »). Le robot répond
-- « avec quel médecin ? » en reliant le code médecin du créneau Xplore à un nom, et
-- seulement pour les médecins que le centre a choisi de nommer.
--
--   "MedecinAnnuaire"  une ligne par code médecin Xplore d'un centre Talk
--                      (`UserProduct`). Clé : (userProductId, code). La liste vient
--                      de `GetListeMedecinsTous` (AI2Xplore `POST /api/test/medecins`),
--                      qui se lit par base Xplore : un centre = une base.
--
-- La relecture ajoute et met à jour, ne supprime jamais une ligne et ne touche jamais
-- `nomme` (le choix du client). Un médecin nouveau arrive non nommé, marqué `nouveau`.
-- La case « le robot peut nommer » et la date de la dernière relecture vivent dans
-- `ProductConfig`, domaine `talk.medecins` : `{ "actif": bool, "reluLe": iso }`.
--
-- AUCUNE DONNÉE PATIENT. Hors `schema.prisma`, lue par le pool `pg`. Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS "MedecinAnnuaire" (
  "id"             serial PRIMARY KEY,
  "userProductId"  integer NOT NULL REFERENCES "UserProduct"("id") ON DELETE CASCADE,
  -- L'`id` Xplore, celui que portent les `codesMedecins` des créneaux.
  "code"           varchar(40) NOT NULL,
  "prefixe"        varchar(10) NOT NULL DEFAULT '',
  -- Tels qu'Xplore les rend (majuscules) ; la casse dite est calculée à la lecture.
  "prenom"         varchar(80) NOT NULL DEFAULT '',
  "nom"            varchar(120) NOT NULL DEFAULT '',
  -- Sites où le médecin exerce, quand la base le dit (Cognac) ; vide sinon.
  "codesSites"     text[] NOT NULL DEFAULT '{}',
  -- Le choix du client : le robot peut dire ce nom au patient.
  "nomme"          boolean NOT NULL DEFAULT false,
  -- Code sans prénom ou nommé GENERIQUE, TELERADIO, XPLORE : pas une personne.
  "pasUnePersonne" boolean NOT NULL DEFAULT false,
  -- Arrivé depuis le dernier enregistrement du client.
  "nouveau"        boolean NOT NULL DEFAULT true,
  -- Dernière relecture où il figurait dans Xplore.
  "vuLe"           timestamptz NOT NULL DEFAULT now(),
  -- Relectures de suite où il manquait (2 et plus : « plus dans Xplore »).
  "absences"       integer NOT NULL DEFAULT 0,
  "creeLe"         timestamptz NOT NULL DEFAULT now(),
  "modifieLe"      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "MedecinAnnuaire_upid_code_key" UNIQUE ("userProductId", "code")
);

CREATE INDEX IF NOT EXISTS "MedecinAnnuaire_userProductId_idx"
  ON "MedecinAnnuaire" ("userProductId");

COMMIT;
