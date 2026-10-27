#!/usr/bin/env bash
#
# File d'attente LyraeKonnect : expiration a 60 jours et purge a 30 jours apres la
# sortie (plan workspace plans/2026-10-file-attente-konnect.md, K10).
#
# La table "KonnectFileAttente" porte de la DONNEE PATIENT (nom, prenom, date de
# naissance, telephone) : la purge est obligatoire, comme pour
# "KonnectDemandesRappel". Les statistiques ne sont pas perdues : elles vivent dans
# "KonnectFileAttenteEvenement", qui ne porte aucune donnee patient.
#
# 1. EXPIRATION : un patient encore 'en_file' depuis plus de EXPIRATION_DAYS jours
#    sort de la file ('expire_60j'). Seulement 'en_file' : une proposition en cours
#    va au bout de son delai, le moteur la rendra et la passe suivante l'expirera.
#    Aucun SMS (K10).
# 2. PURGE : une inscription sortie depuis plus de RETENTION_DAYS jours est
#    supprimee, SAUF si elle porte encore un RDV d'attente que le moteur de Konnect
#    n'a pas relu ("rdvIdAttente" non nul) : l'effacer laisserait une place tenue
#    dans Xplore sans personne pour la rendre.
#
# - Lit DATABASE_URL depuis /var/www/Dashboard_pre-prod/.env
# - Un seul appel SQL par etape, CTE + RETURNING pour compter sans course
# - Log une ligne par execution
#
# Usage manuel : sudo bash purge_konnect_file_attente.sh
# Usage cron    : une fois par jour, comme les autres purges de ce dossier

set -euo pipefail

ENV_FILE="/var/www/Dashboard_pre-prod/.env"
EXPIRATION_DAYS="${EXPIRATION_DAYS:-60}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

log() { echo "[$(date -Iseconds)] purge_konnect_file_attente: $*"; }

if [ ! -r "$ENV_FILE" ]; then
  log "ERROR: cannot read $ENV_FILE" >&2
  exit 1
fi

DATABASE_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'")

if [ -z "${DATABASE_URL:-}" ]; then
  log "ERROR: DATABASE_URL not set in $ENV_FILE" >&2
  exit 1
fi

EXPIRES=$(psql "$DATABASE_URL" -tAc "
  WITH expirees AS (
    UPDATE \"KonnectFileAttente\"
       SET \"etat\" = 'expire_60j', \"version\" = \"version\" + 1,
           \"sortieAt\" = NOW(), \"updatedAt\" = NOW()
     WHERE \"etat\" = 'en_file' AND \"sortieAt\" IS NULL
       AND \"createdAt\" < NOW() - INTERVAL '${EXPIRATION_DAYS} days'
    RETURNING \"id\", \"userProductId\", \"codeExamen\"
  ), evenements AS (
    INSERT INTO \"KonnectFileAttenteEvenement\" (\"userProductId\", \"inscriptionId\", \"codeExamen\", \"type\")
    SELECT \"userProductId\", \"id\", \"codeExamen\", 'expire_60j' FROM expirees
    RETURNING 1
  )
  SELECT COUNT(*) FROM evenements;
")

DELETED=$(psql "$DATABASE_URL" -tAc "
  WITH deleted AS (
    DELETE FROM \"KonnectFileAttente\"
     WHERE \"sortieAt\" IS NOT NULL
       AND \"sortieAt\" < NOW() - INTERVAL '${RETENTION_DAYS} days'
       AND \"rdvIdAttente\" IS NULL
    RETURNING 1
  )
  SELECT COUNT(*) FROM deleted;
")

EN_FILE=$(psql "$DATABASE_URL" -tAc 'SELECT COUNT(*) FROM "KonnectFileAttente" WHERE "sortieAt" IS NULL;')
BLOQUES=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM \"KonnectFileAttente\" WHERE \"sortieAt\" < NOW() - INTERVAL '${RETENTION_DAYS} days' AND \"rdvIdAttente\" IS NOT NULL;")

log "expires=${EXPIRES} deleted=${DELETED} en_file=${EN_FILE} rdv_attente_non_relus=${BLOQUES} expiration_days=${EXPIRATION_DAYS} retention_days=${RETENTION_DAYS}"
