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

`runtimeChangedSinceStart` est un **tri-état** (`true` / `false` / `null`) et non un
booléen : `null` signifie « la sonde n'a pas pu conclure » (pas de process PM2, ou
reflog trop court pour remonter au démarrage). Le traiter comme `false` ferait
disparaître de vraies alertes de restart — à la lecture, seul `false` explicite
requalifie un `restart_pending` en `up_to_date`.

Whitelist dans `src/middleware.ts:13-33`. **Toute nouvelle route M2M doit y être ajoutée.**

### Routes applicatives (71 au total)
Auth NextAuth, comptes (`/api/admin/users*`, `/api/admin/clients*`), tickets, notifications, RDV/SMS, ordonnances, mapping de centres externes, numéros, fichiers, statistiques, produits, données d'examens.

### Pages patient publiques
`/c`, `/d`, `/confirm` — token 8 caractères + `verificationCode` haché bcrypt.
Sous-domaines : `rdv.neuracorp.ai`, `depot-ordonnances.neuracorp.ai` (doivent pointer sur le même conteneur Next).

**Ces trois pages doivent conserver leurs métadonnées** (`generateMetadata` / `metadata`
dans les `page.tsx` — le layout racine est `"use client"` et ne peut pas en exporter) :

- `title` + `openGraph` : les applications de messagerie (`Dalvik/…`, `GoogleMessages/…`
  dans les logs nginx) pré-chargent l'URL du SMS pour en faire un aperçu. Sans elles,
  l'aperçu est un rectangle vide sous un lien d'allure suspecte — signalé par des
  patients comme « une page blanche » (2026-08-11).
- `robots: noindex, nofollow` : Googlebot (`66.249.x`) a visité cinq liens patients le
  2026-08-11. Ces pages portent la date d'un rendez-vous médical et mènent au dépôt d'un
  document de santé — **elles ne doivent jamais être indexables**.

Ne jamais y mettre la date du rendez-vous ni l'identité du patient : titre et description
transitent par les serveurs de l'opérateur de messagerie pour générer l'aperçu.

Chaque route patient a aussi son `error.tsx` et son `not-found.tsx` : sans error boundary,
une erreur de rendu laisse une page blanche au patient et aucune trace côté serveur.

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
- Manuel : `prisma/migrations/manual/*.sql` (11 fichiers) — **ces tables ne sont pas dans `schema.prisma`**

| Origine | Tables |
|---|---|
| Prisma (17) | `User`, `Product`, `UserProduct`, `UserNumber`, `LyraeExplainDetails`, `LyraeTalkDetails`, `FileSubmission`, `Ticket`, `TicketMessage`, `Notification`, `Call`, `TalkSettings`, `ReceivedCalls`, `TalkInformationSettings`, `ExamMapping`, `CallConversation`, `LoginAttempt` |
| SQL manuel (11) | `AppointmentConfirmation`, `ReminderSent`, `ReminderStats`, `ExternalCenterMapping`, `KonnectTenantMapping`, `SmsConfirmationConfig`, `PrescriptionConfig`, `PrescriptionUpload`, `PrescriptionAccessLog`, `PrescriptionStats`, `DeploymentStatus` |

`KonnectTenantMapping` (24/08/2026) relie un cabinet Konnect (`tenantId`, UUID) à un centre
du Dashboard (`userProductId`). **1 ↔ 1 contraint dans les deux sens**, à la différence
d'`ExternalCenterMapping` qui accepte N codes pour un `UserProduct` : le Dashboard doit
pouvoir résoudre le tenant d'un centre sans ambiguïté, pas seulement l'inverse.
Administrée par `/api/konnect-tenant-mapping` (session NextAuth, admin — **pas** une route
machine-à-machine). **Konnect ne la lit pas et ignore encore l'existence du Dashboard** :
elle n'est exploitée que dans le sens Dashboard → Konnect.

Le produit `LyraeKonnect` est une ligne de `Product`, créée par la même migration.
`LyraeExplain` reste en base (4 centres actifs au 24/08/2026) mais n'a plus aucun code :
la table et les lignes sont conservées, seulement plus lues.

`DeploymentStatus` est la seule table **purement observationnelle** : aucune donnée métier,
aucun lien vers les autres tables, une ligne par couple (service, host). Un `DROP` est sans
conséquence — les sondes la repeuplent au cycle suivant. Deux fichiers manuels la
composent : `2026_08_10_deployment_status.sql` (création) et
`2026_08_10_deployment_runtime_changed.sql` (colonne `runtimeChangedSinceStart`).

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
7. **`Product.name`** — valeurs `LyraeTalk` et `LyraeKonnect`. Les renommer en base casse
   l'application sans erreur de compilation. Depuis le 13/08/2026 un seul fichier les
   connaît, `src/lib/produits.ts` : ne jamais comparer un nom de produit en dur ailleurs.
8. **Le cycle de vie d'un `PrescriptionUpload` est à sens unique.** `POST /api/prescriptions/ack/[id]`
   avec `rejected: true` bascule le statut en `REJECTED` (depuis le 2026-08-04) ; à partir de là
   `GET /api/prescriptions/download/[id]` répond **409** — il ne sert que `UPLOADED` et `ACKED` — et
   l'ack nominal refuse tout statut ≠ `UPLOADED`. **AI2Xplore ne peut donc plus rejouer un dépôt
   qu'il a lui-même rejeté** ; seule la secrétaire récupère le fichier, via
   `GET /api/prescriptions/rejected/[id]/download` (session NextAuth, pas de clé API).
   Assouplir l'un des deux sans l'autre ne débloque rien : il faut les deux pour rendre le
   rattrapage automatique possible.
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
- ~~`LyraeExplain` : produit archivé, code encore présent **[?] Q14**.~~ **Résolu le 24/08/2026** :
  écran, route `update-metrics-explain` et seed supprimés ; plus aucune référence applicative.
  La ligne `Product`, les `UserProduct` (4 centres) et la table `LyraeExplainDetails` restent
  en base à dessein — un `DELETE` sur `Product` cascade sur tout ce qui pend à `UserProduct`.
  Le modèle Prisma est conservé pour la même raison. Q14 close.
- `SPECIAL_CENTRE_PAIRS` codé en dur (`auth-helpers.ts:32`).
- Aucun test. `schema.prisma` ne couvre pas les 9 tables SQL manuelles.
