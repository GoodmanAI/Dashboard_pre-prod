# AUDIT — Dashboard

## 1. Identité
- Rôle en une phrase : Dashboard Neuracorp (front + back Next.js App Router) qui expose l'UI admin/client de gestion des centres d'imagerie et sert d'API centrale pour les briques LyraeTalk (bot vocal) et AI2Xplore (API RIS/PACS).
- Langage(s) + version : TypeScript 5.7.3, JavaScript (scripts CJS)
- Framework(s) principal(aux) : Next.js 14.2.35 (App Router + Pages Router résiduel pour socket.io), NextAuth v4.24.11, Prisma 6.3.1, React 18.2.0, MUI 5.15.15, Socket.io 4.8.3, Zod 3.24.1
- Gestionnaire de paquets / build : npm (package-lock.json commité), build via `next build`
- Taille approximative (nb de fichiers source, LOC) : 208 fichiers `.ts` / `.tsx` sous `src/`, ~47 830 LOC ; 71 routes API (`src/app/api/**/route.ts`) ; 17 modèles Prisma

## 2. Structure
- Point(s) d'entrée (fichier exact) :
  - `src/app/layout.tsx` — layout racine Next.js App Router (SessionProvider, ThemeProvider, CentreProvider, PageAccessGuard)
  - `src/app/page.tsx` — page racine (redirect selon rôle et permissions)
  - `src/middleware.ts` — middleware Next (host isolation sous-domaines patient + auth admin/client + rate-limit routes API)
  - `src/pages/api/socket.ts` — initialisation Socket.io (Pages Router legacy, cohabite avec App Router)
  - `dockerfile` + `entrypoint.sh` — bootstrap conteneur (wait DB → migrate → seed → start)
- Répertoires de premier niveau et rôle de chacun :
  - `prisma/` — schema Prisma, migrations Prisma auto + `migrations/manual/*.sql` (jouées à la main), seeds
  - `scripts/` — `create-super-admin.js` (bootstrap SUPER_ADMIN), `db-maintenance/*.sh` (purges cron), `audit-log-queries.md` (doc LogQL), `seed*.ts` (obsolètes ?)
  - `sql/` — un unique `delete.sql`
  - `src/app/` — routes App Router (UI admin/client + API `/api/*` + pages publiques patient `/c`, `/d`, `/confirm`)
  - `src/pages/` — uniquement `api/socket.ts` (Pages Router pour init Socket.io)
  - `src/components/` — composants React partagés (tickets, notifications, permissions, admin/users)
  - `src/hooks/` — hooks React (ex: `usePrescriptionAlertsCount`)
  - `src/lib/` — helpers backend (auth, permissions, audit, mailer Brevo, db, prisma, socket, clamav, ticketNotifications, etc.)
  - `src/utils/` — helpers legacy dupliqués (`prisma.ts` bis, `mailer.ts` nodemailer legacy)
  - `src/types/` — extensions `next-auth.d.ts` (rôles + permissions dans session)
  - `public/` — assets statiques (logos, fonts, templates CSV `upload/template/*`, uploads user `upload/*`)
