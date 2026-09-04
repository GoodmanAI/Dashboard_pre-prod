#!/usr/bin/env bash
#
# Cron horaire : leve les alertes "ordonnance manquante" pour les RDVs qui
# n'ont toujours pas eu leur PDF depose apres le delai configure par centre
# (defaut 48h). L'alerte devient visible cote secretaire dans le dashboard.
#
# Politique :
#   - Cible : status='PENDING', uploadedAt IS NULL, alertRaisedAt IS NULL
#   - Delai : PrescriptionConfig.alertAfterHours du centre (defaut 48h si
#     pas de config specifique)
#   - Action : SET alertRaisedAt = NOW() sur les rows qui matchent + un log
#     dans PrescriptionAccessLog (action='alert_raised', actorType='cron')
#     + increment PrescriptionStats.alerted du jour
#
# Aucune notification externe : la secretaire voit les alertes dans son UI
# quand elle se connecte. Choix delibere pour ne pas spammer.
#
# Usage manuel : sudo bash prescription_alerts.sh
# Usage cron    : /etc/cron.d/dashboard-prescription-alerts (toutes les heures)

set -euo pipefail

ENV_FILE="/var/www/Dashboard_pre-prod/.env"
DEFAULT_ALERT_HOURS="${DEFAULT_ALERT_HOURS:-48}"

log() { echo "[$(date -Iseconds)] prescription_alerts: $*"; }

if [ ! -r "$ENV_FILE" ]; then
  log "ERROR: cannot read $ENV_FILE" >&2
  exit 1
fi

DATABASE_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'")
if [ -z "${DATABASE_URL:-}" ]; then
  log "ERROR: DATABASE_URL not set in $ENV_FILE" >&2
  exit 1
fi

# Le tout dans une seule requete atomique : UPDATE + logs + stats via CTE
# chainees. Postgres traite le WITH ... comme UN seul statement donc c'est
# deja atomique — pas besoin de BEGIN/COMMIT explicites (qui pollueraient
# la sortie de psql -tAc avec les lignes "BEGIN" et "COMMIT").
# CTE "raised" fait l'UPDATE et retourne les rows touches, ce qui alimente
# les INSERT suivants. Si aucun row a raiser, INSERT ne fait rien.
RAISED=$(psql "$DATABASE_URL" -tAc "
-- 1. Mark PENDING uploads qui ont depasse alertAfterHours sans upload
WITH raised AS (
  UPDATE \"PrescriptionUpload\" pu
     SET \"alertRaisedAt\" = NOW()
    FROM \"ExternalCenterMapping\" ecm
    LEFT JOIN \"PrescriptionConfig\" pc
           ON pc.\"userProductId\" = ecm.\"userProductId\"
   WHERE pu.\"externalCenterCode\" = ecm.\"externalCenterCode\"
     AND pu.\"alertRaisedAt\" IS NULL
     AND pu.\"uploadedAt\" IS NULL
     AND pu.\"status\" = 'PENDING'
     AND pu.\"createdAt\" < NOW() - (
       COALESCE(pc.\"alertAfterHours\", ${DEFAULT_ALERT_HOURS}) || ' hours'
     )::interval
   RETURNING pu.\"id\", pu.\"externalCenterCode\", pu.\"examType\"
),
-- 2. Log chaque alerte dans PrescriptionAccessLog
log_inserted AS (
  INSERT INTO \"PrescriptionAccessLog\"
    (\"uploadId\", \"action\", \"actorType\", \"success\")
  SELECT r.\"id\", 'alert_raised', 'cron', true
    FROM raised r
  RETURNING 1
),
-- 3. Increment PrescriptionStats.alerted par centre × type × jour
stats_upserted AS (
  INSERT INTO \"PrescriptionStats\"
    (\"externalCenterCode\", \"examType\", \"day\",
     \"requested\", \"uploaded\", \"acked\", \"alerted\", \"updatedAt\")
  SELECT r.\"externalCenterCode\",
         r.\"examType\",
         (NOW() AT TIME ZONE 'Europe/Paris')::date,
         0, 0, 0, COUNT(*)::int, NOW()
    FROM raised r
   GROUP BY r.\"externalCenterCode\", r.\"examType\"
  ON CONFLICT (\"externalCenterCode\", (COALESCE(\"examType\", 'unknown')), \"day\")
  DO UPDATE
    SET \"alerted\"   = \"PrescriptionStats\".\"alerted\" + EXCLUDED.\"alerted\",
        \"updatedAt\" = NOW()
  RETURNING 1
)
SELECT COUNT(*) FROM raised;
")

OPEN_ALERTS=$(psql "$DATABASE_URL" -tAc "
  SELECT COUNT(*) FROM \"PrescriptionUpload\"
   WHERE \"alertRaisedAt\" IS NOT NULL
     AND \"alertResolvedAt\" IS NULL
     AND \"ackedAt\" IS NULL;
")

log "raised_this_run=${RAISED} open_alerts_total=${OPEN_ALERTS}"
