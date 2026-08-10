# CONTRACT — Dashboard

> À copier dans `repos/dashboard/CONTRACT.md`.

**Rôle** : UI admin/client des centres d'imagerie **et API centrale du produit**. Base de vérité de la configuration.
**Stack** : TypeScript, Next.js 14 App Router, Prisma 6, PostgreSQL, NextAuth v4, Socket.io. 208 fichiers, ~48 000 LOC, 71 routes API, 17 modèles Prisma.
**Prod** : VPS OVH, PM2, `git pull` + `npm run build` + `pm2 restart` **[?]**. Aucune CI.

---

## Ce que j'expose

### Routes machine-à-machine (les plus critiques)

**Pour LyraeTalk** — header `x-api-key: BOT_API_KEY` :
`GET /api/configuration`, `GET /api/configuration/get/mapping`, `GET /api/configuration/get/mapping/getLibelle`, `GET /api/configuration/get/is_open`, `GET /api/sms-confirmation-config`, `POST /api/calls/summary`.

**Pour AI2Xplore** — header `x-api-key: APPOINTMENT_API_KEY` :
`POST /api/rdv/init`, `POST /api/rdv/ack`, `GET /api/rdv/pending-events`, `POST /api/rdv/reminder-sent`, `POST /api/prescriptions/init`, `GET /api/prescriptions/pending`, `GET /api/prescriptions/download/[id]`, `POST /api/prescriptions/ack/[id]`.

**Pour les sondes de déploiement** — header `x-api-key: DEPLOY_PROBE_API_KEY` :
`POST /api/deployments` (écriture, appelée par `deploy/deployment-probe.js` des VMs
lyraetalk, ai2xplore et dashboard, toutes les 15 min),
`GET /api/deployments` (lecture, auth mixte : session admin pour la page
`/admin/deployments`, API key pour `daily-report`).

Clé dédiée et non `ADMIN_API_KEY` : la sonde n'a besoin que d'écrire son propre état.
Le statut (`behind`, `restart_pending`, `stale`…) est **dérivé à la lecture**, jamais
stocké — il dépend de l'heure qu'il est.

Whitelist dans `src/middleware.ts:13-33`. **Toute nouvelle route M2M doit y être ajoutée.**

### Routes applicatives (71 au total)
Auth NextAuth, comptes (`/api/admin/users*`, `/api/admin/clients*`), tickets, notifications, RDV/SMS, ordonnances, mapping de centres externes, numéros, fichiers, statistiques, produits, données d'examens.

### Pages patient publiques
`/c`, `/d`, `/confirm` — token 8 caractères + `verificationCode` haché bcrypt.
Sous-domaines : `rdv.neuracorp.ai`, `depot-ordonnances.neuracorp.ai` (doivent pointer sur le même conteneur Next).

### Sorties
- Socket.io `/api/socket` : `ticket-updated { ticketId, kind }`, `call-flagged { callId, flagged }`.
- Logs d'audit stdout JSON (`audit=true`) → Alloy → Loki (`service=dashboard`). **Format consommé par LogQL et les alertes Grafana** — voir `scripts/audit-log-queries.md`.
- Mails Brevo (tickets).

### Scripts et crons
`create-super-admin.js`, seeds, et `scripts/db-maintenance/*.sh` (purges) déclenchés par cron système **hors dépôt [?] Q10**.

---

## Ce que je consomme

| Cible | Détail |
|---|---|
| **Brevo** | `api.brevo.com/v3/smtp/email` (URL en dur) |
| **Azure Blob `neuracorp-exams`** | `/api/data/exams`, `/api/configuration/get/mapping`, `/api/configuration/exam` — **partagé avec les Azure Functions, couplage non identifié jusqu'ici [?] Q3** |
| **ClamAV** | socket Unix local |
| **SMTP nodemailer** | uniquement `api/files/validation` — legacy |
| **PostgreSQL** | `DATABASE_URL` |
| **Disque local** | `PRESCRIPTIONS_STORAGE_DIR`, `public/upload/` |

---

## Base que je possède

PostgreSQL unique via `DATABASE_URL`. Propriétaire complet. **[?] Q2** — relation exacte avec la base d'AI2Xplore à clarifier.

**Deux drivers coexistent** : Prisma (`src/lib/prisma.ts`) et `pg` Pool (`src/lib/db.ts`), selon les endpoints.

