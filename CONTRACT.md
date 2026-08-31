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

**Pour LyraeKonnect** — header `x-api-key: KONNECT_API_KEY` :
`GET /api/konnect-tenant-mapping/resolve?tenantId=<uuid>` → `{ userProductId }`,
`GET /api/konnect-configuration?userProductId=NN` (ou `?tenantId=<uuid>`),
`GET /api/product-config?userProductId=NN&domaine=X`,
`GET /api/konnect-examens?userProductId=NN`,
`GET /api/konnect-sites?userProductId=NN`,
`GET /api/konnect-modes-traitement?userProductId=NN`.
Toutes en **lecture seule** : le `PUT` de ces routes refuse un appel par clé, la
configuration se pilote depuis le Dashboard.

⚠️ **`konnect-modes-traitement` : une table vide vaut « le patient réserve seul ».**
Ne jamais inverser ce défaut. Un centre dont la configuration ne remonte pas reste
ouvert ; un défaut « relecture » ou « orientation directe » bloquerait en silence
tous les rendez-vous d'un centre mal configuré. Les valeurs de `mode` et les cinq
familles sont des énumérations partagées avec Konnect (`app/modes/schema.py`,
`app/questionnaire/schema.py`) : en renommer une casse la résolution du mode à
distance, sans erreur visible.

`GET /api/konnect-installation` (lot G6) n'est **pas** une route machine-à-machine :
session admin uniquement, aucune clé d'API. Elle agrège l'état d'installation des
centres Konnect depuis les tables du Dashboard, sans jamais appeler Konnect, qui est
derrière un VPN et ne répondrait pas.

Clé **distincte de `BOT_API_KEY`** : la réutiliser rendrait Konnect et LyraeTalk
indistinguables dans les logs d'audit, dont le format est consommé par Grafana.

**Depuis le 26/08/2026 (lot A), Konnect s'identifie par `userProductId`, comme LyraeTalk.**
Il le résout une fois via `/resolve`, le retient dans son `tenant.user_product_id`, et
interroge ensuite le Dashboard dans la même forme que l'autre produit — une seule forme
d'appel, donc plus de traduction à recoder dans chaque route de configuration.
La forme `?tenantId=` **reste supportée** : voie d'amorçage, et repli quand l'identifiant
retenu se révèle caduc (cabinet re-rattaché). `tenant_id` demeure la clé d'isolation RLS de
Konnect ; il a seulement disparu des routes de configuration.

⚠️ **Un appel par clé avec `?userProductId=` vérifie que le centre porte bien le produit
attendu** (référentiel `src/lib/produits.ts`), sinon 404. Sans ce contrôle, la clé de
Konnect lirait la configuration d'un centre LyraeTalk : la traduction par `tenantId`
garantissait ce point implicitement, plus maintenant.

Le corps de réponse de `konnect-configuration` est en **snake_case**, aligné champ pour
champ sur `ParametresOut` de Konnect (`backend/app/cabinet/api.py`), pour qu'il le consomme
sans traduction. Renommer une de ces clés casse le portail patient en silence. La frontière
camelCase ↔ snake_case est dans `src/lib/konnectConfig.ts`, et nulle part ailleurs.

**17 champs depuis le 28/08/2026** (lot G4). Trois s'ajoutent aux 14 d'origine :
`annulation_directe`, `sms_rappel_mode`, `code_caracteristique_confirmation_xplore`.
Ils n'avaient jusque-là aucune interface, ni ici ni dans la console cabinet de
Konnect, et n'étaient modifiables qu'en SQL direct.

⚠️ **Deux d'entre eux commandent des effets irréversibles chez le patient.**
`annulation_directe` à `true` fait qu'un « non » du patient **supprime** son
rendez-vous dans le RIS, sans relecture du secrétariat : le défaut `false` est un
choix de sécurité (AB-12), pas une commodité. `code_caracteristique_confirmation_xplore`
vide empêche d'inscrire la réponse du patient dans le RIS. Konnect restreint le
premier à `false` quand sa configuration est périmée ; ne pas contrarier ce défaut
depuis ici.

**Ajouter un champ à `KonnectSettings` suit toujours le même ordre** : la colonne et
`COLONNES_KONNECT` ici d'abord, déployés ; puis `CHAMPS_PILOTES` chez Konnect.
L'inverse remet le champ à son défaut à la première synchronisation, sans erreur
visible.

