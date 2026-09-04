#!/usr/bin/env bash
#
# Purge hebdomadaire du PrescriptionAccessLog. Trim les rows plus vieilles
# que RETENTION_DAYS (defaut 90j) pour eviter que la table grossisse
# indefiniment. La table log toutes les actions patient/bot/cron :
# init/upload/download/ack/alert_raised/etc. — a volume moyen ~10 rows par
# ordonnance, ca peut monter vite sur 6+ mois.
#
# Politique :
#   - 90j est un compromis entre traçabilite RGPD (durée standard pour
#     l'audit trail applicatif dans le medical hors donnees santé) et
#     hygiene DB. Si audit long-terme requis, exporter avant le prune.
#
# Usage manuel : sudo bash purge_prescription_access_log.sh
# Usage cron    : /etc/cron.d/dashboard-purge-prescription-access-log (hebdo)

set -euo pipefail

ENV_FILE="/var/www/Dashboard_pre-prod/.env"
RETENTION_DAYS="${RETENTION_DAYS:-90}"

log() { echo "[$(date -Iseconds)] purge_prescription_access_log: $*"; }

if [ ! -r "$ENV_FILE" ]; then
  log "ERROR: cannot read $ENV_FILE" >&2
  exit 1
fi

DATABASE_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'")
if [ -z "${DATABASE_URL:-}" ]; then
  log "ERROR: DATABASE_URL not set in $ENV_FILE" >&2
  exit 1
fi

DELETED=$(psql "$DATABASE_URL" -tAc "
  WITH deleted AS (
    DELETE FROM \"PrescriptionAccessLog\"
     WHERE \"createdAt\" < NOW() - INTERVAL '${RETENTION_DAYS} days'
    RETURNING 1
  )
  SELECT COUNT(*) FROM deleted;
")

REMAINING=$(psql "$DATABASE_URL" -tAc 'SELECT COUNT(*) FROM "PrescriptionAccessLog";')

log "deleted=${DELETED} (retention=${RETENTION_DAYS}d) remaining=${REMAINING}"
