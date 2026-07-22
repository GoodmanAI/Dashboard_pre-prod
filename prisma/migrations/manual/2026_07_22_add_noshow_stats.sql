-- =============================================================================
-- Migration manuelle : stats no-show par site + type d'examen
-- =============================================================================
--
-- Contexte : AI2Xplore veut afficher (via une page dashboard) le nb de SMS
-- de rappel effectivement envoyes, ventiles par centre + type d'examen +
-- jour, avec en regard les confirmations et annulations qui en decoulent.
--
-- 3 changements structurels :
--
-- 1) Ajouter "examType" a "AppointmentConfirmation" (nullable, retrocompat).
--    Permet de ventiler les reponses patient (CONFIRMED/CANCELLED) par type.
--
-- 2) Nouvelle table "ReminderSent" (audit dedoublonne des SMS envoyes).
--    AI2Xplore appelle POST /api/rdv/reminder-sent apres chaque envoi Brevo
--    reussi. La cle unique (rdvId, reminderNumber) garantit l'idempotence :
--    un rejeu du run AI2Xplore ne compte pas 2 fois le meme SMS.
--
-- 3) Nouvelle table "ReminderStats" (agregats non purges).
--    Le cron de purge nettoie AppointmentConfirmation apres 30-90j, mais on
--    veut des stats cumulees durables. On maintient ici un compteur pivote
--    (externalCenterCode, examType, day). Incremente en temps reel a chaque
--    reminder-sent / confirmed / cancelled. Jour = date civile Europe/Paris
--    du timestamp de l'evenement.
--
-- Toutes les tables sont gerees hors Prisma (SQL direct), cohérent avec
-- AppointmentConfirmation / SmsConfirmationConfig / ExternalCenterMapping.
--
-- Securite :
--   - Additive uniquement
--   - Encapsulee dans BEGIN/COMMIT
--   - Verification integree en fin de transaction
--
-- Rollback (si necessaire) :
--   DROP TABLE IF EXISTS "ReminderStats";
--   DROP TABLE IF EXISTS "ReminderSent";
--   ALTER TABLE "AppointmentConfirmation" DROP COLUMN IF EXISTS "examType";
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) examType sur AppointmentConfirmation
-- ---------------------------------------------------------------------------

ALTER TABLE "AppointmentConfirmation"
  ADD COLUMN "examType" varchar(32);

-- ---------------------------------------------------------------------------
-- 2) Table d'audit ReminderSent
-- ---------------------------------------------------------------------------

CREATE TABLE "ReminderSent" (
  "id"                 serial PRIMARY KEY,
  "rdvId"              text NOT NULL,
  "externalCenterCode" text NOT NULL,
  "examType"           varchar(32),
  "reminderNumber"     integer NOT NULL,
  "sentAt"             timestamp with time zone NOT NULL,
  "createdAt"          timestamp with time zone NOT NULL DEFAULT NOW(),
  CONSTRAINT "ReminderSent_rdvId_reminderNumber_key"
    UNIQUE ("rdvId", "reminderNumber")
);

-- Index pour lookups AI2Xplore et pour la page stats
CREATE INDEX "ReminderSent_externalCenterCode_sentAt_idx"
  ON "ReminderSent" ("externalCenterCode", "sentAt");

-- ---------------------------------------------------------------------------
-- 3) Table d'agregats ReminderStats
-- ---------------------------------------------------------------------------

CREATE TABLE "ReminderStats" (
  "id"                 serial PRIMARY KEY,
  "externalCenterCode" text NOT NULL,
  "examType"           varchar(32),
  "day"                date NOT NULL,
  "smsSent"            integer NOT NULL DEFAULT 0,
  "confirmed"          integer NOT NULL DEFAULT 0,
  "cancelled"          integer NOT NULL DEFAULT 0,
  "updatedAt"          timestamp with time zone NOT NULL DEFAULT NOW()
);

-- Unicite composite. examType NULL est autorise, mais on veut UN row par
-- (site, type, jour) — meme si examType est NULL. On coalesce vers 'unknown'
-- dans l'expression pour eviter que 2 rows avec examType NULL cohabitent.
CREATE UNIQUE INDEX "ReminderStats_site_type_day_key"
  ON "ReminderStats" ("externalCenterCode", (COALESCE("examType", 'unknown')), "day");

-- Index pour la page stats (filtre par site + range de jours)
CREATE INDEX "ReminderStats_externalCenterCode_day_idx"
  ON "ReminderStats" ("externalCenterCode", "day");

-- ---------------------------------------------------------------------------
-- 4) Verification
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  ac_col_ok boolean;
  rs_table_ok boolean;
  rst_table_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'AppointmentConfirmation' AND column_name = 'examType'
  ) INTO ac_col_ok;
  IF NOT ac_col_ok THEN
    RAISE EXCEPTION 'Migration incomplete: examType column not added to AppointmentConfirmation';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'ReminderSent'
  ) INTO rs_table_ok;
  IF NOT rs_table_ok THEN
    RAISE EXCEPTION 'Migration incomplete: ReminderSent table not created';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'ReminderStats'
  ) INTO rst_table_ok;
  IF NOT rst_table_ok THEN
    RAISE EXCEPTION 'Migration incomplete: ReminderStats table not created';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- Verifications post-migration :
-- =============================================================================
--
-- 1. Colonne examType sur AppointmentConfirmation :
--    \d "AppointmentConfirmation"
--
-- 2. Nouvelles tables :
--    \d "ReminderSent"
--    \d "ReminderStats"
--
-- 3. Aucune donnee perdue (nb rows AppointmentConfirmation inchange) :
--    SELECT COUNT(*) FROM "AppointmentConfirmation";
--
-- 4. Tables initialement vides :
--    SELECT COUNT(*) FROM "ReminderSent";
--    SELECT COUNT(*) FROM "ReminderStats";