`GET /api/product-config` est le **socle générique** (lot B) : un objet JSON par
(centre, domaine), que le Dashboard stocke sans l'interpréter. Trois règles y sont
attachées, toutes dans `src/lib/productConfig.ts` :
- le **domaine doit être déclaré** dans le registre — sinon 400 ;
- **chaque domaine nomme la clé d'API qui peut le lire**, si bien que `KONNECT_API_KEY`
  n'ouvre pas les domaines de LyraeTalk ;
- `valeur` est toujours un **objet** JSON à la racine — un tableau ou un scalaire
  interdirait d'ajouter un champ plus tard sans casser les lecteurs.

La réponse porte un **ETag** (`W/"v<version>"`) ; un `If-None-Match` qui correspond renvoie
**304 sans corps**. Ce n'est pas un raffinement : un catalogue d'examens pèse des centaines
de lignes et ne peut pas transiter à chaque lecture. Un domaine jamais configuré répond
**200 avec `{}` en version 0**, jamais 404 — le consommateur doit pouvoir distinguer « pas
encore configuré » d'une erreur pour appliquer ses défauts.

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
- Manuel : `prisma/migrations/manual/*.sql` (16 fichiers) — **ces tables ne sont pas dans `schema.prisma`**

| Origine | Tables |
|---|---|
| Prisma (17) | `User`, `Product`, `UserProduct`, `UserNumber`, `LyraeExplainDetails`, `LyraeTalkDetails`, `FileSubmission`, `Ticket`, `TicketMessage`, `Notification`, `Call`, `TalkSettings`, `ReceivedCalls`, `TalkInformationSettings`, `ExamMapping`, `CallConversation`, `LoginAttempt` |
| SQL manuel (15) | `AppointmentConfirmation`, `ReminderSent`, `ReminderStats`, `ExternalCenterMapping`, `KonnectTenantMapping`, `KonnectSettings`, `KonnectExamens`, `KonnectSites`, `ProductConfig`, `SmsConfirmationConfig`, `PrescriptionConfig`, `PrescriptionUpload`, `PrescriptionAccessLog`, `PrescriptionStats`, `DeploymentStatus` |

