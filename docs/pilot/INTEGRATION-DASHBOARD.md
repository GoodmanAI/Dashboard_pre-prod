# Greffer Pilot dans le dépôt dashboard

Ce qu'il faut faire, fichier par fichier, le jour où Pilot quitte cet atelier
local pour l'espace admin du Dashboard. Rien ici n'est spéculatif : chaque point
vient soit du dossier produit du 19/10/2026, soit du `CONTRACT.md` et du
`CLAUDE.md` du Dashboard.

## 1. Ce qui se copie tel quel

- `src/app/pilot/**` → même chemin, sous l'espace admin.
- `src/app/api/pilot/**` → même chemin.
- `src/lib/checklist/**`, `src/lib/pipeline.ts`, `src/lib/alertes.ts`,
  `src/lib/argent.ts` → même chemin.
- `src/lib/tarifs/**`, `src/lib/montants/**`, `src/components/recherche/**` →
  même chemin. `lireGrilleEnVigueur()` (`src/lib/tarifs/grille.ts`) est le seul
  accès à la grille de prix : si le Dashboard porte un jour la grille, seul ce
  fichier change (CHOIX.md, C-70).
- `src/lib/concurrents/**`, `src/lib/organisations/temperature.ts` et
  `temperatureAffichage.ts` → même chemin. Le barème est un référentiel du code
  (CHOIX.md, C-74) : le changer ne demande aucune migration.
- `prisma/migrations/manual/2026_12_12_pilot_concurrents.sql` → même dossier :
  deux tables, deux énumérations (`CrmTypeConcurrent`, `CrmTemperature`), cinq
  colonnes de `CrmOrganisation`, huit valeurs de `CrmTypeEvenement`.
- `prisma/migrations/manual/2026_12_13_pilot_tarifs.sql` → même dossier : la grille
  tarifaire commune, la première grille reprise de l'apport d'affaires, `PRESTATION`,
  `productId` facultatif et `offerte` sur les lignes, `CrmCaMensuel.productId`
  facultatif. Il relie les tarifs aux produits **par leur nom** dans `Product` :
  vérifier les noms de Konnect, Desk et NoShow en production avant de l'appliquer
  (C-09, C-75). Un produit introuvable est signalé par `RAISE NOTICE` (visible avec
  `psql`) et la page Tarifs affiche « Produit non relié ».
- `prisma/migrations/manual/2026_12_14_pilot_commentaires.sql` → même dossier : les
  départements (`CrmDepartementCompte`, pour tous les comptes, super-administrateur
  compris), les commentaires et leurs destinataires (C-78, C-79).
- `prisma/migrations/manual/2026_12_16_pilot_checklist_deploiement.sql` → même dossier :
  17 étapes de check-list ajoutées et la mention « facturation » sur un contact
  (C-85). Aucune table du Dashboard touchée.
- `prisma/migrations/manual/2026_12_15_pilot_carte.sql` → même dossier : la position
  des centres et leur statut de géocodage (C-81). `src/lib/carte/**` et
  `src/app/pilot/carte/**` → même chemin. Une dépendance de plus à ajouter au
  Dashboard : `leaflet` 1.9.4 (BSD-2), et `@types/leaflet` 1.9.22 en développement
  (C-80). Le géocodage appelle `https://data.geopf.fr/geocodage/search` depuis le
  serveur, et le navigateur charge les tuiles de `https://tile.openstreetmap.org` :
  si le Dashboard a une politique de sécurité de contenu, l'ouvrir à ces deux
  hôtes seulement (`connect-src` côté serveur n'est pas concerné, `img-src` pour
  les tuiles).
- Les modèles `Crm*` de `prisma/schema.prisma` → ajoutés au schéma du Dashboard.
- `prisma/migrations/manual/2026_10_26_crm_pilot.sql` → même dossier.

## 2. Ce qui se remplace

