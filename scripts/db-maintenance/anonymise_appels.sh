#!/usr/bin/env bash
#
# Anonymisation des appels LyraeTalk plus anciens que le délai de leur centre.
#
# Plan : plans/2026-09-retention-des-appels.md (workspace). Le délai est
# "UserProduct"."retentionAppelsMois" (3 par défaut, 1 à 24), réglé par l'admin
# dans « Installation Talk ».
#
# ON N'EFFACE PAS LA LIGNE, on la vide de ce qui identifie le patient :
#   - "steps"                  -> '[]'          (la transcription)
#   - "stats"->'phoneNumber'   -> retiré        (le numéro appelant)
#   - "stats"->'entites'       -> retiré        (nom, prénom, date de naissance extraits)
#   - "anonymiseeLe"           -> maintenant
# Le reste de "stats" fait les statistiques (RDV pris, examen, issue, durée...) et
# reste. "stats"->'internal' est gardé (décision du 28/09/2026) : compteurs et
# latences, aucune donnée patient.
#
# "nbTours" est rempli au passage s'il ne l'est pas : c'est lui qui garde l'appel
# dans les statistiques une fois "steps" vidé (filtre « plus d'un échange »).
#
# IRRÉVERSIBLE. Avant la première exécution en production : sauvegarde de la
# table, puis --a-blanc. Cf. lot 4 du plan.
#
# - Lit DATABASE_URL depuis /var/www/Dashboard_pre-prod/.env
# - Par paquets de TAILLE_PAQUET lignes, pour ne jamais tenir de verrou long : le
#   robot écrit dans cette table pendant le passage.
# - Date limite en UTC : la colonne "createdAt" est un timestamp sans fuseau qui
#   porte de l'UTC. `now()` seul serait lu dans le fuseau du serveur (Paris).
#   Même calcul que `debutConservation` de src/lib/retentionAppels.ts.
# - Une ligne de log par exécution : lignes anonymisées, restant à anonymiser.
#
# Usage manuel :
#   sudo bash anonymise_appels.sh --a-blanc              # compte par centre, n'écrit rien
#   sudo bash anonymise_appels.sh --centre 12            # un seul centre
#   sudo bash anonymise_appels.sh                        # tous les centres
# Usage cron : une fois par jour, cf. deploy/crontab.txt

set -euo pipefail

ENV_FILE="${ENV_FILE:-/var/www/Dashboard_pre-prod/.env}"
TAILLE_PAQUET="${TAILLE_PAQUET:-5000}"

A_BLANC=0
CENTRE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --a-blanc) A_BLANC=1 ;;
    --centre)
      shift
      CENTRE="${1:-}"
      if ! [[ "$CENTRE" =~ ^[0-9]+$ ]]; then
        echo "--centre attend un userProductId numérique" >&2
        exit 2
      fi
      ;;
    *) echo "Option inconnue : $1" >&2; exit 2 ;;
  esac
  shift
done

log() { echo "[$(date -Iseconds)] anonymise_appels: $*"; }

if [ ! -r "$ENV_FILE" ]; then
  log "ERROR: cannot read $ENV_FILE" >&2
  exit 1
fi

DATABASE_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'")

if [ -z "${DATABASE_URL:-}" ]; then
  log "ERROR: DATABASE_URL not set in $ENV_FILE" >&2
  exit 1
fi

# Filtre commun : lignes pas encore anonymisées, plus vieilles que le délai du centre.
FILTRE_CENTRE=""
if [ -n "$CENTRE" ]; then
  FILTRE_CENTRE="AND c.\"userProductId\" = ${CENTRE}"
fi
CIBLE="
  FROM \"CallConversation\" c
  JOIN \"UserProduct\" up ON up.id = c.\"userProductId\"
 WHERE c.\"anonymiseeLe\" IS NULL
   AND c.\"createdAt\" < (now() AT TIME ZONE 'UTC') - make_interval(months => up.\"retentionAppelsMois\")
   ${FILTRE_CENTRE}
"

if [ "$A_BLANC" -eq 1 ]; then
  log "a blanc : rien n'est modifie"
  psql "$DATABASE_URL" -P pager=off -c "
    SELECT c.\"userProductId\"                AS centre,
           up.\"retentionAppelsMois\"          AS delai_mois,
           COUNT(*)                            AS a_anonymiser,
           MIN(c.\"createdAt\")                AS plus_ancien,
           MAX(c.\"createdAt\")                AS plus_recent
    ${CIBLE}
    GROUP BY 1, 2
    ORDER BY 3 DESC;
  "
  TOTAL=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) ${CIBLE};")
  log "a_anonymiser=${TOTAL} centre=${CENTRE:-tous}"
  exit 0
fi

ANONYMISEES=0
while true; do
  N=$(psql "$DATABASE_URL" -tAc "
    WITH cible AS (
      SELECT c.id
      ${CIBLE}
      ORDER BY c.id
      LIMIT ${TAILLE_PAQUET}
    ),
    faites AS (
      UPDATE \"CallConversation\" cc
         SET \"nbTours\" = COALESCE(
               cc.\"nbTours\",
               CASE WHEN jsonb_typeof(cc.steps::jsonb) = 'array'
                    THEN jsonb_array_length(cc.steps::jsonb) ELSE 0 END
             ),
             steps = '[]'::jsonb,
             stats = cc.stats::jsonb - 'phoneNumber' - 'entites',
             \"anonymiseeLe\" = now() AT TIME ZONE 'UTC'
        FROM cible
       WHERE cc.id = cible.id
      RETURNING 1
    )
    SELECT COUNT(*) FROM faites;
  ")
  ANONYMISEES=$((ANONYMISEES + N))
  if [ "$N" -lt "$TAILLE_PAQUET" ]; then
    break
  fi
done

RESTANT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) ${CIBLE};")
TOTAL_ANONYMISEES=$(psql "$DATABASE_URL" -tAc 'SELECT COUNT(*) FROM "CallConversation" WHERE "anonymiseeLe" IS NOT NULL;')

log "anonymisees=${ANONYMISEES} restant=${RESTANT} total_anonymisees=${TOTAL_ANONYMISEES} centre=${CENTRE:-tous}"
