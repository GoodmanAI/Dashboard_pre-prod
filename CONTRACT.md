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

⚠️ **`GET /api/configuration` renvoie un bloc `site`** (07/09/2026), miroir exact de
l'objet `call.site` de LyraeTalk. Il porte la configuration qui vit encore dans le
`getInitInfo.js` du robot et qui descend ici au fur et à mesure, lue dans le domaine
`talk.site` du socle `ProductConfig`.

Trois règles, et les trois sont des invariants :

1. **Chaque clé porte le nom de la propriété `call.site` qu'elle alimente**, sans
   traduction. Le robot recopie ; renommer une clé côté Dashboard casse le champ en
   silence.
2. **Le bloc surcharge, il ne remplace pas.** Le robot pose ses valeurs en dur avant
   la fusion : un champ absent, ou le bloc entier à `null`, laisse le comportement
   actuel. C'est ce qui rend la migration réversible et activable centre par centre.
3. **Un objet est remplacé en entier, jamais fusionné clé à clé.** Envoyer
   `risCode: { info: "A04" }` sans les types ferait perdre tous les codes sites, donc
   tous les créneaux. Tout objet descendu doit être complet.

`null` dans un champ signifie « je n'ai pas d'avis » et est ignoré ; pour vider une
liste, envoyer `[]`.

**Le bloc ne porte jamais ce que la racine sert déjà** (08/09/2026). LyraeTalk applique
le bloc PUIS les champs racine : un champ présent des deux côtés serait écrasé en
silence, et l'écran qui le saisit ne servirait à rien. Huit champs sont donc retirés du
bloc avant l'envoi, et celui qui gagne est toujours celui qu'un écran **client**
alimente : `bookableExams` (← `examsAccepted`), `fullPlanningNotes`,
`doubleBookingConfig`, `intro` (← `welcomeMsg`), `serviceEnabled`,
`sendConfirmationSms`, `prescriptionByType`, et `typeExams` (← `examMappings[].diminutif`,
que le robot dérive lui-même). Même règle pour `statePerformed.motif`, `.questions` et
`.menstruations`, réglées dans `options`, et pour la fiche du site principal de
`siteDetails`, reconstruite depuis `centerName`. Ce qui est retiré est journalisé.

Contrat détaillé et liste des champs cibles : `contracts/shared/init-config.md`.

⚠️ **`GET /api/configuration` : le champ `labelFr` de `examMappings` porte un CODE de
type, jamais un libellé** (07/09/2026). C'est ce que LyraeTalk lit pour savoir de quel
type une ligne parle, et ce dont il fera la clé de `site.typeExams` quand la
configuration descendra d'ici. Il est calculé par `codeEtendu()` de
`src/lib/examTypes.ts`, qui lit `examCode` d'abord, `labelFr` ensuite, `fr` en dernier
recours — dans cet ordre parce que `fr` est précisément la colonne qui a été corrompue
chez plusieurs centres (« Scanner » sur les cinq lignes), et que la table locale qu'il
remplace la consultait en premier, renvoyant `CT` pour une échographie.

`codeEtendu` reconnaît **neuf** codes : les cinq canoniques (`US`, `MG`, `RX`, `MR`,
`CT`) et quatre supplémentaires (`PA` panoramique dentaire, `UI` échographie injectée,
`CI` scanner injecté, `OT` ostéodensitométrie). Ces quatre-là ne sont **pas** des
modalités : ils ne sont ni réservables ni présents dans `examsAccepted`,
`prescriptionByType` ou les combinaisons de double examen. Ils servent à RELIRE un
rendez-vous que le logiciel du centre renvoie avec son code maison. Une ligne
irrécupérable retombe sur `fr`, comportement historique.

**Pour AI2Xplore** — header `x-api-key: APPOINTMENT_API_KEY` :
`POST /api/rdv/init`, `POST /api/rdv/ack`, `GET /api/rdv/pending-events`, `POST /api/rdv/reminder-sent`, `POST /api/prescriptions/init`, `GET /api/prescriptions/pending`, `GET /api/prescriptions/download/[id]`, `POST /api/prescriptions/ack/[id]`.

**Pour LyraeKonnect** — header `x-api-key: KONNECT_API_KEY` :
`GET /api/konnect-tenant-mapping/resolve?tenantId=<uuid>` → `{ userProductId }`,
`GET /api/konnect-configuration?userProductId=NN` (ou `?tenantId=<uuid>`),
`GET /api/product-config?userProductId=NN&domaine=X`,
`GET /api/konnect-examens?userProductId=NN`,
`GET /api/konnect-sites?userProductId=NN`.
Toutes en **lecture seule** : le `PUT` de ces routes refuse un appel par clé, la
configuration se pilote depuis le Dashboard.

