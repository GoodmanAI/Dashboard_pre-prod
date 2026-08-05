# Module Info — Intégration Azure Functions

Chantier 2026-08-05. Cette doc décrit les 2 contrats entre le **Dashboard
Neuracorp** et la brique **Azure Functions `module_info`** (bot IA
d'accueil médical).

## Vue d'ensemble

```
┌────────────────────┐      GET /api/module-info/{id}       ┌──────────────────┐
│                    │ ◄────────────────────────────────────│                  │
│  Dashboard         │      (X-Api-Key, If-None-Match)      │  Azure Functions │
│  Neuracorp         │                                       │   module_info    │
│  (source           │      POST {webhook}                   │                  │
│   de vérité)       │ ────────────────────────────────────► │  (consommateur   │
│                    │      (warm-up après mutation)         │   + cache)       │
└────────────────────┘                                       └──────────────────┘
```

Le dashboard est **source de vérité**. Le client édite ses Q/R via UI
(`/informationnel` → bloc "FAQ patient"). À chaque mutation :

1. Le dashboard bump `moduleInfoVersion` du centre concerné
2. Le dashboard **notifie** Azure via webhook (Contrat B, fire-and-forget)
3. Azure va récupérer les Q/R à jour via GET (Contrat A) puis reconstruit
   sa base de connaissances **avant** qu'un patient n'arrive

En complément, Azure peut aussi poller périodiquement le GET (filet de
secours si le webhook rate).

## Contrat A — GET public (Dashboard → Azure consomme)

**URL prod** : `https://dashboard.neuracorp.ai/api/module-info/{userProductId}`

**Auth** : header `X-Api-Key: $MODULE_INFO_API_KEY`

**Voir spec complète** : [`openapi-module-info.yaml`](./openapi-module-info.yaml)

### Exemple curl

```bash
# Premier appel (récupère tout)
curl -H "X-Api-Key: $MODULE_INFO_API_KEY" \
     -H "Accept: application/json" \
     https://dashboard.neuracorp.ai/api/module-info/15
```

Réponse :
```json
{
  "userproductID": "15",
  "site_code": "MEN",
  "version": "2026-08-05T10:22:31.123Z",
  "items": [
    { "id": "urgence-sans-rdv",
      "question": "En cas d'examen demandé en urgence...",
      "reponse": "Non, tous les examens...",
      "categorie": "Rendez-vous",
      "enabled": true }
  ]
}
```

Header de réponse : `ETag: "2026-08-05T10:22:31.123Z"`

### Appel conditionnel (poll)

Azure DOIT stocker l'ETag reçu et le renvoyer via `If-None-Match` au
prochain call pour éviter les downloads inutiles :

```bash
curl -H "X-Api-Key: $MODULE_INFO_API_KEY" \
     -H 'If-None-Match: "2026-08-05T10:22:31.123Z"' \
     https://dashboard.neuracorp.ai/api/module-info/15
```

- Si version identique → `304 Not Modified` (aucun body, header ETag confirme)
- Si version différente → `200 OK` avec le nouveau JSON + nouveau ETag

### Codes d'erreur

| Code | Signification | Action Azure |
|---|---|---|
| 200 | OK avec nouveau JSON | Reconstruire base de connaissances |
| 304 | Pas de changement | Rien à faire, garder cache local |
| 400 | userProductId invalide | Config Azure, log + skip |
| 401 | X-Api-Key manquant | Config Azure, log + alerte |
| 403 | X-Api-Key invalide | Rotation clé côté dashboard, alerte |
| 404 | UserProduct inconnu | Config Azure, log (centre supprimé côté dashboard ?) |
| 500 | Erreur dashboard | Retry avec backoff, log |

## Contrat B — Webhook warm-up (Dashboard → Azure appelle)

**Déclenché** : à chaque mutation (create / edit / delete / toggle) d'un
`ModuleInfoItem` côté dashboard.

**URL cible** : variable d'env dashboard `AZURE_REBUILD_WEBHOOK_URL`

**Méthode** : `POST`

**Headers** :
- `Content-Type: application/json`
- `X-Api-Key: $AZURE_WEBHOOK_API_KEY` (variable d'env dashboard, à partager
  avec Azure)

**Body** :
```json
{
  "userproductID": "15",
  "version": "2026-08-05T10:22:31.123Z"
}
```

**Réponse attendue d'Azure** : `202 Accepted` (traitement asynchrone)

### Comportement côté dashboard

- **Fire-and-forget** : le POST est lancé en arrière-plan, la sauvegarde
  UI côté client ne l'attend pas
- **Retry** : 2 retries automatiques en cas d'échec réseau / non-2xx
  (backoff court de 500ms)
- **Timeout** : 5 secondes par tentative
- **Log** : échec définitif visible dans Loki :
  ```logql
  {service_name="dashboard"} |= "moduleInfoWebhook" |= "ECHEC DEFINITIF"
  ```

### Comportement recommandé côté Azure

À réception du webhook :

1. Répondre `202` immédiatement (async)
2. Lancer un GET conditionnel sur `/api/module-info/{userproductID}` avec
   l'ETag stocké (ou sans si première fois)
3. Si `200` → reconstruire la base de connaissances avec le nouveau JSON,
   stocker le nouvel ETag
4. Si `304` → étrange (le webhook signale une version qui n'a pas changé),
   log + skip
5. Si erreur → retry avec backoff

## Variables d'env

### Côté dashboard (à configurer dans `/var/www/Dashboard_pre-prod/.env`)

| Var | Rôle |
|---|---|
| `MODULE_INFO_API_KEY` | Clé partagée pour authentifier Azure sur le GET Contrat A |
| `AZURE_REBUILD_WEBHOOK_URL` | URL cible du webhook Azure (Contrat B) |
| `AZURE_WEBHOOK_API_KEY` | Clé partagée pour authentifier le dashboard sur le webhook Contrat B |

**Sécurité** :
- Rotations : négocier la rotation des 2 clés avec l'équipe Azure. Prévoir
  un chevauchement (dashboard accepte 2 clés simultanément pendant la
  rotation → à ajouter en v2 si besoin).
- Ne jamais logger les clés (déjà en place dans le code).

### Côté Azure (à configurer dans le repo azure-functions)

| Var | Rôle |
|---|---|
| `NEURACORP_DASHBOARD_URL` | Base URL du dashboard (ex: `https://dashboard.neuracorp.ai`) |
| `NEURACORP_MODULE_INFO_API_KEY` | Même valeur que `MODULE_INFO_API_KEY` côté dashboard |
| `NEURACORP_WEBHOOK_INBOUND_API_KEY` | Même valeur que `AZURE_WEBHOOK_API_KEY` côté dashboard |

## Format des identifiants

- **`userProductId`** (path param URL) : entier positif, id du `UserProduct`
  LyraeTalk d'un centre côté dashboard. Ex : `15` = Menton, `18` = Quimper,
  `22` = GH Pontivy. **Clé canonique partagée** avec les autres briques
  (calls, prescriptions, rdv, etc.).

- **`userproductID`** (dans le JSON, casing préservé pour compat Azure) :
  même valeur, converti en string pour cohérence avec les autres briques
  Lyrae qui manipulent souvent l'id comme string.

- **`site_code`** : `externalCenterCode` du centre côté AI2Xplore
  (ex: `MEN`, `N01`, `A04`). Info uniquement, pas utilisée comme clé
  d'entrée.

- **`id`** des items : slug lisible dérivé de la question (ex:
  `urgence-sans-rdv`). Unique par `userProductId`. Stable : ne change
  pas si on édite la question de l'item.

## Design decisions

### Pourquoi ETag + If-None-Match plutôt que Last-Modified ?

Plus fiable (comparaison exacte, indépendant de la précision timestamp) et
convention HTTP standard pour du contenu généré dynamiquement.

### Pourquoi filtrer les items `enabled=false` côté back ?

Simplicité côté bot : "invisible = inexistant". Si Azure a besoin de
connaître les items désactivés à l'avenir (ex: page admin dans le bot),
on ajoutera un query param `?includeDisabled=true` sans casser la version
actuelle (backward-compat).

### Pourquoi webhook fire-and-forget sans queue Redis ?

- Le dashboard n'a pas Redis dans sa stack actuelle
- Le webhook n'est pas critique (Azure a un filet de secours via poll)
- Un simple `void sendWithRetries(...)` sans await + logs Loki suffisent
  pour l'observabilité

### Pourquoi UI dans `/informationnel` et pas une page dédiée ?

Cohérent thématiquement : les Q/R FAQ patient sont des "infos" que le bot
donne aux patients. Ajouter une page top-level "FAQ patient" séparée
aurait fragmenté la config du centre. Le bloc en tête d'`/informationnel`
est visible dès l'ouverture, permissions déjà gérées via
`PAGES.INFORMATIONNEL` du chantier 3.

## Tests / Vérification post-déploiement

### 1. Endpoint public accessible

```bash
curl -i -H "X-Api-Key: $MODULE_INFO_API_KEY" \
  https://dashboard.neuracorp.ai/api/module-info/15
```

Attendu : `200 OK` avec JSON + header `ETag: "..."`.

### 2. GET conditionnel fonctionne

Extraire l'ETag du call 1, le re-passer :

```bash
ETAG=$(curl -sI -H "X-Api-Key: $MODULE_INFO_API_KEY" \
  https://dashboard.neuracorp.ai/api/module-info/15 | grep -i etag | cut -d' ' -f2 | tr -d '\r')

curl -i -H "X-Api-Key: $MODULE_INFO_API_KEY" \
     -H "If-None-Match: $ETAG" \
  https://dashboard.neuracorp.ai/api/module-info/15
```

Attendu : `304 Not Modified` sans body.

### 3. Auth fonctionne

```bash
# Sans clé → 401
curl -i https://dashboard.neuracorp.ai/api/module-info/15

# Mauvaise clé → 403
curl -i -H "X-Api-Key: bogus" https://dashboard.neuracorp.ai/api/module-info/15
```

### 4. Webhook Azure reçu après mutation

Créer une Q/R via UI dashboard, vérifier les logs Azure Functions
`module_info` pour l'arrivée du POST warm-up.

Côté dashboard, vérifier qu'aucun log erreur :
```logql
{service_name="dashboard"} |= "moduleInfoWebhook" | json | level="error"
```

## Audit

Toutes les mutations sont loguées dans le pipeline audit générique du
dashboard (chantier 3) :

```logql
{service_name="dashboard"} | json | audit="true" | category="data" | action=~"module-info-.*"
```

Actions tracées : `module-info-create`, `module-info-update`, `module-info-delete`.
