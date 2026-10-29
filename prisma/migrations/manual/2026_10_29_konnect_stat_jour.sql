-- Migration manuelle : les compteurs quotidiens que Konnect remonte (C-STAT.1)
--
-- Lot 3 du plan workspace `plans/2026-10-konnect-stats-surveillance-ocr.md`, décision D3
-- du 29/10/2026 : des agrégats seuls, par le flux de remontée existant, pas de cinquième
-- flux.
--
-- C'EST LA SÉRIE TEMPORELLE ANNONCÉE PAR `2026_09_08_konnect_remontee.sql` : « le jour où
-- une série sera nécessaire, elle aura sa propre table ». `KonnectRemontee` reste un état
-- courant ; celle-ci garde un compteur par centre, par jour et par clé.
--
-- Konnect pousse chaque nuit ses 14 derniers jours (section `jours` de
-- `POST /api/konnect-remontee`) ; on remplace la valeur du jour, jamais on n'additionne.
-- L'historique s'allonge donc ici au-delà de ce que Konnect renvoie.
--
-- AUCUNE DONNÉE PATIENT : des comptes (demandes, RDV, sorties vers le secrétariat par
-- motif, RDV par type d'examen, résultats de l'OCR par champ). Les clés `ocr*` restent
-- internes (D4) : la route de lecture du centre les écarte.
--
-- Table hors `schema.prisma`, comme les autres tables Konnect. Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS "KonnectStatJour" (
  "userProductId" integer NOT NULL,
  "jour"          date NOT NULL,
  "cle"           varchar(40) NOT NULL,
  "valeur"        double precision NOT NULL DEFAULT 0,
  -- Horodaté par le Dashboard à la réception, comme `KonnectRemontee`.
  "recuAt"        timestamp with time zone NOT NULL DEFAULT NOW(),

  CONSTRAINT "KonnectStatJour_pkey" PRIMARY KEY ("userProductId", "jour", "cle"),
  CONSTRAINT "KonnectStatJour_userProductId_fkey"
    FOREIGN KEY ("userProductId") REFERENCES "UserProduct"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "KonnectStatJour_jour_idx" ON "KonnectStatJour" ("jour");

COMMIT;

-- Vérif :
--   \d "KonnectStatJour"
--   SELECT "userProductId", "jour", count(*) FROM "KonnectStatJour" GROUP BY 1, 2 ORDER BY 2 DESC;
--
-- Rollback :
--   DROP TABLE IF EXISTS "KonnectStatJour";
--     -- Sans conséquence sur la configuration ; les écrans retombent sur « pas encore
--     -- reçu ». Konnect renvoie ses 14 derniers jours la nuit suivante.
