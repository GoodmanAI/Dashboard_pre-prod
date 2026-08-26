-- Migration manuelle : catalogue d'examens LyraeKonnect par centre
--
-- Lot C du plan `plans/2026-08-config-unifiee-dashboard.md`. Équivalent direct
-- d'`ExamMapping` pour LyraeTalk : le client décrit ici les examens de son centre,
-- et la brique consommatrice vient lire.
--
-- Une ligne par (centre, code d'examen RIS).
--
-- CE QUE LE CLIENT DÉCIDE, ET QUI VIT DONC ICI : le libellé présenté au patient,
-- l'examen est-il actif, l'ordonnance est-elle obligatoire, l'examen est-il injecté,
-- la liste d'attente est-elle ouverte. C'est le vrai travail de paramétrage, et il
-- n'existe qu'ici une fois ce lot en service.
--
-- CE QUE LE RIS SAIT, ET QUE LE DASHBOARD NE PEUT PAS ALLER CHERCHER : la whitelist
-- des codes ouverts à la réservation en ligne (`examensOpenRVE` de `getInfos`). Les
-- identifiants d'accès i2ris sont **par cabinet et chiffrés chez Konnect** ; ils n'ont
-- pas vocation à migrer (dépôt public Q33, PostgreSQL exposé Q34). Le pré-remplissage
-- restera donc un push de Konnect vers cette table, dans un ticket dédié. En attendant,
-- la saisie se fait dans l'écran d'administration.
--
-- Note : i2ris n'expose NI libellé NI champs métier par examen (cf.
-- `app/ris/i2ris.py:342`) — le pré-remplissage n'apporte que des codes. Tout le reste
-- est, et restera, saisi par le client.
--
-- Pourquoi une migration manuelle plutôt que Prisma : la base porte déjà treize tables
-- absentes de `schema.prisma`. `prisma migrate dev` détecte cette dérive et propose un
-- reset qui les emporterait toutes.
--
-- Idempotent : sûr à rejouer.

BEGIN;

CREATE TABLE IF NOT EXISTS "KonnectExamens" (
  "id"            serial PRIMARY KEY,
  "userProductId" integer NOT NULL,

  -- Code de l'examen dans le RIS. C'est la clé de jointure avec Xplore, celle que
  -- Konnect transmet à AI2Xplore lors de la réservation. La renommer casse la prise
  -- de RDV en silence.
  "examenCode"    text NOT NULL,

  -- Code du TYPE d'examen (regroupement RIS). Nullable : i2ris ne le fournit pas
  -- toujours, et plusieurs lectures côté Konnect exigent explicitement qu'il soit
  -- renseigné (`type_code IS NOT NULL`) avant d'utiliser la ligne.
  "typeCode"      text,

  -- Libellé présenté au patient. Saisi par le client : le RIS ne le fournit pas.
  "libelle"       text NOT NULL,

  -- Champs métier repris du vocabulaire Xplore (`ordoOblig`, `examenInjecte`),
  -- conformément à la règle « réutiliser les champs Xplore plutôt qu'une logique
  -- parallèle ». Défauts fail-closed : un examen mal décrit n'exige rien et ne
  -- déclenche aucun traitement d'injection.
  "ordoOblig"     boolean NOT NULL DEFAULT false,
  "examenInjecte" boolean NOT NULL DEFAULT false,

  -- Actif = proposé au patient. Défaut `true` : un examen qu'on vient d'ajouter est
  -- destiné à être proposé ; le masquer serait le contraire de l'intention.
  "actif"         boolean NOT NULL DEFAULT true,

  -- Liste d'attente ouverte pour cet examen. Défaut `false` (fail-closed) : la liste
  -- d'attente déclenche des sollicitations sortantes vers les patients.
  "listeAttenteActive" boolean NOT NULL DEFAULT false,

  -- « ris » (issu du pré-remplissage) ou « manuel » (ajouté à la main). Trace
  -- d'origine, reprise telle quelle de Konnect ; n'influence aucun comportement.
  "source"        text NOT NULL DEFAULT 'manuel',

  "createdAt"     timestamp with time zone NOT NULL DEFAULT NOW(),
  "updatedAt"     timestamp with time zone NOT NULL DEFAULT NOW(),

  CONSTRAINT "KonnectExamens_userProductId_examenCode_key"
    UNIQUE ("userProductId", "examenCode")
);

CREATE INDEX IF NOT EXISTS "KonnectExamens_userProductId_idx"
  ON "KonnectExamens" ("userProductId");

-- Le centre disparaît -> son catalogue aussi. Un `userProductId` réattribué
-- hériterait sinon du catalogue d'un autre client.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'KonnectExamens_userProductId_fkey'
  ) THEN
    ALTER TABLE "KonnectExamens"
      ADD CONSTRAINT "KonnectExamens_userProductId_fkey"
      FOREIGN KEY ("userProductId") REFERENCES "UserProduct"("id") ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
