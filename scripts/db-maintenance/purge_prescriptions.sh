#!/usr/bin/env bash
#
# Purge quotidienne des lignes PrescriptionUpload devenues inutiles + unlink
# des PDF associes du disque LUKS. RGPD compliance : on ne garde pas les
# ordonnances plus longtemps que necessaire.
#
# Politique de retention :
#   - ACKED (recuperees par AI2Xplore) : purge apres ACKED_RETENTION_DAYS
#     jours (defaut 30). Le centre a le PDF dans son logiciel metier depuis
#     longtemps, on peut supprimer notre copie temporaire.
#   - EXPIRED / LOCKED : purge apres FINAL_UNACKED_RETENTION_DAYS jours
#     (defaut 90). Ces PDFs n'ont pas ete uploades (EXPIRED) ou sont derriere
#     un LOCKED (3 mauvais codes patient), donc soit pas de fichier soit
#     inutile. On garde 90j au cas ou pour investigation.
#   - UPLOADED sans ackedAt apres 90j : safety net. Si AI2Xplore n'a jamais
#     ack, il y a un probleme — on garde la row 90j pour investigation
#     manuelle, puis purge.
#   - PENDING : jamais purge par ce script. L'expiration (creation +
#     expiresAt) les fait passer a EXPIRED, qui tombent alors dans la
#     branche ci-dessus.
#
# Sequence :
#   1. Cluster rows a purger + fichiers a unlink dans une seule transaction
#      via DELETE ... RETURNING storagePath (atomique, pas de race condition
#      avec des updates concurrents).
#   2. Unlink chaque fichier via loop bash. Erreurs (fichier deja absent,
#      permissions) loguees mais non-bloquantes.
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

# ----- Branche 1 : ACKED > 30j -----
# DELETE atomique + retourne les storagePath a unlink. NULL filtres cote bash.
ACKED_PATHS=$(psql "$DATABASE_URL" -tAc "
  DELETE FROM \"PrescriptionUpload\"
   WHERE \"ackedAt\" IS NOT NULL
     AND \"ackedAt\" < NOW() - INTERVAL '${ACKED_RETENTION_DAYS} days'
  RETURNING COALESCE(\"storagePath\", '');
")

DELETED_ACKED=0
UNLINK_ACKED_OK=0
UNLINK_ACKED_FAIL=0
if [ -n "$ACKED_PATHS" ]; then
  while IFS= read -r path; do
    DELETED_ACKED=$((DELETED_ACKED + 1))
    if [ -n "$path" ] && [ "$path" != "" ]; then
      if rm -f "$path" 2>/dev/null; then
        UNLINK_ACKED_OK=$((UNLINK_ACKED_OK + 1))
      else
        UNLINK_ACKED_FAIL=$((UNLINK_ACKED_FAIL + 1))
        log "WARN unlink failed on: $path"
      fi
    fi
  done <<< "$ACKED_PATHS"
fi

# ----- Branche 2 : EXPIRED/LOCKED + UPLOADED-orphan > 90j -----
FINAL_PATHS=$(psql "$DATABASE_URL" -tAc "
  DELETE FROM \"PrescriptionUpload\"
   WHERE (
          (\"status\" IN ('EXPIRED', 'LOCKED')
             AND \"createdAt\" < NOW() - INTERVAL '${FINAL_UNACKED_RETENTION_DAYS} days')
       OR (\"status\" = 'UPLOADED'
             AND \"ackedAt\" IS NULL
             AND \"uploadedAt\" < NOW() - INTERVAL '${FINAL_UNACKED_RETENTION_DAYS} days')
     )
  RETURNING COALESCE(\"storagePath\", '');
")

DELETED_FINAL=0
UNLINK_FINAL_OK=0
UNLINK_FINAL_FAIL=0
if [ -n "$FINAL_PATHS" ]; then
  while IFS= read -r path; do
    DELETED_FINAL=$((DELETED_FINAL + 1))
    if [ -n "$path" ] && [ "$path" != "" ]; then
      if rm -f "$path" 2>/dev/null; then
        UNLINK_FINAL_OK=$((UNLINK_FINAL_OK + 1))
      else
        UNLINK_FINAL_FAIL=$((UNLINK_FINAL_FAIL + 1))
        log "WARN unlink failed on: $path"
      fi
    fi
  done <<< "$FINAL_PATHS"
fi

REMAINING=$(psql "$DATABASE_URL" -tAc 'SELECT COUNT(*) FROM "PrescriptionUpload";')
DISK_USAGE=$(df -h /var/www/ordonnances 2>/dev/null | tail -1 | awk '{print $3"/"$2" ("$5")"}' || echo "n/a")

log "acked_deleted=${DELETED_ACKED} acked_unlinked_ok=${UNLINK_ACKED_OK} acked_unlink_failed=${UNLINK_ACKED_FAIL} final_deleted=${DELETED_FINAL} final_unlinked_ok=${UNLINK_FINAL_OK} final_unlink_failed=${UNLINK_FINAL_FAIL} remaining=${REMAINING} disk=${DISK_USAGE}"
