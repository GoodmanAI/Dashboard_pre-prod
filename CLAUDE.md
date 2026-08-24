# Dashboard

Ce repo est une brique du produit Lyrae. **Les interfaces inter-briques (routes exposées, payloads, invariants, consommateurs) sont dans `CONTRACT.md`** — le lire avant de toucher à une route `/api/*` appelée par LyraeTalk ou AI2Xplore. Ce fichier ne couvre que le quotidien interne.

Next.js 14 App Router, TypeScript strict, Prisma 6 + PostgreSQL, NextAuth v4, MUI 5. Alias `@/*` → `src/*`.

## Commandes

```bash
npm run dev            # localhost:3000
npm run build          # next build — le seul vrai garde-fou (aucun test)
npm run lint
npx prisma migrate dev --name <slug>   # crée une migration Prisma
npx prisma generate                    # après toute édition de schema.prisma
npm run seed           # prisma/seed.ts — admin + ~30 comptes clients
npm run seed-calls / seed-demo-calls / seed-data   # jeux de données de démo
node scripts/create-super-admin.js
```

Prod : VPS OVH, PM2. `git pull` → `npm run build` → `pm2 restart`. Pas de CI, pas de conteneur en prod (le `docker-compose.yml` / `dockerfile` / `entrypoint.sh` et le `README.md` décrivent un ancien setup Docker et sont obsolètes).

## Migrations : deux vitesses

1. **Prisma** — `prisma/migrations/<timestamp>_<slug>/migration.sql`, générées par `prisma migrate dev`, appliquées par `prisma migrate deploy`.
2. **SQL manuel** — `prisma/migrations/manual/AAAA_MM_JJ_<sujet>.sql`, écrites à la main, **jamais vues par Prisma**, appliquées en prod par `psql "$DATABASE_URL" -f <fichier>`.

Dix tables n'existent **que** côté SQL manuel et sont absentes de `schema.prisma` :
`AppointmentConfirmation`, `ReminderSent`, `ReminderStats`, `ExternalCenterMapping`, `KonnectTenantMapping`, `SmsConfirmationConfig`, `PrescriptionConfig`, `PrescriptionUpload`, `PrescriptionAccessLog`, `PrescriptionStats`.

Conséquences pratiques :
- Ces tables **ne sont pas accessibles via `prisma.*`**. On les lit et écrit en SQL brut via le pool `pg`.
- Pour les faire évoluer : nouveau fichier dans `manual/`, en `ADD COLUMN` / `CREATE TABLE IF NOT EXISTS` **idempotent et additif** (les fichiers existants suivent cette convention, en-tête commenté expliquant le contexte). Ne jamais les recréer via `prisma migrate` : `prisma migrate dev` proposerait un `DROP` puisqu'elles sont invisibles du schéma.
- **Ne jamais lancer `prisma migrate reset` ni `prisma db push`** sur une base contenant des données : les 9 tables manuelles seraient perdues ou marquées en dérive.
- Certaines tables sont nées manuelles puis ont été rapatriées dans `schema.prisma` (`LoginAttempt`, `ModuleInfoItem`, `TicketMessage`) — leur `.sql` manuel existe encore ; l'`IF NOT EXISTS` évite le conflit.
- Colonnes et tables en **camelCase entre guillemets** (`"UserProduct"`, `"userProductId"`) : sensibles à la casse en SQL brut.

## Deux clients de base

- **`src/lib/prisma.ts` (`prisma`) est le canonique.** Tout nouveau code applicatif passe par là.
- **`src/lib/db.ts` (`db`, pool `pg`)** : utilisé partout où l'on touche aux 9 tables hors schéma — c'est-à-dire tout `/api/rdv/*`, `/api/prescriptions/*`, `/api/sms-confirmation-config`, `/api/external-center-mapping`, et les pages patient `/c`, `/d`. Ce n'est pas de la dette gratuite : c'est le seul moyen d'atteindre ces tables. Requêtes paramétrées `$1, $2` obligatoires.
- **`src/utils/prisma.ts`** est un *troisième* client, doublon legacy de `lib/prisma.ts` (log `query` verbeux en plus), encore importé par ~23 fichiers. Ne pas en ajouter d'import ; migrer vers `@/lib/prisma` quand on passe dessus.

## Routes API

78 `route.ts` sous `src/app/api/`. Le seul reliquat Pages Router est `src/pages/api/socket.ts` (serveur Socket.io, path `/api/socket`).