**Migrations à deux vitesses** :
- Prisma : `prisma/migrations/YYYYMMDDHHMMSS_*/migration.sql` (6 dossiers)
- Manuel : `prisma/migrations/manual/*.sql` (10 fichiers) — **ces tables ne sont pas dans `schema.prisma`**

| Origine | Tables |
|---|---|
| Prisma (17) | `User`, `Product`, `UserProduct`, `UserNumber`, `LyraeExplainDetails`, `LyraeTalkDetails`, `FileSubmission`, `Ticket`, `TicketMessage`, `Notification`, `Call`, `TalkSettings`, `ReceivedCalls`, `TalkInformationSettings`, `ExamMapping`, `CallConversation`, `LoginAttempt` |
| SQL manuel (10) | `AppointmentConfirmation`, `ReminderSent`, `ReminderStats`, `ExternalCenterMapping`, `SmsConfirmationConfig`, `PrescriptionConfig`, `PrescriptionUpload`, `PrescriptionAccessLog`, `PrescriptionStats`, `DeploymentStatus` |

`DeploymentStatus` est la seule table **purement observationnelle** : aucune donnée métier,
aucun lien vers les autres tables, une ligne par couple (service, host). Un `DROP` est sans
conséquence — les sondes la repeuplent au cycle suivant.

---

## Qui dépend de moi

| Consommateur | Ce qu'il utilise |
|---|---|
| **LyraeTalk** | 6 endpoints, dont toute sa configuration métier par centre. **S'ils tombent, le robot n'a plus de config.** |
| **AI2Xplore** | 8 endpoints RDV + ordonnances, en polling |
| **Grafana** | format des logs d'audit |
| **daily-report** | `GET /api/deployments` — section « Déploiement » du mail quotidien. Dégradation gracieuse de son côté : si la route tombe, la section disparaît, le mail part quand même |
| **Sondes de déploiement** (3 VMs) | `POST /api/deployments` toutes les 15 min |

---

## Invariants à ne pas casser

1. **Header `x-api-key`** — le renommer casse LyraeTalk **et** AI2Xplore simultanément.
2. **Payload `POST /api/calls/summary`** : tableau `steps` **ordonné**, index 0 = Lyrae, index 1 = User, alternance stricte (`route.ts:30`).
3. **Payloads** `POST /api/rdv/init`, `POST /api/prescriptions/init` (clés, format de date de naissance, enum de type d'examen).
4. **Forme de `GET /api/prescriptions/pending`** : `{ pending, total }`.
5. **`ExternalCenterMapping.externalCenterCode`** = clé de jointure avec AI2Xplore.
6. **Colonnes camelCase entre guillemets** (`"User"`, `"UserProduct"`) — sensibles à la casse.
7. **`Product.name === "LyraeTalk"`** — chaîne magique répétée 40+ fois.
8. **`AppointmentConfirmation.shortCode`** (8 caractères) et **`PrescriptionUpload.token`** : format des URL déjà envoyées par SMS.
9. **`RDV_SHORT_URL_BASE`, `DEPOT_ORDONNANCES_URL_BASE`, `PUBLIC_APP_URL`** : les changer casse les nouveaux SMS générés.
10. **`JWT_SECRET`** : le changer déconnecte tout le monde. `User.tokenVersion` : l'incrémenter expulse au prochain refresh (~1 h).
11. **Clés du log d'audit JSON** (`audit`, `category`, `action`, `timestamp`, `actorId`, `actorEmail`, `actorRole`, `actorIp`, `actorUserAgent`, `targetType`, `targetId`, `targetLabel`, `success`, `errorReason`) — utilisées dans les requêtes LogQL et les alertes.

---

## Dette connue

- `README.md` obsolète (ne parle que de Docker Compose).
- `.env.example` incomplet : 15 variables listées, 26+ attendues **[?] Q15**.
- ~~Whitelist `/api/heartbeat/*` sans endpoint correspondant **[?] Q4**.~~ **Résolu le 2026-08-10** : la whitelist avait en fait déjà été retirée de `src/middleware.ts` — aucune occurrence de `heartbeat` dans `src/`. Le seul émetteur restant, AI2Xplore, a été coupé de son côté. Q4 close.
- Deux clients Prisma, deux mailers, deux seeds admin **[?] Q16**.
- `Call` et `CallConversation` coexistent **[?] Q13**.
- `LyraeExplain` : produit archivé, code encore présent **[?] Q14**.
- `SPECIAL_CENTRE_PAIRS` codé en dur (`auth-helpers.ts:32`).
- Aucun test. `schema.prisma` ne couvre pas les 9 tables SQL manuelles.
