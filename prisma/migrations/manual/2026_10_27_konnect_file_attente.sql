-- =============================================================================
-- Migration manuelle : la file d'attente des patients LyraeKonnect
-- =============================================================================
--
-- Plan workspace plans/2026-10-file-attente-konnect.md (K1 a K16), DECISIONS.md
-- du 27/10/2026. Quand un examen reservable en ligne n'a aucun creneau et que son
-- code porte la case « File d'attente », le patient s'y inscrit au lieu de demander
-- un rappel. La file vit ICI, et seulement ici : Konnect l'inscrit, la relit a
-- chaque passage de son moteur et demande chaque changement d'etat par une
-- transition conditionnelle (zero ligne touchee = 409, l'appelant abandonne).
--
--  - "KonnectExamens"."fileAttente" : la case, par code examen. N'a d'effet que si
--    l'examen est aussi reservable en ligne (verifie a l'ecriture et au catalogue).
--  - "KonnectFileAttente" : une ligne par inscription. DONNEE PATIENT (nom,
--    prenom, date de naissance, telephone), comme "KonnectDemandesRappel". Trois
--    regles : strict minimum, jamais journalise (l'auditLog ne compte que des
--    volumes), donnees effacees 30 jours apres la sortie de la file
--    (scripts/db-maintenance/purge_konnect_file_attente.sh).
--  - "KonnectFileAttenteEvenement" : un evenement par geste, SANS donnee patient.
--    Il survit a la purge : ce sont les statistiques de la page « Liste d'attente ».
--
-- Additif et idempotent. A appliquer AVANT le deploiement du code qui lit ces
-- tables. L'ancien code tourne sur la nouvelle base sans les voir.
-- =============================================================================

BEGIN;

ALTER TABLE "KonnectExamens"
  ADD COLUMN IF NOT EXISTS "fileAttente" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "KonnectFileAttente" (
  "id"             serial PRIMARY KEY,
  "userProductId"  integer NOT NULL,

  -- Code RIS du centre ("KonnectExamens"."codeExamenClient"), celui que Konnect
  -- passe a getCreneaux. Le libelle sert a la secretaire et au SMS.
  "codeExamen"     text NOT NULL,
  "examenLibelle"  text NOT NULL DEFAULT '',

  -- --- Ce que le patient a laisse ---
  "nom"            text NOT NULL,
  "prenom"         text NOT NULL,
  "dateNaissance"  date NOT NULL,
  "telephone"      text NOT NULL,
  -- Codes site acceptes. Vide = tous les sites du centre qui font l'examen.
  "sites"          text[] NOT NULL DEFAULT '{}',

  -- Identifiant de la demande cote Konnect : idempotence d'un renvoi.
  "referenceKonnect" text NOT NULL,

  -- Etat : voir src/lib/konnectFileAttente.ts. Validation dans le code, pas en
  -- CHECK : une erreur Postgres serait illisible pour l'utilisateur.
  "etat"           text NOT NULL DEFAULT 'en_file',
  -- Incremente a chaque transition : Konnect envoie la version qu'il a lue, une
  -- version perimee (la ligne a bouge entre-temps) donne 409.
  "version"        integer NOT NULL DEFAULT 1,

  -- Compteurs des sorties automatiques (K10) : 2 delais ecoules, 3 refus de date.
  "sansReponse"    integer NOT NULL DEFAULT 0,
  "refusDate"      integer NOT NULL DEFAULT 0,
  "propositions"   integer NOT NULL DEFAULT 0,

  -- --- La place en cours de proposition (etat 'proposition' ou
  --     'confirmation_en_cours'), videe au retour en file ---
  -- { codeSite, poste, date (AAAA-MM-JJ), heure (HH:MM) }
  "creneau"        jsonb,
  "reponseAvant"   timestamp with time zone,
  -- RDV Xplore qui tient la place (site en « place tenue »). Garde APRES une
  -- sortie decidee par la secretaire : le moteur doit encore le relire et, s'il
  -- porte toujours la caracteristique d'attente, le supprimer (K11).
  "rdvIdAttente"   text,
  -- RDV obtenu par la file (etat 'pris_par_la_file').
  "rdvId"          text,

  "sortieAt"       timestamp with time zone,
  -- Email de l'utilisateur du Dashboard pour un geste de secretaire, sinon NULL.
  "sortiePar"      text,

  "createdAt"      timestamp with time zone NOT NULL DEFAULT NOW(),
  "updatedAt"      timestamp with time zone NOT NULL DEFAULT NOW(),

  CONSTRAINT "KonnectFileAttente_userProductId_reference_key"
    UNIQUE ("userProductId", "referenceKonnect"),

  CONSTRAINT "KonnectFileAttente_userProductId_fkey"
    FOREIGN KEY ("userProductId") REFERENCES "UserProduct"("id") ON DELETE CASCADE
);

-- Une inscription vivante par patient et par code examen (K2). Le meme patient
-- peut se reinscrire une fois sorti.
CREATE UNIQUE INDEX IF NOT EXISTS "KonnectFileAttente_patient_actif_key"
  ON "KonnectFileAttente" ("userProductId", "codeExamen", lower("nom"), lower("prenom"), "dateNaissance")
  WHERE "sortieAt" IS NULL;

-- Le moteur et l'ecran lisent la file vivante d'un centre, dans l'ordre.
CREATE INDEX IF NOT EXISTS "KonnectFileAttente_actifs_idx"
  ON "KonnectFileAttente" ("userProductId", "codeExamen", "createdAt")
  WHERE "sortieAt" IS NULL;

-- La purge balaie par date de sortie, tous centres confondus.
CREATE INDEX IF NOT EXISTS "KonnectFileAttente_sortieAt_idx"
  ON "KonnectFileAttente" ("sortieAt");

CREATE TABLE IF NOT EXISTS "KonnectFileAttenteEvenement" (
  "id"             serial PRIMARY KEY,
  "userProductId"  integer NOT NULL,
  -- Pas de cle etrangere : l'evenement survit a la purge de l'inscription.
  "inscriptionId"  integer,
  "codeExamen"     text NOT NULL,
  "type"           text NOT NULL,
  "createdAt"      timestamp with time zone NOT NULL DEFAULT NOW(),

  CONSTRAINT "KonnectFileAttenteEvenement_userProductId_fkey"
    FOREIGN KEY ("userProductId") REFERENCES "UserProduct"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "KonnectFileAttenteEvenement_userProductId_idx"
  ON "KonnectFileAttenteEvenement" ("userProductId", "createdAt");

COMMIT;
