-- Migration manuelle : les demandes de rappel des patients LyraeKonnect
--
-- Chantier `plans/2026-09-konnect-deux-chemins.md`, lot 2.
--
-- Quand un examen n'est pas reservable en ligne (case decochee dans le mapping),
-- le portail ne propose aucun creneau. Il offre au patient de laisser son numero.
-- S'il accepte, la demande atterrit ici et le secretariat la rappelle. S'il refuse,
-- on lui affiche le numero du centre et RIEN n'est enregistre.
--
-- DONNEE PATIENT, ET C'EST NOUVEAU DANS CETTE BASE. Decision du 02/09/2026, prise
-- en connaissance de Q33 (le depot du Dashboard est public) et Q34 (son PostgreSQL
-- ecoute sur 0.0.0.0:5432 sans qu'ufw ne couvre Docker). Ces deux questions ne
-- portaient jusqu'ici que sur de la configuration ; elles portent desormais sur un
-- nom et un numero de telephone. Trois consequences tenues ici :
--
--   1. LE STRICT MINIMUM. Nom, prenom, telephone, libelle de l'examen, reference de
--      la demande Konnect. Ni ordonnance, ni questionnaire, ni date de naissance,
--      ni la moindre donnee medicale.
--   2. RIEN N'EST JOURNALISE. L'auditLog du Dashboard ne compte que des volumes.
--   3. PURGE A 90 JOURS apres traitement (scripts/db-maintenance/purge_konnect_demandes_rappel.sh).
--
-- ECRITURE PAR KONNECT. C'est la premiere route `konnect-*` ou KONNECT_API_KEY
-- ecrit : toutes les autres repondent 403 sur PUT avec une cle API. L'exception
-- est delibaree et limitee au POST de cette route.
--
-- Idempotent : sur a rejouer.

BEGIN;

CREATE TABLE IF NOT EXISTS "KonnectDemandesRappel" (
  "id"            serial PRIMARY KEY,
  "userProductId" integer NOT NULL,

  -- Identifiant de la demande de RDV cote Konnect (`RdvRequest.id`). Sert de cle
  -- d'idempotence : un patient qui valide deux fois, ou un renvoi apres coupure
  -- reseau, ne cree pas deux lignes d'appel pour le secretariat.
  "referenceKonnect" text NOT NULL,

  -- --- Ce que le patient a laisse ---
  "nom"           text NOT NULL DEFAULT '',
  "prenom"        text NOT NULL DEFAULT '',
  "telephone"     text NOT NULL,

  -- Libelle de l'examen demande, tel qu'il est nomme dans le mapping du centre.
  -- Ce n'est pas un diagnostic : c'est ce que la secretaire doit savoir pour
  -- rappeler utilement.
  "examenLibelle" text NOT NULL DEFAULT '',

  -- 'a_rappeler' | 'rappele' | 'sans_suite'. Validation dans la route, pas en
  -- CHECK : une erreur Postgres serait illisible pour l'utilisateur.
  "statut"        text NOT NULL DEFAULT 'a_rappeler',

  -- Note libre du secretariat. Jamais rempli par le patient ni par Konnect.
  "note"          text NOT NULL DEFAULT '',

  -- Qui a traite, et quand. `traiteePar` porte l'email de l'utilisateur du
  -- Dashboard, pas celui du patient.
  "traiteePar"    text,
  "traiteeAt"     timestamp with time zone,

  "createdAt"     timestamp with time zone NOT NULL DEFAULT NOW(),
  "updatedAt"     timestamp with time zone NOT NULL DEFAULT NOW(),

  CONSTRAINT "KonnectDemandesRappel_userProductId_reference_key"
    UNIQUE ("userProductId", "referenceKonnect"),

  CONSTRAINT "KonnectDemandesRappel_userProductId_fkey"
    FOREIGN KEY ("userProductId") REFERENCES "UserProduct"("id") ON DELETE CASCADE
);

-- L'ecran liste par centre, les non traitees d'abord, les plus recentes en tete.
CREATE INDEX IF NOT EXISTS "KonnectDemandesRappel_userProductId_statut_idx"
  ON "KonnectDemandesRappel" ("userProductId", "statut", "createdAt" DESC);

-- La purge balaie par date de traitement, tous centres confondus.
CREATE INDEX IF NOT EXISTS "KonnectDemandesRappel_traiteeAt_idx"
  ON "KonnectDemandesRappel" ("traiteeAt");

COMMIT;
