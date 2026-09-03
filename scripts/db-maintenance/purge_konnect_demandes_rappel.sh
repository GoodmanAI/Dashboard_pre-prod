#!/usr/bin/env bash
#
# Purge des demandes de rappel LyraeKonnect traitees depuis plus de
# RETENTION_DAYS jours.
#
# La table "KonnectDemandesRappel" porte de la DONNEE PATIENT (nom, prenom,
# telephone) : c'est la seule de cette base dans ce cas, et c'est ce qui rend
# cette purge obligatoire et non facultative. Cf. le chantier
# plans/2026-09-konnect-deux-chemins.md et Q33/Q34 dans OPEN_QUESTIONS.md.
#
# On ne purge QUE les demandes traitees ("traiteeAt" renseignee). Une demande
# encore a rappeler n'est jamais supprimee, quel que soit son age : le patient
# attend un appel, et l'effacer en silence serait pire que la garder.
#
# - Lit DATABASE_URL depuis /var/www/Dashboard_pre-prod/.env
# - Ne fait rien si la variable est manquante ou illisible (exit 1, log stderr)
# - Fait UN seul appel SQL : DELETE ... RETURNING dans une CTE pour compter les
#   lignes supprimees sans race avec des inserts concurrents
# - Log une ligne par execution : timestamp + nb supprime + nb restant
#
# Usage manuel : sudo bash purge_konnect_demandes_rappel.sh
# Usage cron    : une fois par jour, comme les autres purges de ce dossier

set -euo pipefail

ENV_FILE="/var/www/Dashboard_pre-prod/.env"
RETENTION_DAYS="${RETENTION_DAYS:-90}"

log() { echo "[$(date -Iseconds)] purge_konnect_demandes_rappel: $*"; }

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
    DELETE FROM \"KonnectDemandesRappel\"
     WHERE \"traiteeAt\" IS NOT NULL
       AND \"traiteeAt\" < NOW() - INTERVAL '${RETENTION_DAYS} days'
    RETURNING 1
  )
  SELECT COUNT(*) FROM deleted;
")

REMAINING=$(psql "$DATABASE_URL" -tAc 'SELECT COUNT(*) FROM "KonnectDemandesRappel";')
EN_ATTENTE=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM \"KonnectDemandesRappel\" WHERE \"traiteeAt\" IS NULL;")

log "deleted=${DELETED} remaining=${REMAINING} a_rappeler=${EN_ATTENTE} retention_days=${RETENTION_DAYS}"