- Répertoires générés / vendored qui sont COMMITÉS dans le repo :
  - `public/upload/` contient des CSV clients (`talkInfo-*.csv`, `talkLibeles-*.csv`) — vendored par le seed / création client, à confirmer si prod ou uniquement local
  - `.next/`, `node_modules/` : présents sur disque local mais ignorés (`.gitignore`)
  - `tsconfig.tsbuildinfo` : présent sur disque local (à confirmer s'il est commité — normalement `.next/*` gitignoré)

## 3. Commandes
- Installer les dépendances : `npm install`
- Lancer en dev (+ port) : `npm run dev` → `next dev` sur port 3000 (défaut)
- Lancer les tests : INCONNU (aucun framework de test configuré, aucun fichier `*.test.*` ni `*.spec.*`)
- Lint / format / typecheck : `npm run lint` (`next lint`), typecheck via `npx tsc --noEmit` (pas de script dédié)
- Build : `npm run build` (`next build`)
- Migrations de base : `npx prisma migrate deploy` (Prisma auto) + application manuelle des `prisma/migrations/manual/*.sql` via `psql -f`

## 4. Configuration
- Noms des variables d'environnement requises (NOMS SEULS) :
  - Auth/session : `JWT_SECRET`, `NEXTAUTH_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (seed)
  - DB : `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `PGSSL`
  - API keys : `ADMIN_API_KEY`, `BOT_API_KEY`, `APPOINTMENT_API_KEY`
  - HMAC : `APPOINTMENT_HMAC_SECRET`
  - Mail Brevo (utilisé) : `BREVO_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`, `SUPPORT_ADMIN_EMAIL`
  - Mail SMTP (legacy) : `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SUPPORT_EMAIL`
  - URLs publiques : `DASHBOARD_PUBLIC_URL`, `PUBLIC_APP_URL`, `RDV_SHORT_URL_BASE`, `DEPOT_ORDONNANCES_URL_BASE`
  - Azure Blob : `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONNECTION_STRING_NEURACORP_EXAMS`, `NEURACORP_EXAMS_CONTAINER`, `NEURACORP_EXAMS_BLOB`
  - Antivirus : `CLAMD_SOCKET` (défaut `/var/run/clamav/clamd.ctl`)
  - Stockage local : `PRESCRIPTIONS_STORAGE_DIR`
  - Public front : `NEXT_PUBLIC_DEMO_ANCHOR_ISO`
  - Node : `NODE_ENV`
- Fichier(s) de config et leur emplacement :
  - `.env` (racine) — non commité (dans `.gitignore`)
  - `.env.example` (racine) — incomplet (voir zones floues)
  - `next.config.js` — CSP + headers sécurité
  - `tsconfig.json` — alias `@/* → src/*`
  - `.eslintrc.json`
  - `prisma/schema.prisma`
  - `docker-compose.yml`, `dockerfile`, `entrypoint.sh`, `wait-for-it.sh`
- Existe-t-il un .env.example ? : oui — mais **il ne liste que 15 vars** alors que le code en attend au moins 26. Vars manquantes de `.env.example` : `BREVO_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`, `SUPPORT_ADMIN_EMAIL`, `APPOINTMENT_API_KEY`, `APPOINTMENT_HMAC_SECRET`, `RDV_SHORT_URL_BASE`, `PUBLIC_APP_URL`, `DEPOT_ORDONNANCES_URL_BASE`, `DASHBOARD_PUBLIC_URL`, `PGSSL`, `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONNECTION_STRING_NEURACORP_EXAMS`, `NEURACORP_EXAMS_CONTAINER`, `NEURACORP_EXAMS_BLOB`, `CLAMD_SOCKET`, `PRESCRIPTIONS_STORAGE_DIR`, `NEXT_PUBLIC_DEMO_ANCHOR_ISO`.

## 5. Interfaces EXPOSÉES (ce que les autres briques peuvent appeler)

### Endpoints HTTP (méthode + chemin + rôle en 5 mots)
**Auth (NextAuth)**
- `ALL /api/auth/[...nextauth]` — signin/callback/session NextAuth

**Comptes / users**
- `GET/POST /api/admin/users` — liste + création admin/sous-compte (SUPER_ADMIN)
- `GET/PATCH/DELETE /api/admin/users/[id]` — CRUD compte (SUPER_ADMIN)
- `POST /api/admin/users/[id]/kick` — bump tokenVersion (SUPER_ADMIN)
- `GET /api/admin/clients` — liste clients (ADMIN+)
- `DELETE /api/admin/clients/[id]` — suppression client (ADMIN+)
- `POST /api/admin/create-client` — création CLIENT (SUPER_ADMIN)
- `POST /api/admin/reset-password` — reset mdp (ADMIN → CLIENT ; SUPER_ADMIN → ADMIN)
- `POST /api/client/change-password` — self change (interdit pour SUPER_ADMIN)
- `GET /api/client` — profil client (ownership + impersonation ADMIN_USER)
- `GET /api/users/[userId]` — profil user (assertUserAccess)
- `GET /api/users/[userId]/products` — produits (hérite du parent pour sous-compte)
- `GET /api/admin/centres` — liste centres LyraeTalk (ADMIN+)

**Tickets**
- `GET/POST /api/tickets` — liste / créer ticket
- `GET /api/tickets/[id]` — détail
- `POST /api/tickets/[id]/messages` — reply chat
- `POST /api/tickets/[id]/status` — transition status (ADMIN+)
- `GET /api/admin/tickets` — vue admin globale

**Notifications**
- `GET /api/notification/get-unread` — non lues
- `POST /api/notification/mark-read` — marquer lue
- `POST /api/notification/mark-all-read` — marquer toutes lues

**Talk config / bot Lyrae** (auth : session OU header `x-api-key: BOT_API_KEY`)
- `GET/POST /api/configuration` — config globale d'un centre
- `GET /api/configuration/get/mapping` — mapping exam
- `GET /api/configuration/get/mapping/getLibelle` — libelles
- `GET /api/configuration/get/is_open` — horaires ouverture
- `POST /api/configuration/mapping` — save mapping (session)
- `POST /api/configuration/mapping/double_exam` — double exam (session)
- `POST /api/configuration/mapping/type_exam` — type exam (session)
- `POST /api/configuration/exam` — save exams (session)
- `POST /api/configuration/informationnel` — save info (session)
- `POST /api/configuration/informationnel/horaires` — save horaires (session)
- `POST /api/configuration/recognize-number` — toggle reco appelant (session)
- `POST /api/talk-settings` — reconnaissance (session)
- `POST /api/calls/summary` — bot Lyrae pousse résumé d'appel (BOT_API_KEY only)
- `GET /api/calls` / `POST /api/calls/test` — liste + test
- `PATCH /api/calls/[id]/flag` — flagger appel (session)
- `PATCH /api/calls/[id]/treated` — marquer traité (session)

**RDV / SMS confirmation** (auth : header `x-api-key: APPOINTMENT_API_KEY` sauf public tokens)
- `POST /api/rdv/init` — AI2Xplore crée un RDV en attente + reçoit URL SMS
- `POST /api/rdv/ack` — AI2Xplore ACK un événement patient
- `GET /api/rdv/pending-events` — AI2Xplore récupère les réponses patient
- `POST /api/rdv/reminder-sent` — AI2Xplore signale envoi rappel SMS
- `GET /api/rdv/stats` — stats no-show (session OU API key)
- `GET /api/rdv/[token]` — GET infos RDV pour patient (public, protégé par token)
- `POST /api/rdv/[token]/respond` — patient répond (public, token)
- `POST /api/rdv/dev-seed` — dev only
- `GET/POST /api/sms-confirmation-config` — config SMS (auth mixte)

**Ordonnances / prescriptions** (auth : header `x-api-key: APPOINTMENT_API_KEY` sauf public tokens et session admin)
- `POST /api/prescriptions/init` — AI2Xplore crée une demande d'ordonnance
- `GET /api/prescriptions/pending` — AI2Xplore récupère les uploadées à traiter
- `GET /api/prescriptions/download/[id]` — AI2Xplore récupère le PDF
- `POST /api/prescriptions/ack/[id]` — AI2Xplore ACK récupération
- `GET/POST /api/prescriptions/config` — config par centre (auth mixte)
- `GET /api/prescriptions/[token]/status` — patient (public, token)
- `POST /api/prescriptions/[token]/upload` — patient upload (public, token, ClamAV scan)
- `GET /api/prescriptions/alerts` — alertes secrétaire (session)
- `GET /api/prescriptions/alerts/count` — count (session)
- `POST /api/prescriptions/alerts/[id]/resolve` — résoudre alerte (session)

**External center mapping**
- `GET/POST/DELETE /api/external-center-mapping` — mapping codes centres AI2Xplore → UserProduct (ADMIN)

**Numéros téléphone**
- `GET/POST /api/admin/number/[userId]` — CRUD numéros
- `DELETE /api/admin/number/[userId]/[numberId]`

**Fichiers**
- `GET /api/files/get-files`, `POST /api/files/uploads`, `POST /api/files/validation`

**Stats / analytics**
- `GET /api/admin/overview` — overview admin
- `GET /api/admin/analytics-internal` — analytics interne
- `GET /api/admin/update-metrics-explain` — cron metrics (header `x-api-key: ADMIN_API_KEY`)
- `GET /api/exam-non-pris/aggregate`
- `GET /api/planning-complet/aggregate`

**Products**
- `GET /api/products` — liste (session)
- `GET /api/public/products` — public

**Data**
- `GET /api/data/exams` — récupère blob Azure examens Neuracorp

### Déclencheurs (cron/timer, queue, blob, webhook)
- Aucun cron interne au processus. Crons externes appelés via bash (voir `scripts/db-maintenance/*.sh`, exécutés par `crond` système).
- Aucune queue message (pas de Redis, RabbitMQ, ni Kafka).
- Aucun webhook entrant configuré côté ce repo.
- Socket.io : sur `/api/socket` (initialisation via GET), émet des events `ticket-updated`, `call-flagged` vers les clients connectés.

### CLI / scripts appelables
- `node scripts/create-super-admin.js` — bootstrap premier SUPER_ADMIN interactif
- `npm run seed`, `npm run seed-data`, `npm run seed-calls`, `npm run seed-demo-calls` — seeds Prisma (via ts-node)
- `bash scripts/db-maintenance/purge_login_attempts.sh` — purge 30j `LoginAttempt`
- `bash scripts/db-maintenance/purge_prescription_access_log.sh` — purge 90j `PrescriptionAccessLog`
- `bash scripts/db-maintenance/purge_prescriptions.sh` — purge fichiers ordonnances
- `bash scripts/db-maintenance/purge_appointment_confirmations.sh` — purge confirmations RDV
- `bash scripts/db-maintenance/prescription_alerts.sh` — alertes ordonnances

### Événements ou messages émis (destination + forme du payload)
- **stdout (JSON structuré `audit=true`)** — écrit dans `/root/.pm2/logs/dashboard-out.log`, scrappé par Alloy Docker container (bind mount `/pm2-logs-root/`), poussé vers Loki interne (`http://loki:3100/loki/api/v1/push`, container `grafana-loki`). Label appliqué : `service_name="dashboard"` (**pas** `service="dashboard"` — piège dans les requêtes LogQL). Format : `{ audit, category, action, timestamp, success, actorId, actorEmail, actorRole, actorIp, actorUserAgent, targetType, targetId, targetLabel, errorReason, ...metadata }`. Cf. `src/lib/auditLog.ts` et `scripts/audit-log-queries.md` (**ATTENTION** : le fichier de doc utilise `service="dashboard"` — obsolète, à corriger).
- **Socket.io events** vers les clients connectés :
  - `ticket-updated` : `{ ticketId, kind: "created" | "status" | ... }` (émis par POST tickets, POST messages, POST status)
  - `call-flagged` : `{ callId, flagged }` (émis par PATCH `/api/calls/[id]/flag`)
- **Brevo API** (mails sortants) : `notifyNewTicketToAdmin` (destinataire `SUPPORT_ADMIN_EMAIL`), `notifyTicketClosedToClient` (destinataire `Ticket.contactEmail` ou `User.email`).
- **Notifications in-app** (`Notification` DB) : insérées lors de création ticket + transitions status.

### Mécanisme d'authentification attendu
- **Session cookie NextAuth v4** (JWT stateless signé par `JWT_SECRET`, `maxAge=24h`, `updateAge=1h`, rehydratation Prisma à chaque refresh) pour tous les endpoints humains.
- **Header `x-api-key`** pour M2M :
  - `BOT_API_KEY` : bot LyraeTalk (calls/summary, configuration/get/*, configuration)
  - `APPOINTMENT_API_KEY` : AI2Xplore (rdv/*, prescriptions/init, pending, download, ack)
  - `ADMIN_API_KEY` : cron metrics Explain
- **Tokens patient** (short code 8 chars + verification code hash bcrypt) pour les endpoints RDV/prescriptions publics (`/api/rdv/[token]/*`, `/api/prescriptions/[token]/*`).

## 6. Interfaces CONSOMMÉES (ce que ce repo appelle à l'extérieur)

### Appels HTTP sortants
- `https://api.brevo.com/v3/smtp/email` — envoi mails transactionnels. Code : `src/lib/brevoMailer.ts:25` (URL codée en dur), auth via `BREVO_API_KEY` env.
- Frontend `fetch("/api/*")` : appels internes uniquement (URL relative, pas d'appel HTTP sortant depuis le browser sauf CDN interne).

### Queues / topics lus
- Aucun. Pas de consommateur de queue dans ce repo.

### Services tiers / SDK externes
- `@azure/storage-blob` (Azure Blob Storage) : lecture container `NEURACORP_EXAMS_CONTAINER` blob `NEURACORP_EXAMS_BLOB` — utilisé par `/api/data/exams`, `/api/configuration/get/mapping`, `/api/configuration/exam`. Auth via `AZURE_STORAGE_CONNECTION_STRING` env.
- `bcryptjs` — hash mdp (10 rounds)
- `nodemailer` (legacy SMTP) — encore importé par `src/utils/mailer.ts`, utilisé UNIQUEMENT par `src/app/api/files/validation/route.ts`
- `jspdf` + `jspdf-autotable` — export PDF rapports
- `xlsx`, `papaparse` — parsing CSV/XLSX (exams Neuracorp, uploads clients)
- `socket.io` — websocket temps réel
- `clamd` (via socket Unix `CLAMD_SOCKET`) — antivirus scan des uploads d'ordonnances (`src/lib/clamavScan.ts:22`)

### Fichiers ou blobs lus
- Local disk : `PRESCRIPTIONS_STORAGE_DIR` (chemin depuis env, à confirmer défaut) — stockage des PDF d'ordonnances patients.
- Local disk : `public/upload/talkInfo-*.csv`, `public/upload/talkLibeles-*.csv` — templates + fichiers par client, générés par create-client.
- Azure Blob : cf. ci-dessus.

### Codées en dur vs variables d'env
- `https://api.brevo.com/v3/smtp/email` : **CODÉE EN DUR** (`src/lib/brevoMailer.ts:25`)
- URLs de sous-domaines dans le middleware : **CODÉES EN DUR** (`rdv.neuracorp.ai`, `depot-ordonnances.neuracorp.ai`)
- URL dashboard fallback : **hybride** — `process.env.DASHBOARD_PUBLIC_URL ?? "https://dashboard.neuracorp.ai"` (`src/lib/ticketNotifications.ts:20`)
- Toutes les URLs Azure/DB/SMTP : via env
- Talk product name `"LyraeTalk"` : **CODÉE EN DUR** en 40+ endroits (voir invariants)

## 7. Bases de données

### PostgreSQL (unique base)
- Nom de la base + host (sans credentials) : lit `DATABASE_URL` (forme `postgresql://<user>:REDACTED@<host>:<port>/<db>`). Aucun host codé en dur en dehors de docker-compose (`db:5432`).
- Driver / ORM utilisé : **Prisma 6.3.1** (source de vérité, `src/lib/prisma.ts`) **ET** `pg 8.21.0` en direct (Pool, `src/lib/db.ts`) — les 2 coexistent, utilisés selon les endpoints.
- Ce repo est-il PROPRIÉTAIRE (écrit + migre) ou simple LECTEUR ? : **PROPRIÉTAIRE** (écrit + migre + définit le schéma).
- Système de migrations + emplacement des fichiers :
  - Prisma migrations auto : `prisma/migrations/YYYYMMDDHHMMSS_*/migration.sql` (6 dossiers, dernier `20250930095026_add_call_metrics_and_intent_code`)
  - Manuel : `prisma/migrations/manual/*.sql` (10 fichiers, dernier `2026_08_03_add_super_admin_permissions.sql`) — jouées à la main via `psql -f`
  - `prisma/migrations/migration_lock.toml` : `provider = "postgresql"`
- Tables principales, avec une ligne de description chacune :
  - `User` — comptes (SUPER_ADMIN, ADMIN, CLIENT + sous-comptes via `managerId` + `permissions` JSONB + `tokenVersion` + `isSecretary` legacy)
  - `Product` — catalogue produits (LyraeTalk, LyraeExplain)
  - `UserProduct` — assignation user↔produit (identifiant "centre" côté UI)
  - `UserNumber` — numéros de téléphone assignés à un user
  - `LyraeExplainDetails` — détails Explain par UserProduct (metrics JSON)
  - `LyraeTalkDetails` — détails Talk par UserProduct (flags validation)
  - `FileSubmission` — historique uploads fichiers (CSV clients)
  - `Ticket` — tickets support (client, createur, assigné, userProduct, status enum)
  - `TicketMessage` — messages du fil de discussion ticket
  - `Notification` — notifications in-app (ticket + user)
  - `Call` — appels bruts (call/caller/durée/intent/steps JSON)
  - `TalkSettings` — configuration bot par UserProduct (voice, exams, mapping JSON)
  - `ReceivedCalls` — appels reçus par centre
  - `TalkInformationSettings` — module informationnel + weeklyHours JSON
  - `ExamMapping` — mapping codes exam → libellés FR (per UserProduct)
  - `CallConversation` — conversations complètes (steps + stats JSON) — écrite par bot via `/api/calls/summary`
  - `LoginAttempt` — historique tentatives login (IP, email, success) pour rate-limit + audit
- Tables SQL manuelles (hors modèles Prisma, définies via `prisma/migrations/manual/*.sql`) :
  - `AppointmentConfirmation` — confirmations SMS RDV (short code, verification code, status)
  - `ReminderSent`, `ReminderStats` — historique rappels + stats no-show
  - `ExternalCenterMapping` — mapping codes centres AI2Xplore ↔ UserProduct
  - `SmsConfirmationConfig` — config SMS confirmation par centre
  - `PrescriptionConfig` — config ordonnances par centre
  - `PrescriptionUpload` — uploads patient (chemin fichier, status, ackedAt)
  - `PrescriptionAccessLog` — audit accès ordonnances (actorType, actorIp, action, errorReason)
  - `PrescriptionStats` — agrégats stats ordonnances
- Existe-t-il un dump de schéma commité ? où ? : `prisma/schema.prisma` (347 lignes, 17 modèles) sert de source Prisma. **Les tables SQL manuelles ne sont pas dans le schéma Prisma** — elles vivent dans `prisma/migrations/manual/*.sql`. `sql/delete.sql` contient un `TRUNCATE` (à confirmer, non lu ligne à ligne).

## 8. Spécifications déjà présentes
- Spec OpenAPI/Swagger générée ou commitée ? chemin : **AUCUNE**
- JSON Schemas / types partagés ? chemin : validations Zod inline dans chaque endpoint (`src/app/api/**/route.ts`), pas de package types partagé avec les autres briques Lyrae
- Diagrammes ou docs d'archi ? chemin : `scripts/audit-log-queries.md` (queries LogQL) — c'est la seule doc technique markdown à jour dans le repo. Le `README.md` est daté (parle uniquement de Docker Compose, ne mentionne pas Brevo, ClamAV, sous-domaines patient, chantier 3 comptes/permissions).

## 9. Couplages avec les autres briques

### LyraeTalk (bot vocal)
- Consomme le dashboard via header `x-api-key: BOT_API_KEY` :
  - `POST /api/calls/summary` (`src/app/api/calls/summary/route.ts:15`) — pousse le résumé d'un appel (steps + stats) → écrit `CallConversation`
  - `GET /api/configuration` (`src/app/api/configuration/route.ts:22`) — récupère la config complète du centre
  - `GET /api/configuration/get/mapping` (`src/app/api/configuration/get/mapping/route.ts:37`)
  - `GET /api/configuration/get/mapping/getLibelle` (`src/app/api/configuration/get/mapping/getLibelle/route.ts:7`)
  - `GET /api/configuration/get/is_open` (`src/app/api/configuration/get/is_open/route.ts:14`)
  - `GET /api/sms-confirmation-config?externalCenterCode=XYZ` (auth mixte, mode public si externalCenterCode fourni)
- Whitelist patterns dans middleware : `src/middleware.ts:13-33`
- Envoyait auparavant `POST /api/heartbeat/*` — la route est encore whitelist middleware (`src/middleware.ts:21`) mais **l'endpoint côté serveur a été supprimé au chantier 1** (grep confirme aucun `route.ts` sous `src/app/api/heartbeat/`). Le bot doit être mis à jour pour arrêter d'appeler.

### AI2Xplore (API interne RIS/PACS)
- Consomme le dashboard via header `x-api-key: APPOINTMENT_API_KEY` :
  - `POST /api/rdv/init` — création RDV pendant (`src/app/api/rdv/init/route.ts:38`)
  - `POST /api/rdv/ack` (`src/app/api/rdv/ack/route.ts:13`)
  - `GET /api/rdv/pending-events` (`src/app/api/rdv/pending-events/route.ts:38`)
  - `POST /api/rdv/reminder-sent` (`src/app/api/rdv/reminder-sent/route.ts:30`)
  - `POST /api/prescriptions/init` (`src/app/api/prescriptions/init/route.ts:108`)
  - `GET /api/prescriptions/pending` — commentaire code : "meme VM AI2Xplore multi-tenant" (`src/app/api/prescriptions/pending/route.ts:13`)
  - `GET /api/prescriptions/download/[id]` — commentaire : "sert le PDF a AI2Xplore" (`src/app/api/prescriptions/download/[id]/route.ts:11`)
  - `POST /api/prescriptions/ack/[id]` — commentaire : "appele par AI2Xplore" (`src/app/api/prescriptions/ack/[id]/route.ts:8`)
- Format d'échange : centres identifiés par `externalCenterCode` string (table `ExternalCenterMapping.externalCenterCode`), match vers `UserProduct.id`. Rupture unilatérale du côté dashboard = casse AI2Xplore silencieusement.

### Dashboard
- Le dashboard = ce repo (auto-référence).

### Azure Functions / detections
- Aucune mention explicite trouvée par grep sur `azure functions`, `detection`, `func`. **INCONNU** — soit la brique n'est pas encore couplée à ce repo, soit elle est nommée différemment (`AZURE_STORAGE_CONNECTION_STRING_NEURACORP_EXAMS` référence uniquement du blob storage lecture-seule des libellés exam, pas de function).

### Daily Report
- Aucune mention explicite trouvée par grep sur `daily`, `report`, `lyrae daily`. **INCONNU** — pas de trace d'un job quotidien qui appelle ce repo ou que ce repo appelle. Les scripts `db-maintenance/*.sh` sont des purges internes, pas un rapport quotidien.

### URLs / hostnames codées en dur (hors briques)
- `https://dashboard.neuracorp.ai` (fallback `DASHBOARD_PUBLIC_URL`) — `src/lib/ticketNotifications.ts:20`
- `rdv.neuracorp.ai` — `src/middleware.ts:47` (host isolation SMS patient RDV)
- `depot-ordonnances.neuracorp.ai` — `src/middleware.ts:74` (host isolation dépôt ordonnance)
- `https://neuracorp.ai` — page d'accueil client (`src/app/client/page.tsx`) et signin (`src/app/authentication/signin/page.tsx`) — fallback si `getProductRoute` ne match pas
- `https://tabler-icons.io` — CSP frame-src (démo icônes)
- `https://api.brevo.com` — mailer

## 10. Code potentiellement dupliqué ailleurs

### Duplications internes au repo (à unifier avant même de penser à un package partagé)
- **2 clients Prisma coexistent** :
  - `src/lib/prisma.ts` — canonique, `log: ['error']`
  - `src/utils/prisma.ts` — legacy, `log: ["query","info","warn","error"]`
  - Certains fichiers importent l'un, d'autres l'autre (ex: `src/app/api/tickets/route.ts` importe `@/utils/prisma`)
- **2 mailers coexistent** :
  - `src/lib/brevoMailer.ts` — HTTPS Brevo, utilisé par les tickets
  - `src/utils/mailer.ts` — nodemailer SMTP legacy, utilisé UNIQUEMENT par `src/app/api/files/validation/route.ts`

### Candidats à extraction dans une brique partagée Lyrae
- Enum / types de contrat M2M :
  - Payload `POST /api/rdv/init` (rdvId, phone, firstname, lastname, birthdate, externalCenterCode, examType) — dupliqué côté AI2Xplore
  - Payload `POST /api/prescriptions/init`
  - Payload `POST /api/calls/summary` (userProductId, centerId, steps, stats) — dupliqué côté LyraeTalk
  - Payload event patient (`rdv/pending-events`, `prescriptions/pending`)
- Constantes exam types : `["scanner", "irm", "mammo", "radiographie", "echographie"]` — présent dans `src/lib/smsConfirmationConfig.ts` (`EXAM_TYPE_KEYS`) et `src/lib/prescriptionConfig.ts`. Probablement dupliqué dans AI2Xplore.
- Password schema `src/lib/passwordSchema.ts` — logique de policy dupliquée dans `scripts/create-super-admin.js` (fonction `validatePasswordPolicy` locale) car pas d'import TS depuis un script JS.
- `PAGES` / `PAGE_LABELS` / `PermissionsMap` (`src/lib/permissions.ts`) — pertinent uniquement pour ce repo, sauf si d'autres briques doivent afficher le même mapping.
- `Product.name === "LyraeTalk"` — chaîne magique répétée 40+ fois dans src, devrait être un enum partagé avec le seed et probablement d'autres briques.

## 11. Déploiement
- Comment ce repo arrive en prod : **VPS OVH mono-machine (`vps-6fbed353`)**, code dans `/var/www/Dashboard_pre-prod`, déploiement manuel `git pull` + `npm run build` + restart PM2. **Aucun fichier de déploiement prod dans le repo lui-même** (pas de `ecosystem.config.js`, pas de systemd unit, pas de terraform, pas d'ansible).
- **Topologie prod complète (mesurée en live 2026-08-04)** :
  ```
  Client HTTPS
    → nginx :443 (host, master pid 1226)
    → /etc/nginx/sites-available/dashboard.neuracorp.ai
    → proxy_pass http://localhost:3000
    → next-server (v14.2.35) écoute *:3000
    → parent : sh -c "next start" → npm start → PM2 God Daemon ROOT (/root/.pm2)
    → cwd = /var/www/Dashboard_pre-prod
  ```
  Le process Dashboard est **géré par le PM2 root** (nom : `dashboard`, mode fork). Pour le piloter, il FAUT préserver le HOME : `sudo -H pm2 <cmd>` ou `sudo HOME=/root pm2 <cmd>`. Un `sudo pm2 list` classique perd le HOME de sudo et affiche la liste vide ou l'AI2Xplore sandbox — piège fréquent.
- **La même VM héberge aussi** :
  - **AI2Xplore sandbox** sous PM2 **ubuntu** (`node /var/www/AI2Xplore/index.js`, écoute `:8080`). C'est PAS l'AI2Xplore prod qui poll le Dashboard depuis IP externe.
  - **Docker containers Grafana stack** : `grafana-alloy` (v1.4.2), `grafana-loki` (3.2.0), `grafana-prometheus` (v2.55.0), `grafana-postgres-exporter`, `grafana-ui` (11.3.0)
  - **Docker containers demo** : `konnect-web`, `konnect-demo-*` (projet séparé)
  - **PostgreSQL 15** direct host (utilisé par le Dashboard via `DATABASE_URL`)
- **Domaines nginx sur cette VM** (tous → localhost:3000 sauf mention) :
  - `dashboard.neuracorp.ai` → `:3000` (Dashboard)
  - `rdv.neuracorp.ai` → `:3000` (Dashboard, même app, isolation via middleware host)
  - `depot-ordonnances.neuracorp.ai` → `:3000` (idem)
  - `grafana.neuracorp.ai` → `:3003` (container `grafana-ui`)
  - `otlp.neuracorp.ai` → `:4318` (container `grafana-alloy`, réception OTLP HTTPS depuis LyraeTalk / AI2Xplore prod)
  - `apidoc.neuracorp.ai` → `:8080` (probablement AI2Xplore sandbox)
  - `clinique-lumiere.neuracorp.ai` → `:8096` (container `konnect-demo-clinic-1`)
- Fichiers de déploiement / IaC / Dockerfile dans le repo :
  - `dockerfile` — image Node 18-alpine (**non utilisée en prod** — la prod tourne en npm start direct sous PM2, pas dans un container)
  - `docker-compose.yml` — DB Postgres 13 + service web (**dev/local uniquement**)
  - `entrypoint.sh`, `wait-for-it.sh` — helpers Docker (dev)
- CI/CD existante : **AUCUNE** (pas de `.github/`, pas de `.gitlab-ci.yml`, pas de webhook Docker Hub visible).
- **Pipeline logs prod** (mesuré 2026-08-04) :
  ```
  console.log(...)         du code Dashboard
    → PM2 root capture stdout
    → écrit dans /root/.pm2/logs/dashboard-out.log (rotation via module pm2-logrotate)
    → grafana-alloy container bind-mount /pm2-logs-root/ → lit ce fichier
    → alloy pipeline loki.source.file "pm2"
    → loki.write "default" → http://loki:3100/loki/api/v1/push (container grafana-loki)
    → visible dans grafana-ui (grafana.neuracorp.ai) avec label service_name="dashboard"
  ```
  **Piège** : le repo contient aussi `/home/ubuntu/.pm2/logs/dashboard-*.log` — c'est un **fichier zombie** d'un ancien PM2 ubuntu qui a été supprimé (contient encore de vieux `[heartbeat] auth check`). Alloy ne le scrape PAS (config `local.file_match` cible `/pm2-logs-root/` uniquement). À nettoyer par `sudo truncate -s 0 /home/ubuntu/.pm2/logs/dashboard-*.log` pour éviter les futures confusions.
- **Fichier de config Alloy actif** : `/var/www/grafana/alloy/config.alloy` (le service tourne dans le container `grafana-alloy` avec ce fichier bind-mounté). Contient : receiver OTLP (`otelcol.receiver.otlp` sur `:4318`), pipeline logs + metrics, `local.file_match "pm2_dashboard"` pour scrape des logs, `prometheus.scrape` pour node_exporter + postgres-exporter, sondes `blackbox` pour uptime dashboard/rdv/grafana/otlp.

## 12. Tests et qualité
- Framework de test : **AUCUN** (pas de jest, vitest, playwright, cypress dans `package.json` ni dans le repo)
- Y a-t-il des tests ? couverture approximative des zones critiques : **Aucun test unitaire, aucun test d'intégration, aucun test e2e.** Zéro couverture.
- Hooks pre-commit : **AUCUN** (pas de husky, lint-staged, ni `.pre-commit-config.yaml`)
- Lint : ESLint 8.46.0 configuré via `eslint-config-next 13.4.12` + `.eslintrc.json` (fichier lu : 41 octets, config minimale)

## 13. Setup Claude existant
- Y a-t-il un CLAUDE.md ? Résume son contenu en 3 lignes et donne sa taille. : **NON**, aucun CLAUDE.md à la racine ni dans les sous-dossiers du repo (uniquement `node_modules/nodemailer/CLAUDE.md`, non pertinent).
- Y a-t-il un dossier .claude/ (settings, skills, rules, commands) ? Détaille. : **NON**, aucun `.claude/` dans ce repo.
- Y a-t-il un .mcp.json ? : **NON**

## 14. Zones floues

### Parties du code non complètement comprises
- **`src/app/api/data/exams/route.ts`** : lit un blob Azure "examens Neuracorp" avec des vars env dédiées (`AZURE_STORAGE_CONNECTION_STRING_NEURACORP_EXAMS`) distinctes du blob principal. À confirmer si c'est un catalogue interne Neuracorp partagé entre plusieurs briques.
- **`src/app/api/admin/update-metrics-explain/route.ts`** : cron qui met à jour `LyraeExplainDetails.metricsByMonth`. Appelé par qui ? À CONFIRMER (le produit LyraeExplain est mentionné "archivé" dans les commentaires de `src/app/client/page.tsx`).
- **Table `Call` vs `CallConversation`** : deux tables coexistent, écrites par des chemins différents (`Call` par `/api/calls` et `/api/calls/test`, `CallConversation` par `/api/calls/summary` du bot). À confirmer si c'est intentionnel ou une dette.
- **`src/utils/mailer.ts` (nodemailer)** : encore importé par `files/validation/route.ts` alors que `brevoMailer.ts` est la voie moderne. À confirmer si `files/validation` est encore utilisé en prod ou dead code.

### Incohérences repérées
- **README obsolète** : décrit uniquement le workflow Docker Compose, ne mentionne pas Brevo, ClamAV, sous-domaines patient (rdv, depot-ordonnances), gestion multi-comptes (SUPER_ADMIN + sous-comptes), audit Loki, PM2. Il faut le considérer comme désuet — se fier au code.
- **`.env.example` incomplet** : 19 variables env requises par le code sont absentes du fichier `.env.example` (cf. section 4).
- **Middleware whitelist `/api/heartbeat/*` sans endpoint correspondant** : `src/middleware.ts:21` autorise `POST /api/heartbeat/*` mais `src/app/api/heartbeat/` n'existe pas (supprimé au chantier 1 monitoring). Les appels LyraeTalk arrivent, sont autorisés par le middleware, puis retournent 404. Pattern à retirer du middleware une fois le bot mis à jour.
- **`scripts/audit-log-queries.md` obsolète** : toutes les requêtes utilisent le label `service="dashboard"` alors que le vrai label émis par Alloy est `service_name="dashboard"`. Les queries qui y figurent ne retournent rien tant qu'on ne remplace pas `service` par `service_name`.
- **Seed obsolète (`scripts/seed-admin.ts` en commentaire complet ?)** : mentionné dans les audits précédents comme "commenté". Non vérifié en profondeur.
- **`Product.name` en dur ("LyraeTalk", "LyraeExplain")** : 40+ occurrences en code, aucun enum central. Rename = grep global.
- **`SPECIAL_CENTRE_PAIRS` hardcodé dans `src/lib/auth-helpers.ts:32`** : `{7:[8], 8:[7], 12:[13], 13:[12]}` — legacy multi-centres, commentaire indique "À terme, cette config devrait être représentée en DB". Documenté comme dette.
- **`scripts/seed-admin.ts` en racine + `prisma/seed_admin.ts`** : 2 fichiers seed admin distincts, à confirmer lequel est actif.
- **Fichier zombie `/home/ubuntu/.pm2/logs/dashboard-out.log` (187 KB, uniquement `[heartbeat] auth check` historiques)** : reliquat d'un ancien PM2 ubuntu qui gérait le Dashboard avant migration vers PM2 root. Ne reçoit plus rien, Alloy ne le scrape pas. À tronquer par hygiène : `sudo truncate -s 0 /home/ubuntu/.pm2/logs/dashboard-*.log`.

### Questions à poser au propriétaire
1. Où est le runbook de déploiement prod (VPS OVH, PM2, systemd) ? Le repo ne le contient pas.
2. Quel `.env` sert de référence prod ? La comparaison entre `.env.example` et le code montre 19 vars manquantes.
3. Le produit LyraeExplain est-il encore actif (endpoint `update-metrics-explain` + code Explain préservé) ou peut-on retirer le code mort ?
4. La table `Call` (Prisma) vs `CallConversation` (Prisma) : garde-t-on les 2 ou consolidation prévue ?
5. Faut-il extraire les payloads M2M (`/api/rdv/init`, `/api/prescriptions/init`, `/api/calls/summary`) dans un package types partagé avec LyraeTalk / AI2Xplore ?
6. Le mailer nodemailer legacy (`src/utils/mailer.ts` + endpoint `files/validation`) est-il encore utilisé, ou peut-on le supprimer au profit de Brevo ?
7. Y a-t-il une brique "Azure Functions détections" ou "Daily Report" qui interagit avec ce dashboard aujourd'hui ? Aucune référence trouvée dans le code.

## 15. Invariants fragiles

Ce qui casserait un consommateur externe (LyraeTalk, AI2Xplore, secrétaires, patients, cron) si modifié sans coordination :

### Contrat M2M (headers + body)
- **`x-api-key`** comme nom de header pour BOT_API_KEY / APPOINTMENT_API_KEY / ADMIN_API_KEY. Renommer casse LyraeTalk et AI2Xplore.
- **Payload `POST /api/rdv/init`** — clés `rdvId`, `phone`, `firstname`, `lastname`, `birthdate` (format `YYYY-MM-DD` ou `DD/MM/YYYY`), `appointmentDate` (ISO), `externalCenterCode`, `examType` (enum `scanner|irm|mammo|radiographie|echographie`). Renommer une clé ou changer un format = AI2Xplore casse silencieusement.
- **Payload `POST /api/prescriptions/init`** — équivalent, à AI2Xplore.
- **Payload `POST /api/calls/summary`** — clés `userProductId`, `centerId`, `steps` (array de strings, LyraeTalk-first ordering), `stats` (JSON libre). Ordre des `steps` : index 0 = "Lyrae", index 1 = "User", alternance stricte (`src/app/api/calls/summary/route.ts:30`).
- **`GET /api/prescriptions/pending`** : shape de la réponse `{ pending: [...], total: N }` — AI2Xplore parse ce format.

### Base de données
- **Nom de colonnes / tables PostgreSQL en camelCase avec quoted identifiers** — sensible à la casse. Rename `User.tokenVersion` → `token_version` = tout le code casse.
- **`Product.name === "LyraeTalk"`** — chaîne magique. Renommer le product name = 40+ endroits à mettre à jour côté ce repo, + potentiellement les autres briques.
- **`Role` enum** = `SUPER_ADMIN | ADMIN | CLIENT` — ordre modifié via `BEFORE 'ADMIN'` dans la migration manuelle. Toute nouvelle valeur doit être ajoutée via `ALTER TYPE ADD VALUE` (pas dans une transaction Prisma migrate).
- **`CentreRole` enum** = `ADMIN_USER | USER` — utilisé pour le pattern DG multi-centres, ne pas confondre avec `Role`.
- **`TicketStatus` enum** = `PENDING | IN_PROGRESS | RESOLVED | CLOSED` — `RESOLVED` inséré `BEFORE CLOSED` par migration manuelle. Bot LyraeTalk et front UI dépendent de ces exact strings.
- **`ExternalCenterMapping.externalCenterCode`** = clé de jointure entre codes AI2Xplore et `UserProduct.id`. Rupture = AI2Xplore ne peut plus router.
- **`AppointmentConfirmation.shortCode`** (unique, 8 chars, alphabet URL-safe) : format d'URL `rdv.neuracorp.ai/c/{shortCode}` reçu par SMS patient. Changer la longueur/alphabet casse tous les liens SMS déjà envoyés.
- **`PrescriptionUpload.token`** (idem) : format `depot-ordonnances.neuracorp.ai/d/{shortCode}`.

### Hosts et sous-domaines
- **`rdv.neuracorp.ai`** et **`depot-ordonnances.neuracorp.ai`** : hosts sur lesquels le middleware whitelist ne laisse passer que quelques paths. Ces sous-domaines doivent pointer vers le même conteneur Next que `dashboard.neuracorp.ai` sinon les liens SMS renvoient 404.
- Les URLs générées pour les SMS patient utilisent soit `RDV_SHORT_URL_BASE`/`DEPOT_ORDONNANCES_URL_BASE` (si set), soit fallback `PUBLIC_APP_URL`. Changer une de ces variables sans redémarrer casse les nouveaux SMS.

### Auth / sessions
- **`JWT_SECRET`** : changer cette valeur invalide **tous** les JWT actifs (déconnecte tout le monde). Nécessite communication utilisateurs.
- **`tokenVersion`** (`User.tokenVersion`) : incrémenter cette colonne pour un user kick sa session au prochain refresh (~1h max via `updateAge`). Ne pas confondre avec le `tokenVersion` NextAuth.
- **`SUPPORT_ADMIN_EMAIL`** : destinataire des mails "nouveau ticket". Changer = notifs perdues.

### Format audit log JSON
- Les clés du JSON émis par `auditLog()` (`audit`, `category`, `action`, `timestamp`, `actorId`, `actorEmail`, `actorRole`, `actorIp`, `actorUserAgent`, `targetType`, `targetId`, `targetLabel`, `success`, `errorReason`) sont utilisées telles quelles dans les requêtes LogQL de `scripts/audit-log-queries.md` et dans les alertes Grafana. Renommer une clé casse toutes les requêtes existantes côté observabilité.

### Label Loki
- Le label appliqué par Alloy est `service_name="dashboard"`, **pas** `service="dashboard"`. Toutes les requêtes LogQL DOIVENT utiliser `service_name`. Le fichier `scripts/audit-log-queries.md` utilise l'ancien label incorrect `service` — les queries qui y figurent ne matchent rien et doivent être corrigées.

### PM2 root vs PM2 ubuntu
- Le process Dashboard tourne sous **PM2 root** (`/root/.pm2`). Un `sudo pm2 <cmd>` classique perd le HOME et pilote le PM2 ubuntu (qui ne contient que `ai2xplore` sandbox). Toujours utiliser `sudo -H pm2 <cmd>` ou `sudo HOME=/root pm2 <cmd>` pour restart / stop / logs le vrai Dashboard.
- Un `sudo pm2 restart all` sans `-H` restart AI2Xplore sandbox à la place du Dashboard — piège silencieux, aucun message d'erreur.
