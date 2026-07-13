#!/usr/bin/env bash
#
# Purge des lignes "LoginAttempt" plus vieilles que RETENTION_DAYS jours.
#
# La table "LoginAttempt" est ecrite a chaque tentative de connexion
# (succes ou echec) par le rate limiter (cf. src/lib/loginSecurity.ts).
# Sans purge, elle grossit indefiniment. Ce script est concu pour etre
# appele une fois par jour par cron. Cf. scripts/db-maintenance/README.md
# ou docs cron pour l'entree /etc/cron.d/dashboard-purge.
#
# - Lit DATABASE_URL depuis /var/www/Dashboard_pre-prod/.env
# - Ne fait rien si la variable est manquante ou illisible (exit 1, log stderr)
# - Fait UN seul appel SQL : DELETE ... RETURNING dans une CTE pour compter
#   les lignes supprimees en meme temps (pas de race avec des inserts
#   concurrents entre un COUNT et un DELETE)
# - Log une ligne par execution : timestamp + nb supprime + nb restant
#
# Usage manuel : sudo bash purge_login_attempts.sh
# Usage cron    : voir cron entry (root + redirection vers /var/log/...)

set -euo pipefail

ENV_FILE="/var/www/Dashboard_pre-prod/.env"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

log() { echo "[$(date -Iseconds)] purge_login_attempts: $*"; }

if [ ! -r "$ENV_FILE" ]; then
  log "ERROR: cannot read $ENV_FILE" >&2
  exit 1
fi

DATABASE_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'")

if [ -z "${DATABASE_URL:-}" ]; then
  log "ERROR: DATABASE_URL not set in $ENV_FILE" >&2
  exit 1
fi

# DELETE + count en une seule requete via CTE (evite les races).
# Force le format non-aligne (-A) et sans header (-t) pour ne recuperer
# que la valeur numerique du COUNT.
DELETED=$(psql "$DATABASE_URL" -tAc "
  WITH deleted AS (
    DELETE FROM \"LoginAttempt\"
     WHERE \"createdAt\" < NOW() - INTERVAL '${RETENTION_DAYS} days'
    RETURNING 1
  )
  SELECT COUNT(*) FROM deleted;
")

REMAINING=$(psql "$DATABASE_URL" -tAc 'SELECT COUNT(*) FROM "LoginAttempt";')

log "deleted=${DELETED} remaining=${REMAINING} retention_days=${RETENTION_DAYS}"
