#!/usr/bin/env bash
#
# Purge quotidienne des lignes PrescriptionUpload devenues inutiles + unlink
# des PDF associes du disque LUKS. RGPD compliance : on ne garde pas les
# ordonnances plus longtemps que necessaire.
#
# Depuis le 08/10/2026 un lien (PrescriptionUpload) porte jusqu'a 5
# documents (PrescriptionDocument), chacun avec son fichier. On purge par
# LIEN : ses documents et leurs fichiers partent avec lui.
#
# Politique de retention :
#   - Lien dont TOUS les documents sont ACKED (recuperes par AI2Xplore) :
#     purge ACKED_RETENTION_DAYS jours (defaut 30) apres l'heure du RDV
#     ("expiresAt"). Avant, le patient peut encore ajouter un document.
#   - Tout lien cree il y a plus de FINAL_UNACKED_RETENTION_DAYS jours
#     (defaut 90) : filet (PENDING jamais rempli, EXPIRED, LOCKED, document
#     jamais acquitte), SAUF s'il porte un document REJECTED que la
#     secretaire n'a pas encore traite.
#   - Carte « ordonnance par mail » (PrescriptionParMail) : purge
#     ACKED_RETENTION_DAYS jours apres le RDV.
#
# Sequence : une instruction par branche. Une CTE choisit les liens, une
# autre supprime leurs documents, une troisieme les liens, et l'instruction
# renvoie les chemins des fichiers (documents + ancien "storagePath" du lien,
# dedoublonnes). La cle etrangere document -> lien est NO ACTION, verifiee en
# fin d'instruction : les deux suppressions passent ensemble. Puis unlink
# de chaque fichier ; erreurs (fichier deja absent, permissions) loguees mais
# non bloquantes.
#
# Usage manuel : sudo bash purge_prescriptions.sh
# Usage cron    : /etc/cron.d/dashboard-purge-prescriptions (quotidien)

set -euo pipefail

ENV_FILE="/var/www/Dashboard_pre-prod/.env"
ACKED_RETENTION_DAYS="${ACKED_RETENTION_DAYS:-30}"
FINAL_UNACKED_RETENTION_DAYS="${FINAL_UNACKED_RETENTION_DAYS:-90}"

log() { echo "[$(date -Iseconds)] purge_prescriptions: $*"; }

if [ ! -r "$ENV_FILE" ]; then
  log "ERROR: cannot read $ENV_FILE" >&2
  exit 1
fi

DATABASE_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'")
if [ -z "${DATABASE_URL:-}" ]; then
  log "ERROR: DATABASE_URL not set in $ENV_FILE" >&2
  exit 1
fi

# purge_liens "<condition SQL sur pu>" : supprime les liens choisis et leurs
# documents, imprime les chemins de fichiers a supprimer (un par ligne).
purge_liens() {
  psql "$DATABASE_URL" -tAc "
    WITH cible AS (
      SELECT pu.\"id\" FROM \"PrescriptionUpload\" pu WHERE $1
    ), docs AS (
      DELETE FROM \"PrescriptionDocument\"
       WHERE \"uploadId\" IN (SELECT \"id\" FROM cible)
      RETURNING \"storagePath\" AS p
    ), liens AS (
      DELETE FROM \"PrescriptionUpload\"
       WHERE \"id\" IN (SELECT \"id\" FROM cible)
      RETURNING \"storagePath\" AS p
    )
    SELECT p FROM docs WHERE p IS NOT NULL
    UNION
    SELECT p FROM liens WHERE p IS NOT NULL;
  "
}

# unlink_chemins <chemins> : supprime les fichiers, imprime "ok echecs".
unlink_chemins() {
  local ok=0 fail=0
  if [ -n "$1" ]; then
    while IFS= read -r path; do
      [ -z "$path" ] && continue
      if rm -f "$path" 2>/dev/null; then
        ok=$((ok + 1))
      else
        fail=$((fail + 1))
        log "WARN unlink failed on: $path" >&2
      fi
    done <<< "$1"
  fi
  echo "$ok $fail"
}

# ----- Branche 1 : tous les documents ACKED, RDV passe depuis 30 j -----
ACKED_PATHS=$(purge_liens "
  pu.\"expiresAt\" < NOW() - INTERVAL '${ACKED_RETENTION_DAYS} days'
  AND EXISTS (SELECT 1 FROM \"PrescriptionDocument\" d WHERE d.\"uploadId\" = pu.\"id\")
  AND NOT EXISTS (SELECT 1 FROM \"PrescriptionDocument\" d
                   WHERE d.\"uploadId\" = pu.\"id\" AND d.\"status\" <> 'ACKED')
")
read -r UNLINK_ACKED_OK UNLINK_ACKED_FAIL <<< "$(unlink_chemins "$ACKED_PATHS")"

# ----- Branche 2 : filet a 90 j, sauf rejet non traite -----
FINAL_PATHS=$(purge_liens "
  pu.\"createdAt\" < NOW() - INTERVAL '${FINAL_UNACKED_RETENTION_DAYS} days'
  AND NOT EXISTS (SELECT 1 FROM \"PrescriptionDocument\" d
                   WHERE d.\"uploadId\" = pu.\"id\"
                     AND d.\"status\" = 'REJECTED'
                     AND d.\"manualResolvedAt\" IS NULL)
")
read -r UNLINK_FINAL_OK UNLINK_FINAL_FAIL <<< "$(unlink_chemins "$FINAL_PATHS")"

# ----- Branche 3 : ordonnances a envoyer par mail, RDV passe depuis 30 j -----
# Aucun fichier : la carte ne porte que le patient et le RDV (09/10/2026).
PAR_MAIL_PURGED=$(psql "$DATABASE_URL" -tAc "
  WITH d AS (
    DELETE FROM \"PrescriptionParMail\"
     WHERE \"appointmentDate\" < NOW() - INTERVAL '${ACKED_RETENTION_DAYS} days'
    RETURNING 1
  ) SELECT COUNT(*) FROM d;
" 2>/dev/null || echo "n/a")

REMAINING=$(psql "$DATABASE_URL" -tAc 'SELECT COUNT(*) FROM "PrescriptionUpload";')
DISK_USAGE=$(df -h /var/www/ordonnances 2>/dev/null | tail -1 | awk '{print $3"/"$2" ("$5")"}' || echo "n/a")

log "acked_unlinked_ok=${UNLINK_ACKED_OK} acked_unlink_failed=${UNLINK_ACKED_FAIL} final_unlinked_ok=${UNLINK_FINAL_OK} final_unlink_failed=${UNLINK_FINAL_FAIL} par_mail_purged=${PAR_MAIL_PURGED} remaining=${REMAINING} disk=${DISK_USAGE}"