| Ici | Là-bas |
|---|---|
| `src/lib/prisma.ts` | `src/lib/prisma.ts` du Dashboard (le canonique, pas `src/utils/prisma.ts` qui est un doublon legacy) |
| `src/lib/session.ts` | la session NextAuth, `requireAuth` / `requirePagePermission` de `src/lib/authGuards.ts` |
| `src/lib/completude/adapter.ts` | `evaluerCentre` de `lib/completude`, avec ses criticités `bloquant` / `degrade` / `confort` |
| `src/theme.ts` | le thème du Dashboard, à arbitrer : voir CHOIX.md, C-51 |
| `src/components/Coquille.tsx` | la sidebar et le header du Dashboard |
| `src/components/Recherche.tsx` | à placer dans le header du Dashboard : un champ fixe, résultats en liste dessous (CHOIX.md, C-68) |
| `src/middleware.ts` (garde d'origine des requêtes qui modifient) | le middleware du Dashboard : y reporter la garde (`src/lib/requete.ts`), et vérifier que le mandataire conserve `Host` ou pose `X-Forwarded-Host` et `X-Forwarded-Proto`, sinon les requêtes du navigateur reçoivent 403 (C-79) |
| La pastille « Pour vous » (`useComptePourVous`) | la sidebar du Dashboard : relire `GET /api/pilot/pour-vous/compte` à chaque changement de page |

## 3. Ce qui ne se copie pas

Les modèles sous le bandeau « miroir Dashboard » de `prisma/schema.prisma` :
`User`, `Product`, `UserProduct`, `UserNumber`, `ExamMapping`, `Call`. Ils
existent déjà là-bas, avec beaucoup plus de champs. La migration manuelle livrée
ne les crée pas.

À reporter dans le modèle `User` du Dashboard : les relations inverses que
Prisma exige pour les tables `Crm*` qui pointent vers un compte, dont celles du lot R
(`temperaturesForcees`, `concurrentsCrees`, `relevesConcurrentsCrees`), du lot S
(`grillesTarifairesCreees`, et `Product.tarifs`) et du lot T (`departementCompte`,
`commentairesEcrits`, `commentairesCibles`, `commentairesRecus`). Ce sont des
listes de relation, sans colonne ni changement en base.

`prisma/seed.ts` non plus : c'est un décor local.

Ni l'outillage du poste de développement : `scripts/dev-base-test.mjs`,
`scripts/verifier-test.mjs`, `scripts/demarrer.mjs`, et la lecture de
`PILOT_DIST_DIR` dans `next.config.js` (CHOIX.md, C-67 et C-72).

## 4. Points d'attention du Dashboard qui touchent Pilot

**Le middleware.** `src/middleware.ts` refuse toute route `/api/*` en 401 sans
session NextAuth. Les routes de Pilot sont appelées depuis le navigateur par un
humain connecté : elles n'ont donc **pas** à rejoindre `PUBLIC_API_PATTERNS`.
C'est l'inverse d'une route machine-à-machine. À vérifier au premier appel : le
symptôme d'une erreur de ce côté est « la session est bonne mais je prends un
401 ».

**L'ordre des gardes dans un handler.** Le Dashboard impose : garde d'auth, puis
ownership, puis métier, puis `auditLog(...)` pour toute mutation sensible. Les
routes de Pilot qui changent une étape commerciale ou cochent une case
d'intégration sont des mutations sensibles : elles doivent journaliser. Le format
JSON de ces logs est consommé par Grafana — voir `scripts/audit-log-queries.md`.

**`Product.name === "LyraeTalk"`.** Chaîne magique en dur dans une soixantaine
d'endroits, un site la compare en `toLowerCase()`, les autres en strict. Pilot
s'appuie sur `Product` pour ses rattachements et ses lignes de contrat : ne
jamais renommer un produit en base. Les libellés exacts de Konnect et de Desk
restent à confirmer (CHOIX.md, C-09).

**Les deux clients de base.** Les tables `Crm*` étant déclarées dans
`schema.prisma` (CHOIX.md, C-01), tout passe par `prisma`. Aucun recours au pool
`pg` de `src/lib/db.ts` n'est nécessaire pour Pilot.

**Migrations.** Ne jamais lancer `prisma migrate reset` ni `prisma db push` sur
la base du Dashboard : les tables `Crm*` n'y vivent qu'en SQL manuel et seraient
perdues ou marquées en dérive.

**La CSP.** Elle est définie dans `next.config.js`. Si un écran de Pilot charge
une ressource externe (police, image, appel `fetch` cross-origin), elle est
bloquée tant qu'elle n'y est pas ajoutée. Les écrans du lot 1 n'en chargent
aucune.

**L'écran Ventes (C-62).** `2026_12_08_pilot_ventes.sql` ajoute la valeur
`INTERFACAGE` à `CrmTypeEchange`, le type `CrmReconduction` et quatre colonnes
facultatives à `CrmContrat`. Rien ne touche au Dashboard : l'écran lit les
tables de Pilot et les rattachements déjà connus.

**L'apport d'affaires (C-63).** `2026_12_09_pilot_apports.sql` crée six tables
(`CrmApporteur`, `CrmParametresApport`, `CrmApport`, `CrmSalle`,
`CrmPrestataire`, `CrmFactureApport`), ajoute cinq colonnes facultatives à
`CrmCentre` et cinq valeurs à `CrmTypeEvenement`. Rien ne touche au Dashboard.
Les documents imprimables sont des pages HTML servies par Pilot, avec un petit
script `window.print()` en ligne quand on demande le PDF : si la CSP du
Dashboard interdit les scripts en ligne, le bouton « Imprimer » de la page reste
utilisable, seule l'ouverture automatique de la boîte d'impression disparaît.
L'import et l'export de la sauvegarde du calculateur sont réservés au
super-administrateur (`peutExporter`).

**La reprise du parc (C-60).** Le jour de la mise en ligne, ouvrir
`/pilot/comptes` : chaque compte client du Dashboard qui a un accès actif et
qu'aucun centre de Pilot ne suit y apparaît. La reprise est finie quand
« Comptes sans fiche », « Produits à ajouter » et « Contrats à saisir » sont
vides. Les comptes de démonstration et d'entraînement s'écartent. La requête lit
`User.role = 'CLIENT'` et `UserProduct.removedAt` : à vérifier sur le schéma
réel, ainsi que le statut lu par l'adaptateur (`CentreStatut`). Le miroir `User`
porte deux relations inverses de plus (`comptesEcartes`, `ecartsDecides`) : elles
sont à ajouter au modèle `User` du Dashboard avec la table `CrmCompteEcarte`.

**La prospection (C-65).** `2026_12_11_pilot_prospection.sql` ajoute une
énumération (`CrmPriorite`), une valeur à `CrmTypeEchange` (`LINKEDIN`), quatre
colonnes à `CrmOrganisation` et une à `CrmCentre`. Rien sur les modèles du miroir.

**Les rôles et les comptes de l'équipe (C-64).** La table `CrmAccesPilot` et ses
deux énumérations partent avec la migration (`2026_12_10_pilot_acces.sql`).
Trois relations inverses de plus sur `User` (`accesPilot`, `accesCrees`,
`accesModifies`), à ajouter au modèle du Dashboard. Trois points à traiter :
- **Les écritures de `User`.** Toutes sont dans `src/lib/acces/comptes.ts` :
  création d'un compte ADMIN (`creerCompte`), mot de passe provisoire
  (`reinitialiserMotDePasse`) et changement par son titulaire
  (`changerMonMotDePasse`). Là-bas, elles passent par la création de compte et
  le hachage du Dashboard : le `scrypt` local (`src/lib/motDePasse.ts`) ne part
  pas, et un compte du Dashboard peut demander des champs obligatoires de plus.
- **Le premier jour.** Un compte ADMIN sans ligne d'accès est traité en
  développeur, donc sans le chiffre d'affaires. Avant d'ouvrir Pilot à l'équipe,
  le super-administrateur passe une fois sur l'écran Équipe et choisit le rôle
  de chacun (« Rôle pas encore choisi » le signale).
- **Les permissions par page du Dashboard.** Si le Dashboard en a déjà une pour
  le chiffre d'affaires, choisir laquelle fait foi, et l'écrire : deux réglages
  pour un même droit, c'est une double vérité.

## 5. Les alertes, une fois là-bas

`src/lib/alertes.ts` calcule et renvoie. Il reste à brancher la sortie :

- création d'une `Notification` assignée au responsable du client ;
- mail Brevo via `src/lib/brevoMailer.ts` (celui des tickets, pas le nodemailer
  legacy de `src/utils/mailer.ts`) ;
- pour Enzo, une remontée dans Véga.

Une alerte ne doit pas repartir à chaque passage : il faut une clé de
déduplication. `Alerte.cle` est déjà stable et unique par cause (`silence-12`,
`date-promise-7`) — c'est elle qui sert.

## 6. Le cron

Depuis l'incrément D, l'écran Intégrations ne déclenche plus aucune évaluation :
il lit la base et affiche l'heure du dernier passage (CHOIX.md, C-17). Les cases
automatiques sont mises à jour par `evaluerParc()`, en cinq lectures et une
transaction, appelé par `scripts/evaluer-parc.ts`. Ligne de crontab à poser sur
le VPS :

```
*/15 * * * * cd /chemin/du/dashboard && npx tsx scripts/evaluer-parc.ts >> /var/log/pilot-evaluation.log 2>&1
0 6 * * * cd /chemin/du/dashboard && npx tsx scripts/expirer-propositions.ts >> /var/log/pilot-propositions.log 2>&1
0 2 1 * * cd /chemin/du/dashboard && npx tsx scripts/figer-ca.ts >> /var/log/pilot-ca.log 2>&1
*/15 * * * * cd /chemin/du/dashboard && npx tsx scripts/geocoder.ts >> /var/log/pilot-geocodage.log 2>&1
```

`geocoder.ts` (lot U, `npm run geocoder`) rattrape la position des centres restés
« à faire ». Le serveur géocode chaque centre juste après l'écriture, dans une
file en mémoire, bornée à 500 centres : les tâches en attente sont perdues à
l'arrêt du processus (redémarrage, déploiement), la file se vide après cinq
échecs du service d'affilée, et un centre refusé par une file pleine reste à
faire. Le rattrapage planifié reprend tous ces centres. Rejouable : chaque
position s'écrit sous condition (même statut, même adresse), un second passage
ne refait que ce qui reste. Dix requêtes par seconde au plus, pause demandée par
`Retry-After` après un refus pour débit, arrêt après cinq échecs du service
d'affilée. Les logs portent l'identifiant du centre et le statut, jamais
l'adresse.

Variable d'environnement `PILOT_GEOCODAGE` : absente ou `1`, le géocodage est
actif (seule l'adresse du site part vers `data.geopf.fr`, le service public de
la Géoplateforme) ; `0` coupe tout appel, au serveur comme dans
`scripts/geocoder.ts`, qui s'arrête alors sans rien écrire (code de sortie 1).
Le seed et le serveur de vérification la posent à `0`. Le géocodage est aussi
coupé pendant `npm test` (`NODE_ENV=test`). Sur le VPS, la poser à `1` (ou ne
pas la poser) pour le serveur et pour la ligne de crontab.

`figer-ca.ts` fige le mois précédent dans `CrmCaMensuel` (CHOIX.md, C-16).
Rejouable : une clé déjà figée n'est jamais réécrite, et une seconde exécution
n'écrit rien ni ne journalise. Il lit les compteurs par
`src/lib/ca/compteurs.ts`, seul fichier à changer quand la source des compteurs
variables sera tranchée (`Call`, `CallConversation` ou remontée Konnect, §7).

Au Dashboard, les `.sh` de `scripts/db-maintenance/` tournent en cron système
**hors dépôt** sur le VPS : poser la ligne dans le dépôt ne suffit pas à la
déployer. Vérifier avant de fixer la fréquence le coût réel de
`evaluerPlusieurs` sur le parc, une fois branché sur `evaluerCentre`.

## 7. Ce qui reste à décider avant le lot 2

- Le modèle tarifaire réel (forfait, usage, par site, par poste). Il fixe la
  structure des lignes de contrat. Le dossier produit le signale comme non décrit
  dans le workspace, et place sa validation « avant le lot 3 » alors que le
  chiffre d'affaires est le lot 2 : incohérence à lever.
- D'où viennent les compteurs de la part variable. En local, `Call` fait office
  de compteur. Au Dashboard, il faudra trancher entre `Call`, `CallConversation`
  et la remontée Konnect — le `CONTRACT.md` signale d'ailleurs que `Call` et
  `CallConversation` coexistent pour un même appel.
- L'import de l'historique existant (tableur, mails) au démarrage.
