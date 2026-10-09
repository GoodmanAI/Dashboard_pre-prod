-- =============================================================================
-- Migration manuelle : ordonnances a envoyer par mail (09/10/2026)
-- =============================================================================
--
-- Contexte : le lien de depot d'ordonnance ne part que par SMS, vers un 06/07,
-- avec la confirmation. Quand le patient n'a pas de mobile (ou que le centre
-- n'envoie pas de SMS de confirmation), LyraeTalk lui dit d'envoyer son
-- ordonnance par mail a l'adresse du centre, puis declare le RDV ici via
-- POST /api/prescriptions/par-mail/init. Le secretariat voit une carte
-- « a verifier dans la boite mail » sur la page Ordonnances manquantes, et la
-- range une fois l'ordonnance retrouvee.
--
-- Table a part de "PrescriptionUpload" : celle-ci exige jeton, code et
-- telephone, et ses lignes PENDING declenchent l'alerte 48 h et les relances.
--
-- Donnee patient : prenom, nom, telephone (souvent un fixe). Purge 30 jours
-- apres le RDV par scripts/db-maintenance/purge_prescriptions.sh.
--
-- Plan : plans/2026-10-ordonnance-par-mail-sans-mobile.md (workspace).
-- Additif et idempotent.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "PrescriptionParMail" (
  "id"                 serial PRIMARY KEY,
  "rdvId"              text NOT NULL,
  "centerId"           int NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "externalCenterCode" text NOT NULL,
  "examType"           varchar(32) NOT NULL,
  "appointmentDate"    timestamptz NOT NULL,
  "firstname"          text NOT NULL DEFAULT '',
  "lastname"           text NOT NULL DEFAULT '',
  "phone"              text NOT NULL DEFAULT '',
  "rangeeAt"           timestamptz,
  "rangeePar"          int,
  "createdAt"          timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "PrescriptionParMail_rdvId_centerId_key" UNIQUE ("rdvId", "centerId")
);

-- Liste du secretariat : cartes non rangees, RDV a venir, par centre.
CREATE INDEX IF NOT EXISTS "PrescriptionParMail_a_verifier_idx"
  ON "PrescriptionParMail" ("externalCenterCode", "appointmentDate")
  WHERE "rangeeAt" IS NULL;

COMMIT;
