-- =============================================================================
-- Migration manuelle : chantier ordonnances (Lot D1)
-- =============================================================================
--
-- Contexte : quand un patient prend RDV pour un examen qui requiert une
-- ordonnance (scanner, IRM, etc. — configurable par centre), on lui envoie
-- dans le SMS de confirmation un 2eme lien vers depot-ordonnances.neuracorp.ai
-- avec un shortCode + verificationCode. Le patient depose son PDF, AI2Xplore
-- le pull, remonte au dashboard une fois traite cote logiciel metier.
--
-- 4 nouvelles tables :
--
-- 1) "PrescriptionConfig" — parametrage par centre (types d'examens qui
--    necessitent une ordonnance, delai avant alerte secretaire).
--
-- 2) "PrescriptionUpload" — une ligne par RDV necessitant une ordonnance.
--    Contient l'etat (PENDING / UPLOADED / ACKED / EXPIRED / LOCKED), les
--    infos patient necessaires au rappel secretaire (phone, nom, prenom),
--    et les infos fichier une fois uploade (path, hash, taille).
--
-- 3) "PrescriptionStats" — agregats non purges par centre × type × jour,
--    calques sur "ReminderStats". Alimente la future page stats ordonnances.
--
-- 4) "PrescriptionAccessLog" — audit trail de toutes les actions sensibles
--    (init, upload, download, ack, alert, purge, code_failed, phone_viewed).
--    Retention 90j via cron.
--
-- Securite :
--   - "verificationCodeHash" = scrypt(code, salt) au lieu de code en clair
--     (le shortCode reste en clair : il est dans l'URL, deja visible)
--   - "phone" en clair (pattern deja adopte par AppointmentConfirmation,
--     necessaire au rappel secretaire — cf. chantier futur "hash phone
--     partout" dans le backlog securite)
--   - Toutes les colonnes patient sont behind ownership check applicatif
--
-- Additif uniquement, encapsule dans BEGIN/COMMIT.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) PrescriptionConfig
-- ---------------------------------------------------------------------------
-- Une ligne par UserProduct (centre). Types d'examens qui necessitent une
-- ordonnance = memes 5 valeurs canoniques que SmsConfirmationConfig
-- (scanner, irm, mammo, radiographie, echographie). Booleen par type.
-- alertAfterHours : delai en heures avant qu'on lance une alerte "ordonnance
-- manquante" pour les secretaires (defaut 48h, borne 12-168h cote applicatif).

CREATE TABLE "PrescriptionConfig" (
  "userProductId"    int PRIMARY KEY REFERENCES "UserProduct"("id") ON DELETE CASCADE,
  "enabledExamTypes" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "alertAfterHours"  int NOT NULL DEFAULT 48,
  "updatedAt"        timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "PrescriptionConfig_alert_range"
    CHECK ("alertAfterHours" BETWEEN 1 AND 720)
);

-- ---------------------------------------------------------------------------
-- 2) PrescriptionUpload
-- ---------------------------------------------------------------------------
-- Une ligne par RDV necessitant une ordonnance. Cree par POST /api/prescriptions/init
-- appele par LyraeTalk juste apres avoir book un RDV.
--
-- Cle unique (rdvId, centerId) → idempotence : re-init d'un RDV existant met
-- a jour sans invalider le shortCode/code deja envoyes au patient.

CREATE TABLE "PrescriptionUpload" (
  "id"                   serial PRIMARY KEY,
  "rdvId"                text NOT NULL,
  "centerId"             int NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "externalCenterCode"   text NOT NULL,
  "examType"             varchar(32),
  "appointmentDate"      timestamptz,

  -- Infos patient en clair (necessaires au rappel secretaire quand l'alerte
  -- 48h se declenche). Meme choix de design qu'AppointmentConfirmation.
  "phone"                text NOT NULL,
  "firstname"            text NOT NULL,
  "lastname"             text NOT NULL,

  -- Identifiants patient
  "token"                text UNIQUE NOT NULL,
  "shortCode"            varchar(12) UNIQUE NOT NULL,
  "verificationCodeHash" text NOT NULL,     -- format: "salt_hex:hash_hex" (scryptSync)

  -- Etat du workflow
  "attempts"             int NOT NULL DEFAULT 0,
  "status"               varchar(16) NOT NULL DEFAULT 'PENDING',
  "uploadedAt"           timestamptz,        -- quand le patient a poste le PDF
  "ackedAt"              timestamptz,        -- quand AI2Xplore a recupere le PDF
  "alertRaisedAt"        timestamptz,        -- quand le cron a leve l'alerte 48h
  "alertResolvedAt"      timestamptz,        -- quand la secretaire a marque traite

  -- Meta fichier (rempli au moment de l'upload)
  "fileSize"             int,
  "fileSha256"           char(64),
  "storagePath"          text,               -- chemin disque, jamais expose au client

  "expiresAt"            timestamptz NOT NULL,
  "createdAt"            timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT "PrescriptionUpload_rdvId_centerId_key" UNIQUE ("rdvId", "centerId"),
  CONSTRAINT "PrescriptionUpload_status_check"
    CHECK ("status" IN ('PENDING', 'UPLOADED', 'ACKED', 'EXPIRED', 'LOCKED'))
);

-- Index pour le polling (recuperation des uploads non ackes)
CREATE INDEX "PrescriptionUpload_status_uploaded_idx"
  ON "PrescriptionUpload" ("externalCenterCode", "uploadedAt")
  WHERE "status" = 'UPLOADED' AND "ackedAt" IS NULL;

-- Index pour le cron d'alerte 48h (RDVs en retard sans upload)
CREATE INDEX "PrescriptionUpload_alert_pending_idx"
  ON "PrescriptionUpload" ("createdAt")
  WHERE "status" = 'PENDING' AND "uploadedAt" IS NULL AND "alertRaisedAt" IS NULL;

-- Index pour l'UI secretaire (liste des alertes actives)
CREATE INDEX "PrescriptionUpload_alert_open_idx"
  ON "PrescriptionUpload" ("centerId", "alertRaisedAt")
  WHERE "alertRaisedAt" IS NOT NULL AND "alertResolvedAt" IS NULL;

-- Index pour purge (cron nettoyage des ackes vieux)
CREATE INDEX "PrescriptionUpload_purge_idx"
  ON "PrescriptionUpload" ("ackedAt")
  WHERE "ackedAt" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) PrescriptionStats — agregats non purges