**Deux exceptions, et elles sont délibérées.**

**1.** `POST /api/konnect-demandes-rappel?userProductId=NN` (02/09/2026). Konnect y dépose la
demande de rappel d'un patient dont l'examen n'est pas coché « Réservable en ligne »
dans le mapping. Corps : `referenceKonnect`, `nom`, `prenom`, `telephone`,
`examenLibelle`. Le `POST` est réservé à la clé (une session est refusée en 403 : le
dépôt vient du portail patient, pas d'un utilisateur du Dashboard) ; le `GET` et le
`PATCH` sont réservés à une session (Konnect ne relit jamais ce qu'il a déposé).
`referenceKonnect` rend le dépôt idempotent.

**2.** `POST /api/konnect-remontee?userProductId=NN` (08/09/2026, lot E). Konnect y
pousse ce qu'il **observe** et que le Dashboard ne peut pas déduire. Corps : un objet
dont les clés sont des sections. Deux sont connues : `messagerie`
(`notifier_arme`, `mail_en_service`, `sms_en_service`) et `funnel`
(`fenetre_jours`, `demandes`, `conversion_globale`, `abandons`,
`sorties_humaines`, `etapes[]`). **Une section inconnue est ignorée, pas refusée** :
un Konnect plus récent peut en envoyer une que ce Dashboard ne sait pas encore lire.
Une troisième, `catalogue`, porte les **écarts constatés** entre les codes RIS saisis
ici et ce que le logiciel du centre déclare ouvert à la réservation en ligne
(`nb_codes_inconnus`, `nb_types_incoherents`, `nb_absents_du_mapping`, plus les
listes tronquées à 40). **Ce sont des constats, jamais des corrections** : la saisie
du client fait autorité, et rien de cette section n'écrit dans `KonnectExamens`.
Les trois sections ont des rythmes différents (quinze minutes, six heures, une fois
par nuit) et la fusion se fait section par section : une remontée partielle
n'efface pas le reste. Le `POST` est réservé à la clé,
le `GET` à une session. Stocké dans `KonnectRemontee`, une ligne par centre, fusionnée
section par section, horodatée **à la réception** (une horloge décalée sur la VM
Konnect ferait passer une remontée périmée pour fraîche).

**Pourquoi un push et pas une lecture** : Konnect passe derrière un VPN, le Dashboard
est sur un VPS public. Aucun appel du Dashboard vers Konnect ne l'atteindrait. Ce n'est
pas un arbitrage, c'est la topologie (`lyrae/DECISIONS.md`, 08/09/2026). Tout futur
besoin de ce genre passe par ici, et **il ne doit pas y avoir de troisième route où la
clé écrit** sans décision explicite.

⚠️ **Une remontée ne porte JAMAIS de configuration.** Elle appartient au Dashboard, et
la lui renvoyer rouvrirait la double vérité fermée le 28/08/2026. Ni donnée patient :
ce sont des agrégats. La route filtre par liste blanche de sections, ce qui écarte
d'office ce qu'un émetteur trop bavard déposerait.

Migration : `prisma/migrations/manual/2026_09_08_konnect_remontee.sql`, à appliquer
**avant** le déploiement du code. Sans elle le `POST` échoue, Konnect le traite comme
« indisponible », et rien ne casse côté patient.

⚠️ **`KonnectDemandesRappel` est la SEULE table de cette base qui porte de la donnée
patient** (nom, prénom, téléphone). Q33 et Q34 restent ouverts. Trois règles qui ne se
négocient pas : le strict minimum descend (jamais l'ordonnance ni le questionnaire),
l'`auditLog` ne compte que des volumes, et la purge à 90 jours après traitement est
obligatoire (`scripts/db-maintenance/purge_konnect_demandes_rappel.sh`).

⚠️ **`konnect-examens` : `reservableEnLigne` vaut `true` par défaut.** Ne jamais
inverser ce défaut. Un centre dont la configuration ne remonte pas reste ouvert ; un
défaut `false` basculerait en silence tout son catalogue sur le rappel. Cette colonne
a remplacé la route `konnect-modes-traitement` et ses trois modes le 02/09/2026 : le
choix du chemin se fait désormais ligne par ligne dans le mapping. Konnect la lit dans
`cabinet_examen.reservable_en_ligne`.

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

**20 champs depuis le 09/09/2026.** Trois se sont ajoutés aux 14 d'origine le
28/08 (lot G4) : `annulation_directe`, `sms_rappel_mode`,
`code_caracteristique_confirmation_xplore`. Ils n'avaient jusque-là aucune interface,
ni ici ni dans la console cabinet de Konnect, et n'étaient modifiables qu'en SQL
direct.

Le dix-huitième est `rappels_actifs` (08/09/2026) : le portail relance-t-il le
patient avant sa venue (rappels J-N) ? Il ne dit pas par quel canal, les deux champs
`envoi_*` s'en chargent, mais **si** l'on relance. Sans lui,
`app.rappels.service` itérait sur tous les tenants sans garde par cabinet : armer
`KONNECT_NOTIFIER_ENABLED` pour un client aurait mis tous les centres à relancer,
cabinet de démonstration compris. **Défaut `false`**, fail-closed comme le reste ;
un vrai client doit donc cocher la case.

Les dix-neuvième et vingtième sont `couleur_principale` et `couleur_secondaire`
(09/09/2026). Konnect s'affiche en iframe **dans** le site du cabinet : bleu Lyrae au
milieu d'un site vert, l'encart a l'air d'un corps étranger. La principale peint les
boutons, les liens et les états actifs ; la secondaire peint le bandeau du haut. Format
`#rrggbb`, **normalisé ici** (`versCouleur`, qui développe aussi la forme courte
`#abc`) : Konnect ne reçoit qu'une seule forme, et la revalide avant de l'écrire dans
un attribut de style. `null` = palette Lyrae, fail-closed comme le reste.

Les dérivés (survol, fonds clairs) ne sont **pas** transmis : Konnect les calcule, avec
les mêmes formules que l'aperçu du Dashboard. Deux formules qui divergeraient feraient
mentir l'aperçu.

⚠️ **L'ordre de déploiement d'un nouveau champ n'est pas négociable.** Le Dashboard
doit savoir le servir AVANT que Konnect ne l'ajoute à `CHAMPS_PILOTES` : dans
l'autre sens, la première synchronisation le remet à son défaut, en silence.

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

### `GET|PUT|DELETE /api/konnect-logo` — le seul binaire du pont (09/09/2026)

Le logo du cabinet, **téléversé** par le client (PUT multipart, session uniquement) et
**tiré** par Konnect (GET, `x-api-key: KONNECT_API_KEY`). Il ne passe **pas** par
`konnect-configuration` : un binaire dans ce payload le ferait transiter à chaque
synchronisation, toutes les quelques minutes et par cabinet, pour une image que rien
n'a changée. Ici Konnect envoie son `If-None-Match` et reçoit un 304.

**Pourquoi Konnect en garde une copie**, alors que le Dashboard fait foi : la CSP de
son iframe est `img-src 'self'`. Une image servie par le Dashboard, ou par le site du
cabinet, serait bloquée dans le navigateur du patient. Le seul moyen de l'afficher est
de la servir depuis l'origine de Konnect, donc de l'avoir en local (`cabinet_logo`).

**404 est une réponse, pas une panne** : « ce centre n'a pas de logo ». Konnect vide
alors son cache, sans quoi un logo retiré resterait affiché au patient indéfiniment.

Contraintes du dépôt : PNG, JPEG, WEBP ou SVG, 512 Ko maximum. L'ancien champ
`logo_url` **n'est plus une source** ; il n'a d'ailleurs jamais rien affiché. Il reste
en base comme trace, et reste servi dans le payload de configuration.

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

Depuis le 07/09/2026, deux routes servent le suivi d'installation, **session NextAuth
uniquement, jamais appelées par une brique** :
- `GET/PUT/DELETE /api/centre-statut` — le classement d'un centre (admin).
- `GET /api/completude` — ce qui manque à un centre pour fonctionner, calculé par le
  registre `src/lib/completude/`. Un client n'y reçoit que les informations dont il est
  propriétaire, le filtrage est côté serveur. Sans `userProductId`, elle renvoie tout le
  parc (admin seul).

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
| **Azure Blob `neuracorp-exams`** | `/api/data/exams`, `/api/configuration/exam` — **partagé avec les Azure Functions, couplage non identifié jusqu'ici [?] Q3**. `/api/configuration/get/mapping` ne le lit plus (11/09/2026) : la nomenclature vient de `ReferentielExamens`, le blob n'étant qu'un repli tant que la table est vide |
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
- Manuel : `prisma/migrations/manual/*.sql` (17 fichiers) — **ces tables ne sont pas dans `schema.prisma`**

| Origine | Tables |
|---|---|
| Prisma (17) | `User`, `Product`, `UserProduct`, `UserNumber`, `LyraeExplainDetails`, `LyraeTalkDetails`, `FileSubmission`, `Ticket`, `TicketMessage`, `Notification`, `Call`, `TalkSettings`, `ReceivedCalls`, `TalkInformationSettings`, `ExamMapping`, `CallConversation`, `LoginAttempt` |
| SQL manuel (18) | `AppointmentConfirmation`, `ReminderSent`, `ReminderStats`, `ExternalCenterMapping`, `KonnectTenantMapping`, `KonnectSettings`, `KonnectExamens`, `KonnectSites`, `KonnectDemandesRappel`, `ProductConfig`, `SmsConfirmationConfig`, `PrescriptionConfig`, `PrescriptionUpload`, `PrescriptionAccessLog`, `PrescriptionStats`, `DeploymentStatus`, `CentreStatut`, `ReferentielExamens` |

`CentreStatut` (07/09/2026) porte le statut de cycle de vie d'un centre :
`integration`, `production` ou `arrete`, une ligne par `userProductId`, donc **par couple
client × produit** — un cabinet peut prendre des appels depuis six mois et ouvrir son
portail patient la semaine prochaine.

**Elle ne pilote que l'affichage des alertes de configuration.** Elle ne coupe aucun
service, ne retire aucune affiliation, et aucune brique consommatrice ne la lit : ni
LyraeTalk ni Konnect n'en connaissent l'existence. Ne pas la confondre avec les trois
notions d'état qui existaient déjà : `UserProduct.removedAt` (le client n'a plus le
produit, et le centre disparaît des écrans), `TalkSettings.options.serviceEnabled` (le
robot répond ou transfère, réversible à la minute) et `DeploymentStatus` (l'état des VMs).

**L'absence de ligne vaut `integration`**, donc silence : le classement est un geste
volontaire, et reclasser un centre en intégration éteint ses alertes sans redéploiement.
Administrée par `/api/centre-statut` (session NextAuth, admin — **pas** machine-à-machine).

`ReferentielExamens` (11/09/2026) porte la **nomenclature d'examens commune à tous les
centres**, et amorce le mapping d'un centre jamais configuré, LyraeTalk comme
LyraeKonnect. Elle remplace la lecture d'un blob Azure au fil de l'eau : une donnée de
référence qui change quelques fois par an n'a pas à dépendre d'une chaîne de connexion
présente sur chaque serveur (Q35, la variable manquait en production).

⚠️ **Elle ne porte AUCUN code RIS client.** `codeExamenClient` appartient au cabinet et
diffère par définition d'un centre à l'autre : c'est exactement ce que le client
remplit. Elle est semée depuis le mapping LyraeTalk d'un centre de référence
(`scripts/data-provisioning/2026_09_11_semer_referentiel_examens.sql`), dont seuls
`codeExamen`, `typeExamen` et `libelle` sont repris.

Le blob Azure reste le moyen de **rafraîchir** cette table quand NEURACORP publie une
nomenclature ; il n'est plus sur le chemin critique d'un écran client.

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

### `GET /api/configuration/get/mapping` — ce que `performed` veut dire

Cette route renvoie le mapping d'examens d'un centre : ses propres réglages
(`TalkSettings.exams`), **complétés** par la nomenclature commune pour les codes qu'il
n'a jamais configurés. LyraeTalk l'interroge pour savoir quels examens il peut proposer.

⚠️ **`performed` d'une ligne AJOUTÉE par cette complétion vaut `false` quand le centre a
déjà un mapping** (11/09/2026). Le robot lit ce champ : à `true` il annonce l'examen au
patient et tente la réservation (`confirmExam.js` : « Examen non bookable
(performed=false) → redirection »). Or une ligne que le centre n'a jamais configurée
n'a **aucun code RIS**, donc aucun rendez-vous possible.

Sans cette règle, le passage du référentiel de 264 à 287 entrées aurait fait apparaître
21 examens « pratiqués » chez chaque client en service, que le robot aurait promis au
téléphone sans pouvoir les réserver.

**Sur un centre vierge, `performed` vaut `true`** : le client décoche ce qu'il ne
pratique pas, plus rapide que de tout cocher. C'est le comportement d'origine.

## Invariants à ne pas casser

1. **Header `x-api-key`** — le renommer casse LyraeTalk **et** AI2Xplore simultanément.
2. **Payload `POST /api/calls/summary`** : tableau `steps` **ordonné**, index 0 = Lyrae,
   index 1 = User, alternance stricte (`route.ts:30`). Depuis le 2026-09-04,
   `userProductId` est le **centre effectif** et non celui du numéro appelé : sur un
   groupe qui partage un numéro (Quimper 18, Fouesnant 20, Pont-l'Abbé 21), LyraeTalk
   envoie le centre où le patient a pris ou choisi son rendez-vous, et joint le centre
   d'entrée dans `stats.entry_user_product_id` plus le code du centre dans
   `stats.site_code`. `CallConversation.userProductId` portant une clé étrangère, le
   handler vérifie que le `UserProduct` existe avant d'écrire et retombe sur le centre
   d'entrée sinon : un centre non encore créé dégrade l'attribution, il ne fait pas
   perdre l'appel. `centerId` reste à 0, il ne désigne ici aucun centre.
   Voir `plans/2026-09-attribution-stats-multisite.md` dans le workspace.
3. **Payloads** `POST /api/rdv/init`, `POST /api/prescriptions/init` (clés, format de date de naissance, enum de type d'examen).
4. **Forme de `GET /api/prescriptions/pending`** : `{ pending, total }`.
5. **`ExternalCenterMapping.externalCenterCode`** = clé de jointure avec AI2Xplore.
5bis. **Clés des domaines de `ProductConfig`** (`src/lib/productConfig.ts`) : renommer un
   slug orpheline les données du centre sans la moindre erreur — la ligne existe toujours,
   plus personne ne la lit. Retirer une entrée du registre a le même effet. Marquer
   obsolète plutôt que supprimer. Et **le lien domaine → variable de clé d'API** est un
   contrôle de sécurité : le relâcher laisserait la clé d'un produit lire les domaines de
   l'autre.
5ter. **`ExamMapping.examCode` est l'identité d'une ligne**, jamais son rang dans la
   table ni sa colonne `fr`. `examCode` vaut `US`, `MG`, `RX`, `MR` ou `CT` ; `diminutif`
   est le code que le logiciel du centre emploie pour ce type (`DX` pour la radio chez
   RIM29SUD, `SC`/`IR` chez Le Creusot), et c'est lui que LyraeTalk renvoie dans
   `stats.exam_type_id`. `fr` n'est qu'un libellé d'affichage : **ne rien en déduire.**
   L'ancien écran de saisie des diminutifs le calculait depuis la position de la ligne et
   a écrit `Scanner` sur les cinq lignes de plusieurs centres, ce qui affichait toute
   mammographie et toute échographie comme un scanner (constaté sur le groupe Quimper le
   2026-09-04, réparé par `prisma/migrations/manual/2026_09_04_repare_exam_mapping.sql`).
   `GET /api/configuration/mapping/type_exam` renvoie pour cette raison un objet clé par
   code, plus un tableau : `src/lib/examLabels.ts` est le seul endroit qui traduit un
   diminutif en libellé, et `src/lib/examTypes.ts` le seul qui décide du type d'une ligne.
   **Trois chemins ont écrit dans cette table avec trois conventions** : l'écran avant le
   06/08 (`fr` à `Scanner` sur les cinq lignes), l'écran après (rangs `"0"`..`"4"` dans
   `examCode`), et le script de provisionnement de Pontivy (code RIS dans `examCode`, code
   canonique dans `labelFr`). D'où `codeCanonique()`, qui retrouve le type depuis
   `examCode`, puis `labelFr`, puis `fr` en dernier recours. Pour installer un centre :
   `scripts/data-provisioning/MODELE_exam_mapping.sql`, jamais le fichier Pontivy. Pour
   vérifier : `scripts/data-provisioning/AUDIT_exam_mapping.sql`, qui doit renvoyer zéro
   ligne.

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

- **`resolve-number` reste à écrire, et c'est le dernier verrou de la migration de
  `getInitInfo`.** LyraeTalk route ses appels entrants depuis sa propre table
  `phoneToUserProductId`, en dur dans son code : c'est le seul champ qui ne peut pas
  passer par l'appel d'initiation, puisqu'il sert précisément à savoir de quel centre
  il s'agit. Il lui faut une route dédiée, chargée au démarrage du robot et non à
  chaque appel (la latence tomberait sur le premier mot).
  Prérequis : une colonne `userProductId` sur `UserNumber`, aujourd'hui clée par
  `userId` — ce qui ne distingue pas Quimper de Fouesnant, trois `UserProduct` sous un
  même client. C'est aussi ce qui rendra le « numéro d'appel » enfin fonctionnel et
  justifiera de repasser son exigence en bloquant (elle est en `confort` depuis le
  07/09, parce que rien ne lit cette table). Suite du chantier `talk.site`, cf.
  `contracts/shared/init-config.md` et le backlog de LyraeTalk (B53, B54).
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
- Aucun test. `schema.prisma` ne couvre pas les 18 tables SQL manuelles.