`src/middleware.ts` refuse **toute** route `/api/*` en 401 sans session NextAuth valide. **Une nouvelle route machine-à-machine doit être ajoutée à `PUBLIC_API_PATTERNS`** (haut du fichier), sinon elle renvoie 401 avant d'atteindre le handler — le symptôme typique est « la clé API est bonne mais je prends un 401 ». Le middleware ne fait que débloquer le passage : l'authentification réelle reste dans le handler, via `requireApiKey(req, "BOT_API_KEY")` ou `requireAuthOrApiKey(req, envVar)` de `src/lib/auth-helpers.ts`.

Le même fichier isole aussi les sous-domaines patient (`rdv.neuracorp.ai`, `depot-ordonnances.neuracorp.ai`) : tout chemin hors de leur whitelist renvoie 404. Une nouvelle page ou un nouvel asset patient doit y être déclaré aussi.

Conventions de handler, dans l'ordre : garde d'auth (`requireAuth` / `requirePagePermission(PAGES.X, "write")` de `src/lib/authGuards.ts`), puis ownership (`assertUserProductOwnership`), puis métier, puis `auditLog(...)` de `src/lib/auditLog.ts` pour toute mutation sensible — le format JSON de ces logs est consommé par Grafana (voir `scripts/audit-log-queries.md`).

## Pièges internes

- **`src/lib/produits.ts` est le seul endroit qui connaît les valeurs de `Product.name`.** Ne jamais comparer un nom de produit en dur : passer par `estProduit` / `trouverProduit` / `produitDepuisNom`. C'est ainsi qu'on retrouve le `userProductId` d'un client pour un produit donné, et `Product.name` reste une chaîne dont le renommage en base casserait l'application sans la moindre erreur de compilation. Le catalogue déclare `LyraeTalk` et `LyraeKonnect` ; filtrer une liste de produits se fait en **liste blanche** sur ce catalogue, jamais en liste noire.
- **LyraeExplain est retiré** (24/08/2026) : plus aucun écran ni route. Mais la ligne `Product`, les `UserProduct` rattachés et la table `LyraeExplainDetails` **restent en base**, et le modèle Prisma est conservé pour cette raison — le retirer du schéma ferait proposer un `DROP TABLE` par `prisma migrate dev`.
- **`.env.example` est incomplet** : 15 variables listées, 35 référencées dans le code. Manquent notamment `APPOINTMENT_API_KEY`, `MODULE_INFO_API_KEY`, `APPOINTMENT_HMAC_SECRET`, `BREVO_API_KEY`, `PUBLIC_APP_URL`, `RDV_SHORT_URL_BASE`, `DEPOT_ORDONNANCES_URL_BASE`, `PRESCRIPTIONS_STORAGE_DIR`, `AZURE_STORAGE_CONNECTION_STRING*`, `NEURACORP_EXAMS_*`, `CLAMD_SOCKET`, `PGSSL`, `MAIL_FROM_*`, `AZURE_REBUILD_WEBHOOK_URL`, `AZURE_WEBHOOK_API_KEY`, `DEMO_TALK_USER_ID(S)`. Un `grep "process.env."` ne suffit pas à les recenser : `BOT_API_KEY` et `APPOINTMENT_API_KEY` n'apparaissent que sous forme de littéraux passés à `requireApiKey(req, "…")`. Ajouter la variable au `.env.example` quand on en introduit une.
- `SPECIAL_CENTRE_PAIRS` (`src/lib/auth-helpers.ts:32`) code en dur des accès inter-centres par id numérique, dupliqué côté front dans `CentreContext`. Modifier les deux ou rien.
- Deux mailers (`src/lib/brevoMailer.ts` pour les tickets, `src/utils/mailer.ts` nodemailer, uniquement `api/files/validation`) et deux seeds admin (`prisma/seed_admin.ts`, `scripts/seed-admin.ts`).
- `Call` et `CallConversation` coexistent pour un même appel ; `LyraeExplainDetails` appartient à un produit archivé mais le code est toujours là.
- La CSP est définie dans `next.config.js` : une nouvelle ressource externe (police, image, appel `fetch` cross-origin) est bloquée tant qu'elle n'y est pas ajoutée.
- Les `.sh` de `scripts/db-maintenance/` (purges, alertes) tournent en cron système **hors dépôt** sur le VPS ; les modifier ici ne suffit pas à les déployer.

## Ce qui n'existe pas

- **Aucun test**, d'aucune sorte : ni unitaire, ni intégration, ni e2e. Aucun runner installé. La seule vérification automatisable est `npm run build` puis `npm run lint`.
- **Aucune CI/CD.** Pas de GitHub Actions, pas de hook. Tout se vérifie et se déploie à la main.