-- ---------------------------------------------------------------------------
-- Meme design que ReminderStats. Une ligne par (centre × type × jour civil
-- Europe/Paris). Alimente une future page stats. Survit a la purge des
-- PrescriptionUpload individuelles.

CREATE TABLE "PrescriptionStats" (
  "id"                   serial PRIMARY KEY,
  "externalCenterCode"   text NOT NULL,
  "examType"             varchar(32),
  "day"                  date NOT NULL,
  "requested"            int NOT NULL DEFAULT 0,   -- nb de liens envoyes (init)
  "uploaded"             int NOT NULL DEFAULT 0,   -- nb d'uploads patient reussis
  "acked"                int NOT NULL DEFAULT 0,   -- nb d'ordonnances recuperees par AI2Xplore
  "alerted"              int NOT NULL DEFAULT 0,   -- nb d'alertes 48h declenchees
  "updatedAt"            timestamptz NOT NULL DEFAULT NOW()
);

-- Unicite (site, type, jour) avec COALESCE(examType, 'unknown') pour eviter
-- que 2 rows examType NULL cohabitent — meme trick que ReminderStats.
CREATE UNIQUE INDEX "PrescriptionStats_site_type_day_key"
  ON "PrescriptionStats" ("externalCenterCode", (COALESCE("examType", 'unknown')), "day");

CREATE INDEX "PrescriptionStats_site_day_idx"
  ON "PrescriptionStats" ("externalCenterCode", "day");

-- ---------------------------------------------------------------------------
-- 4) PrescriptionAccessLog — audit trail
-- ---------------------------------------------------------------------------
-- Log de toutes les actions sensibles sur les ordonnances. Retention 90j via
-- cron (script separe). "actorType" discrimine 'patient' (via shortCode +
-- code) / 'bot' (via x-api-key) / 'cron' (nettoyage automatique) / 'session'
-- (secretaire dans l'UI dashboard).

CREATE TABLE "PrescriptionAccessLog" (
  "id"                serial PRIMARY KEY,
  "uploadId"          int REFERENCES "PrescriptionUpload"("id") ON DELETE SET NULL,
  "action"            varchar(24) NOT NULL,
  "actorType"         varchar(12) NOT NULL,
  "actorIp"           inet,
  "actorUserAgent"    text,
  "success"           boolean NOT NULL,
  "errorReason"       text,
  "createdAt"         timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "PrescriptionAccessLog_action_check"
    CHECK ("action" IN (
      'init', 'upload', 'download', 'ack',
      'alert_raised', 'alert_resolved',
      'purge', 'code_failed', 'phone_viewed'
    )),
  CONSTRAINT "PrescriptionAccessLog_actorType_check"
    CHECK ("actorType" IN ('patient', 'bot', 'cron', 'session'))
);

CREATE INDEX "PrescriptionAccessLog_uploadId_createdAt_idx"
  ON "PrescriptionAccessLog" ("uploadId", "createdAt");

CREATE INDEX "PrescriptionAccessLog_createdAt_idx"
  ON "PrescriptionAccessLog" ("createdAt");   -- pour purge 90j

-- ---------------------------------------------------------------------------
-- 5) Verification integrite migration
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  pc_ok boolean;
  pu_ok boolean;
  ps_ok boolean;
  pl_ok boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'PrescriptionConfig')      INTO pc_ok;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'PrescriptionUpload')      INTO pu_ok;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'PrescriptionStats')       INTO ps_ok;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'PrescriptionAccessLog')   INTO pl_ok;
  IF NOT (pc_ok AND pu_ok AND ps_ok AND pl_ok) THEN
    RAISE EXCEPTION 'Migration incomplete: at least one Prescription* table missing';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- Rollback (si necessaire) :
--
--   DROP TABLE IF EXISTS "PrescriptionAccessLog";
--   DROP TABLE IF EXISTS "PrescriptionStats";
--   DROP TABLE IF EXISTS "PrescriptionUpload";
--   DROP TABLE IF EXISTS "PrescriptionConfig";
--
-- Verifications post-migration :
--   \d "PrescriptionConfig"
--   \d "PrescriptionUpload"
--   \d "PrescriptionStats"
--   \d "PrescriptionAccessLog"
--   SELECT COUNT(*) FROM "PrescriptionConfig";      -- attendu : 0
--   SELECT COUNT(*) FROM "PrescriptionUpload";      -- attendu : 0
--   SELECT COUNT(*) FROM "PrescriptionStats";       -- attendu : 0
--   SELECT COUNT(*) FROM "PrescriptionAccessLog";   -- attendu : 0
-- =============================================================================
