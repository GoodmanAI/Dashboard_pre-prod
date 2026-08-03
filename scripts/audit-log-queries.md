# Audit log — requetes LogQL (chantier 3, Lot D)

Toutes les actions sensibles emises par le dashboard sont loguees en JSON structure
sur stdout via `auditLog()` (voir [src/lib/auditLog.ts](../src/lib/auditLog.ts)).
Elles sont scrappees par Alloy sur la VM dashboard puis pushees vers Loki OVH avec
le label `service=dashboard`.

## Categories emises

- `auth`    : login OK/KO, logout, change-password, reset-password, kick-session
- `account` : create/update/delete admin/client/sub-account
- `ticket`  : create, status-change, message-admin (a venir)
- `data`    : delete/export PII, config sensibles (a venir Lot D+)

## Structure d'une ligne

```json
{
  "audit": true,
  "category": "account",
  "action": "create-sub-account",
  "timestamp": "2026-08-03T14:32:11.821Z",
  "success": true,
  "actorId": 1,
  "actorEmail": "enzo.jakobasch@gmail.com",
  "actorRole": "SUPER_ADMIN",
  "actorIp": "82.65.12.34",
  "actorUserAgent": "Mozilla/5.0 ...",
  "targetType": "user",
  "targetId": 42,
  "targetLabel": "secretaire.montchanin@centre.fr",
  "errorReason": null,
  "managerId": 12,
  "managerName": "Centre Montchanin",
  "permissions": { "ordonnances": "write", "tickets": "read" }
}
```

## Requetes utiles (Grafana Explore, datasource Loki)

### Toutes les entrees audit du dashboard

```
{service="dashboard"} | json | audit="true"
```

### Filtre par categorie

```
{service="dashboard"} | json | audit="true" | category="auth"
{service="dashboard"} | json | audit="true" | category="account"
{service="dashboard"} | json | audit="true" | category="ticket"
{service="dashboard"} | json | audit="true" | category="data"
```

### Tentatives de login echouees des dernieres 24h

```
{service="dashboard"} | json | audit="true" | category="auth" | action="login" | success="false"
```

### Toutes les actions d'un compte precis

```
{service="dashboard"} | json | audit="true" | actorId="12"
```

### Toutes les actions faites sur un compte precis (kick, edit permissions, etc.)

```
{service="dashboard"} | json | audit="true" | targetId="42" | targetType="user"
```

### Kicks de session (revocation JWT)

```
{service="dashboard"} | json | audit="true" | action="kick-session"
```

### Creations de sous-comptes (avec permissions grantees)

```
{service="dashboard"} | json | audit="true" | action="create-sub-account"
| line_format "{{.timestamp}} {{.actorEmail}} -> {{.targetLabel}} ({{.permissions}})"
```

### Suivi des changements de status de tickets

```
{service="dashboard"} | json | audit="true" | category="ticket" | action="status-change"
| line_format "{{.timestamp}} #{{.targetId}} {{.fromStatus}} -> {{.toStatus}} ({{.actorEmail}})"
```

### Tentatives sur des comptes verrouilles

```
{service="dashboard"} | json | audit="true" | errorReason="account-locked"
```

### Volume d'audit par action (bar chart)

```
sum by (action) (
  count_over_time({service="dashboard"} | json | audit="true" [1h])
)
```

### Volume login OK vs KO par heure

```
sum by (success) (
  count_over_time({service="dashboard"} | json | audit="true" | action="login" [1h])
)
```

## Alerting suggestions

A ajouter dans rules.yml Grafana si necessaire :

- `high-failed-login-rate` : > 10 login KO / 5min depuis meme IP -> notify
- `super-admin-kick` : n'importe quelle action de kick par SUPER_ADMIN -> info (traceable)
- `admin-created` : creation d'un ADMIN -> notify (evenement rare, doit etre voulu)
- `super-admin-locked` : lockout du SUPER_ADMIN -> notify urgent

## Cycle de vie / retention

Les logs Loki OVH ont la retention configuree cote OVH (30 jours par defaut).
Pour la conformite RGPD/HDS, on peut :

1. Reduire la retention Loki via config OVH
2. Exporter periodiquement les logs `audit=true` vers un stockage long-terme
   (S3 archive) via un job cron cote VM logs

Pas de purge cote application : `auditLog()` ne persiste rien en DB, tout
transite par Loki.
