#!/usr/bin/env bash
#
# Purge des lignes "AppointmentConfirmation" devenues inutiles.
#
# La table stocke les RDV envoyés au patient par SMS (flux no-show). Sans
# purge, elle grossit indéfiniment : chaque RDV = 1 row, plus les tentatives
# de replay ou retry côté AI2Xplore. Ce script est concu pour être appelé
# une fois par jour par cron (voir /etc/cron.d/dashboard-purge-appointment-
# confirmations).
#
# Politique de retention (2026-07-21) :
#   - Events ACQUITTÉS (ackedAt IS NOT NULL) : purge après ACKED_RETENTION_DAYS
#     jours. AI2Xplore les a déjà intégrés, aucune raison de les garder plus
#     longtemps que l'audit court terme.
#   - Statuts finaux NON acquittés (CONFIRMED/CANCELLED/EXPIRED/LOCKED avec
#     ackedAt NULL) : purge après FINAL_UNACKED_RETENTION_DAYS jours. Cas
#     très rare (AI2Xplore acquitte normalement dans les minutes qui suivent),
#     mais si un event traîne c'est un bug côté AI2Xplore — on garde 90j
#     pour investigation puis on purge.
#   - Les PENDING (jamais répondus, jamais expirés) ne sont JAMAIS purgés par
#     ce script — le TTL de 7 jours défini côté code les passe naturellement
#     à EXPIRED, ils tombent alors dans la catégorie ci-dessus.
#
# - Lit DATABASE_URL depuis /var/www/Dashboard_pre-prod/.env
# - Fail closed si la variable est manquante (exit 1, log stderr)
# - Log une ligne par catégorie purgée : timestamp + counts
#
# Usage manuel : sudo bash purge_appointment_confirmations.sh
# Usage cron    : cf. cron entry (root + redirection vers /var/log/...)

set -euo pipefail

ENV_FILE="/var/www/Dashboard_pre-prod/.env"
ACKED_RETENTION_DAYS="${ACKED_RETENTION_DAYS:-30}"
FINAL_UNACKED_RETENTION_DAYS="${FINAL_UNACKED_RETENTION_DAYS:-90}"

log() { echo "[$(date -Iseconds)] purge_appointment_confirmations: $*"; }

if [ ! -r "$ENV_FILE" ]; then
  log "ERROR: cannot read $ENV_FILE" >&2
  exit 1
fi

DATABASE_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'")

if [ -z "${DATABASE_URL:-}" ]; then
  log "ERROR: DATABASE_URL not set in $ENV_FILE" >&2
  exit 1
fi

# 1) Purge des events acquittés > ACKED_RETENTION_DAYS jours.
DELETED_ACKED=$(psql "$DATABASE_URL" -tAc "
  WITH deleted AS (
    DELETE FROM \"AppointmentConfirmation\"
     WHERE \"ackedAt\" IS NOT NULL
       AND \"ackedAt\" < NOW() - INTERVAL '${ACKED_RETENTION_DAYS} days'
    RETURNING 1
  )
  SELECT COUNT(*) FROM deleted;
")

# 2) Purge des statuts finaux non-acquittés > FINAL_UNACKED_RETENTION_DAYS jours.
#    (Ne devrait pas arriver en pratique — safety net.)
DELETED_FINAL_UNACKED=$(psql "$DATABASE_URL" -tAc "
  WITH deleted AS (
    DELETE FROM \"AppointmentConfirmation\"
     WHERE \"ackedAt\" IS NULL
       AND \"status\" IN ('CONFIRMED','CANCELLED','EXPIRED','LOCKED')
       AND \"updatedAt\" < NOW() - INTERVAL '${FINAL_UNACKED_RETENTION_DAYS} days'
    RETURNING 1
  )
  SELECT COUNT(*) FROM deleted;
")

REMAINING=$(psql "$DATABASE_URL" -tAc 'SELECT COUNT(*) FROM "AppointmentConfirmation";')

log "acked_deleted=${DELETED_ACKED} (${ACKED_RETENTION_DAYS}d) final_unacked_deleted=${DELETED_FINAL_UNACKED} (${FINAL_UNACKED_RETENTION_DAYS}d) remaining=${REMAINING}"
