# CONTRACT — Dashboard

> À copier dans `repos/dashboard/CONTRACT.md`.

**Rôle** : UI admin/client des centres d'imagerie **et API centrale du produit**. Base de vérité de la configuration.
**Stack** : TypeScript, Next.js 14 App Router, Prisma 6, PostgreSQL, NextAuth v4, Socket.io. 208 fichiers, ~48 000 LOC, 71 routes API, 18 modèles Prisma.
**Prod** : VPS OVH, PM2, `git pull` + `npm run build` + `pm2 restart` **[?]**. Aucune CI.

---

## Ce que j'expose

### Routes machine-à-machine (les plus critiques)

**Pour LyraeTalk** — header `x-api-key: BOT_API_KEY` :
`GET /api/configuration`, `GET /api/configuration/get/mapping`, `GET /api/configuration/get/mapping/getLibelle`, `GET /api/configuration/get/is_open`, `GET /api/sms-confirmation-config`, `POST /api/calls/summary`.

**Pour AI2Xplore** — header `x-api-key: APPOINTMENT_API_KEY` :
`POST /api/rdv/init`, `POST /api/rdv/ack`, `GET /api/rdv/pending-events`, `POST /api/rdv/reminder-sent`, `POST /api/prescriptions/init`, `GET /api/prescriptions/pending`, `GET /api/prescriptions/download/[id]`, `POST /api/prescriptions/ack/[id]`.

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

## Base PostgreSQL — partagée, pas privée

Base `dashboard` sur l'instance du VPS `vps-6fbed353` (`151.80.234.66:5432`), atteinte via
`DATABASE_URL`. **Je ne suis pas propriétaire complet** : vérifié en production le 10/08/2026,
deux autres systèmes accèdent à cette base **sans passer par mon API**.

| Consommateur direct | Accès | Ce qu'il fait |
|---|---|---|
| **AI2Xplore** | écriture, rôle `neuracorp` | crée et fait évoluer ses 3 tables via `postgres.ensureSchema()` à chaque démarrage, puis les lit/écrit en SQL brut |
| **Grafana** | lecture, rôle `grafana_readonly` | lit les tables en direct pour ses tableaux de bord — **un renommage de colonne le casse silencieusement** **[?] Q29** |

**31 tables dans le schéma `public`** : 28 à moi, 3 à AI2Xplore.

**Les 3 tables que je ne contrôle pas** — ne pas les inclure dans une migration, un
`prisma db pull`, ni un script de purge : `rdv_reminders`, `prescription_sync_log`,
`sandbox_rdv_planning`. Elles appartiennent à AI2Xplore (voir son `CONTRACT.md`).

**Deux drivers coexistent** : Prisma (`src/lib/prisma.ts`) et `pg` Pool (`src/lib/db.ts`), selon les endpoints.

**Migrations à deux vitesses** :
- Prisma : `prisma/migrations/YYYYMMDDHHMMSS_*/migration.sql` (6 dossiers)
- Manuel : `prisma/migrations/manual/*.sql` (10 fichiers) — **ces tables ne sont pas dans `schema.prisma`**

…et un **troisième** mécanisme que je ne pilote pas : `ensureSchema()` d'AI2Xplore, qui écrit
du DDL sur cette même base sans laisser de trace dans `_prisma_migrations`. **[?] Q30**

### Mes 28 tables, par origine

| Origine | Tables |
|---|---|
| Prisma (18) | `User`, `Product`, `UserProduct`, `UserNumber`, `LyraeExplainDetails`, `LyraeTalkDetails`, `FileSubmission`, `Ticket`, `TicketMessage`, `Notification`, `Call`, `TalkSettings`, `ReceivedCalls`, `TalkInformationSettings`, `ExamMapping`, `CallConversation`, `ModuleInfoItem`, `LoginAttempt` |
| SQL manuel (9) | `AppointmentConfirmation`, `ReminderSent`, `ReminderStats`, `ExternalCenterMapping`, `SmsConfirmationConfig`, `PrescriptionConfig`, `PrescriptionUpload`, `PrescriptionAccessLog`, `PrescriptionStats` |
| Interne Prisma (1) | `_prisma_migrations` |

### … et par propriétaire PostgreSQL

L'origine et le propriétaire ne coïncident pas : `LoginAttempt` est né en SQL manuel puis a été
rapatrié dans `schema.prisma`, mais son propriétaire est resté `neuracorp`.

| Propriétaire | Tables |
|---|---|
| `postgres` (18) | les 17 modèles Prisma hors `LoginAttempt`, plus `_prisma_migrations` |
| `neuracorp` (13) | les 9 tables SQL manuelles, plus `LoginAttempt` — **et les 3 tables d'AI2Xplore** |

---

## Qui dépend de moi

| Consommateur | Ce qu'il utilise |
|---|---|
| **LyraeTalk** | 6 endpoints, dont toute sa configuration métier par centre. **S'ils tombent, le robot n'a plus de config.** |
| **AI2Xplore** | 8 endpoints RDV + ordonnances, en polling — **et un accès direct en écriture à ma base PostgreSQL** |
| **Grafana** | format des logs d'audit — **et un accès direct en lecture à ma base PostgreSQL** (`grafana_readonly`) |

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
- Whitelist `/api/heartbeat/*` sans endpoint correspondant **[?] Q4**.
- Deux clients Prisma, deux mailers, deux seeds admin **[?] Q16**.
- `Call` et `CallConversation` coexistent **[?] Q13**.
- `LyraeExplain` : produit archivé, code encore présent **[?] Q14**.
- `SPECIAL_CENTRE_PAIRS` codé en dur (`auth-helpers.ts:32`).
- Aucun test. `schema.prisma` ne couvre pas les 9 tables SQL manuelles.