`KonnectTenantMapping` (24/08/2026) relie un cabinet Konnect (`tenantId`, UUID) à un centre
du Dashboard (`userProductId`). **1 ↔ 1 contraint dans les deux sens**, à la différence
d'`ExternalCenterMapping` qui accepte N codes pour un `UserProduct` : le Dashboard doit
pouvoir résoudre le tenant d'un centre sans ambiguïté, pas seulement l'inverse.
Administrée par `/api/konnect-tenant-mapping` (session NextAuth, admin — **pas** une route
machine-à-machine). Sa **sous-route** `/api/konnect-tenant-mapping/resolve`, elle, est
machine-à-machine (clé API seule, surface minimale : elle ne renvoie qu'un entier) et sert
à Konnect à apprendre son `userProductId` une fois pour toutes.

Depuis le lot A, cette table n'est plus sur le chemin critique de chaque lecture : Konnect
retient l'identifiant de son côté. Elle reste **la seule autorité** du rattachement — ce que
Konnect garde est un cache, effacé et re-résolu dès qu'un 404 révèle qu'il est caduc.

`KonnectSettings` (24/08/2026) porte la configuration du portail patient, une ligne par
centre. Le Dashboard en est **propriétaire**, exactement comme `TalkSettings` pour
LyraeTalk : le client paramètre ici, Konnect vient lire. **Les valeurs par défaut ne sont
pas neutres** — elles reprennent une à une celles de `cabinet_parametres` côté Konnect,
délibérément *fail-closed* : un centre non configuré ne déclenche aucun traitement sensible
(pas d'OCR cloud, pas de questionnaire clinique, pas de choix de radiologue). Seul
`ocrActif` vaut `true`, parce que côté Konnect `false` est le chemin **plus** contrôlé.
Les changer modifie le comportement du portail pour tout centre non encore configuré.
Aucune ligne n'est créée à la lecture : un centre inconnu reçoit les défauts.

`ProductConfig` (26/08/2026) est le **socle de configuration générique** : un objet JSON
par (centre, domaine), avec une `version` qui s'incrémente à chaque écriture et sert
d'ETag. Elle complète les tables typées plutôt qu'elle ne les remplace — ce que le client
édite au clic garde son schéma et son écran ; ce qu'il règle une fois à l'installation vit
ici. Le critère est la **fréquence d'édition**, pas la taille du corpus.

Le produit n'y est **pas** stocké : il se déduit de `userProductId`. La liste blanche des
domaines, le produit de chacun et la clé d'API autorisée à le lire sont dans
`src/lib/productConfig.ts` — **ajouter un domaine s'y fait sans migration**, et c'est tout
l'intérêt du mécanisme. Le Dashboard n'interprète jamais `valeur`.

`KonnectExamens` (26/08/2026) porte le **mapping d'examens** d'un centre Konnect, sur
le **même modèle que celui de LyraeTalk** : le référentiel NEURACORP est pré-rempli
(blob Azure), et le client ne renseigne que les équivalents de son RIS en face. Une
ligne par (centre, **code NEURACORP**) — c'est ce code interne qui est la clé, pas
celui du RIS.

Les deux mappings restent **séparés**, un par produit. Même RIS et mêmes codes, mais
Konnect porte trois réglages que le robot vocal ignore — `ordoOblig`, `examenInjecte`,
`listeAttenteActive` — qui pilotent des écrans du parcours web.

Quatre points à connaître :

- **`codeExamenClient` est la clé de jointure avec le RIS** : c'est le code que Konnect
  transmet à AI2Xplore pour créer le rendez-vous. Une ligne sans ce code n'est pas
  réservable et n'est jamais transmise.
- **La route sert deux formats** — le mapping complet à une session (pour l'écran,
  amorcé sur le référentiel s'il n'y a rien d'enregistré), le **catalogue effectif** en
  snake_case à un appel par clé (seulement les lignes `performed` avec un code RIS).
  Même principe que `/api/configuration/get/mapping` pour LyraeTalk.
- **Le `PUT` remplace l'ensemble**, il ne modifie pas ligne à ligne : un examen retiré
  disparaît réellement, et le mapping n'est jamais à moitié écrit.
- **L'ETag est calculé, non stocké** (`count` + `max(updatedAt)`) : une modification
  déplace `updatedAt`, une suppression change `count`. Un référentiel de plusieurs
  centaines de lignes ne transite que lorsqu'il a réellement changé.

Côté Konnect, `cabinet_examen` en devient le **cache**, remplacé en bloc — une panne ne
le vide jamais.

Le pré-remplissage depuis le RIS **n'alimente pas cette table** : le Dashboard ne peut
pas interroger i2ris, dont les identifiants sont par cabinet et chiffrés chez Konnect.
Un push d'amorçage viendra dans un ticket dédié — ce sera le premier verbe d'écriture
du pont. À noter : i2ris n'expose ni libellé ni champs métier par examen, il n'apporte
que des codes, là où le référentiel NEURACORP fournit déjà type et libellé.

`KonnectSites` (27/08/2026) porte les lieux d'exercice d'un centre. Le RIS les
distingue par un `siteId` mais **n'expose aucune adresse** (gap H12) : c'est le client
qui la saisit. Elle sert à dire au patient où aller avant qu'il confirme, et à
rapprocher les inscrits en liste d'attente du site le plus proche. `siteId` est la clé
de jointure avec le RIS, comme `codeExamenClient` pour le catalogue.

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
| **LyraeKonnect** | 5 endpoints : résolution d'identité, configuration cabinet, socle générique par domaine, mapping d'examens, sites. **Le pont est éteint par défaut** (`KONNECT_DASHBOARD_BASE_URL` vide côté Konnect) ; branché, une panne du Dashboard fige sa configuration mais n'arrête pas le portail patient — il sert son cache |
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
5bis. **Clés des domaines de `ProductConfig`** (`src/lib/productConfig.ts`) : renommer un
   slug orpheline les données du centre sans la moindre erreur — la ligne existe toujours,
   plus personne ne la lit. Retirer une entrée du registre a le même effet. Marquer
   obsolète plutôt que supprimer. Et **le lien domaine → variable de clé d'API** est un
   contrôle de sécurité : le relâcher laisserait la clé d'un produit lire les domaines de
   l'autre.
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
