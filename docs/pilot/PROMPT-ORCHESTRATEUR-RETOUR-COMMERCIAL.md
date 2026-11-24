# Prompt d'orchestration : retour du directeur commercial (incréments Q à U)

À coller tel quel dans une nouvelle session ouverte sur ce dépôt. Tu es
l'orchestrateur : tu ne codes presque rien toi-même, tu découpes, tu délègues à
des sous-agents, tu relis, tu fais réviser, tu tranches et tu commits.

---

## 0. Avant tout

1. Lis dans l'ordre : `CLAUDE.md`, `C:\Users\matau\.claude\CLAUDE.md` (hygiène
   des branches), `CHOIX.md` (en entier, au moins C-05, C-07, C-08, C-10,
   C-22, C-27, C-36, C-39, C-44 à C-46, C-50, C-53 à C-55, C-58, C-59, C-62 à
   C-66), `docs/VOCABULAIRE.md`, `docs/INTEGRATION-DASHBOARD.md`. Puis ce
   prompt jusqu'au bout.
2. **Branche.** La branche de travail actuelle
   (`claude/increments-a-l-dev-4addd2`) a 38 commits d'avance sur `main`, et
   `main` n'en a aucun d'avance sur elle. La règle globale impose de brancher
   depuis un `main` à jour. **Demande à l'utilisateur** s'il faut avancer
   `main` en avance rapide sur cette branche (`git merge --ff-only`) avant de
   créer `feat/retour-commercial` depuis `main`. Ne fais rien sur `main` sans
   son accord. Aucun remote : rien ne part sur GitHub.
3. Vérifie que la base de départ est saine : `npm test`, `npm run lint`,
   `npm run build`. Note le nombre de tests qui passent : c'est la référence.
   Si quelque chose échoue avant toute modification, signale-le et arrête-toi.

## 1. La source

Retour du directeur commercial après sa prise en main de Pilot, novembre 2026.
Résumé : la première version est adoptée sans formation, et « Demander à un
collègue » est très apprécié. Il demande :

1. Un barème de qualification objectif (taille du centre, salles, RIS,
   décideur, budget, calendrier) qui donne froid / tiède / chaud.
2. Saisir un nouveau RIS directement à la création du prospect.
3. Préciser quel robot concurrent est en place, et tenir des fiches concurrents
   (ce qu'ils proposent, leur grille tarifaire en vigueur).
4. Un passage clair de prospect à client (« Convertir en client »), qui garde
   l'historique.
5. Un montant sur un prospect et sur une négociation.
6. Une proposition préremplie avec la grille tarifaire en vigueur. On garde les
   gestes commerciaux (remise en %, installation offerte, salle offerte). On
   peut sortir de la grille (facturation spécifique, mission ponctuelle comme
   une vente de RIS).
7. Des commentaires sur un compte, avec le choix de qui est prévenu : tout le
   monde, un département ou une personne.
8. Une carte des prospects et des clients, combinée à la cartographie des
   concurrents.
9. Une barre de recherche fixée en haut de la page.

**Constat de l'analyse :** cinq demandes portent sur des choses qui existent
mais ne se voient pas :
- les opportunités chiffrées sont dans l'onglet Argent ;
- les cinq cases de qualification donnent un score « 3/5 » ;
- le champ RIS accepte déjà un texte libre (datalist) ;
- prospect et client sont la même fiche ;
- la grille tarifaire est enfermée dans l'apport d'affaires (`CrmParametresApport`).

Une bonne partie du travail consiste donc à rendre visible et à brancher
l'existant, pas à le dupliquer. **Ne crée jamais une deuxième vérité.**

## 2. Décisions déjà prises par l'utilisateur (ne pas rouvrir)

| Sujet | Décision |
|---|---|
| Barème | Température **calculée** depuis la fiche, **forçable** à la main (comme `probabiliteForcee`, C-44). L'écran montre le calcul et le forçage. La priorité A+/A/B/C reste le jugement manuel du commercial. |
| Grille | La grille de l'apport d'affaires **est la grille officielle, mais incomplète** : Desk et NoShow n'ont pas de prix. Elle devient une page Tarifs commune et datée. |
| Carte | Carte interactive : Leaflet + fonds OpenStreetMap, géocodage par le service national d'adresses. Entrée CHOIX.md obligatoire (nouvelle bibliothèque). |
| Alertes des commentaires | **Dans Pilot seulement**, comme les demandes (bloc « Pour vous », pastille). Un département sur chaque compte de l'équipe. Pas d'e-mail. |
| Ordre | Q ergonomie, R concurrents et barème, S tarifs et propositions, T commentaires, U carte. |

### Valeurs proposées, en attente de validation par le directeur commercial

Code-les comme **référentiel dans le code** (comme la check-list, C-05) : les
changer ne demande ni migration ni réécriture.

- **Barème** :

| Critère | Points |
|---|---|
| Taille : 6 salles ou plus / 3 à 5 / moins ou inconnu | 2 / 1 / 0 |
| RIS : Xplore / autre RIS connu / inconnu | 2 / 1 / 0 |
| Décideur parmi les contacts / prescripteur seulement | 2 / 1 |
| Budget évoqué | 2 |
| Date de décision dans les 3 mois / connue mais plus lointaine | 2 / 1 |
| Besoin exprimé | 1 |

  - Seuils : 0 à 4 froid, 5 à 8 tiède, 9 et plus chaud.
  - Garde-fou : sans décideur identifié, jamais « chaud ».
  - Seulement avant la signature.
  - Le critère RIS dépend de la question ouverte « Desk vise-t-il d'autres RIS ? » : écris-le dans l'entrée CHOIX.
- **Départements** : Commercial, Projet, Technique, Direction.

### Conversion en client : règle tranchée le 18/11/2026

`transitionPermise` (`src/lib/pipeline.ts`) n'autorise qu'un pas à la fois.
Un prospect ne peut donc pas passer directement en Signé. **Décision de
l'utilisateur** : la conversion franchit les étapes intermédiaires dans une
seule transaction. Chaque passage est une transition ordinaire, validée par
`transitionPermise` et journalisée avec la mention « à la conversion ». La
règle n'est jamais contournée, et la chronologie montre les étapes franchies le
même jour.

Écarté : un bouton qui n'agirait qu'à l'étape Proposition. Trop de clics pour
une signature rapide (vente de RIS au premier rendez-vous), alors que le retour
reproche justement un passage peu clair.

Conséquence à écrire dans CHOIX : ces fiches comptent zéro jour dans les
étapes sautées. Les mesures de vieillissement par étape doivent l'accepter
sans erreur.

## 3. Règles non négociables

Celles de `CLAUDE.md` priment sur tout ce prompt :
- aucune donnée patient ;
- Pilot ne modifie jamais la configuration du Dashboard ;
- une étape automatique ne se coche jamais à la main ;
- les énumérations ne se renomment jamais (on ajoute, on ne retire rien) ;
- un développeur ne voit jamais la page Chiffre d'affaires (C-64) ;
- argent en centimes entiers, jamais de flottant ;
- aucune donnée patient dans les logs.

En plus, pour ce chantier :
- **Schéma** : chaque évolution se fait à deux endroits. Un nouveau fichier SQL
  manuel, additif et idempotent, dans `prisma/migrations/manual/` (numérotation
  à la suite de `2026_12_11_…`), et le modèle Prisma correspondant. Une colonne
  abandonnée reste en base. Jamais de modification des modèles « miroir
  Dashboard » (dont `Product` et `User`).
- **Texte libre** (commentaires, conditions de concurrent, notes) : jamais dans
  le journal (`CrmEvenement`), jamais dans les logs (C-22, C-27). Le journal
  porte le type, la cible, l'auteur, jamais le contenu.
- **Texte cherché** : jamais dans une URL (C-36).
- **Calculé à la lecture**, jamais stocké, comme les alertes (C-08) : la
  température. Seul le forçage humain est stocké.
- **Écrans** :
  - aucun défilement horizontal, mesuré aussi dans les zones internes (C-50) ;
  - style Apple sobre, MUI 5, thème existant (C-53 à C-55) ;
  - un seul bouton plein par vue ;
  - phrases courtes, aucun tiret cadratin, aucun emoji ;
  - une case vide dit pourquoi et comment la remplir ;
  - libellés lisibles par un nouvel utilisateur, ajoutés à `docs/VOCABULAIRE.md`.
- **Gardes côté serveur**, toujours. L'interface n'est jamais la seule
  barrière. Les droits sont relus à chaque appel (`droitsEffectifs`).
- **Concurrence** : écriture conditionnelle, 409 au second (C-26).
- **Seed** : noms neutres (C-10), et chaque nouveau cas y figure.
- Toute décision prise en cours de route va dans `CHOIX.md` : quoi, pourquoi,
  ce qui a été écarté. Une entrée par incrément au moins, numérotée à la suite
  de C-67.

## 4. Comment tu orchestres

### 4.1 Puissance des sous-agents

Utilise l'outil Agent. Choisis le modèle et l'effort selon la complexité. Le
tableau des missions (§5) donne le niveau pour chacune. Les règles générales :

| Niveau | Modèle / effort | Pour |
|---|---|---|
| Léger | `haiku`, effort `low` | Repérage en lecture seule (agent `Explore`), inventaire de fichiers, vérification mécanique d'un libellé ou d'un glossaire. |
| Standard | `sonnet`, effort `medium` | Écran ou route qui suit un modèle déjà présent dans le dépôt, script de vérification, seed. |
| Soutenu | `sonnet`, effort `high` | Écran nouveau avec logique, API complète avec validation et journal, intégration d'une bibliothèque. |
| Expert | `opus`, effort `high` | Schéma et migrations, moteurs purs qui touchent l'argent ou le chiffre d'affaires, transactions qui changent une étape, revues de lot. |

Types d'agents à utiliser :
- `Explore` pour le repérage ;
- `general-purpose` pour l'implémentation ;
- `agent-skills:test-engineer` pour la revue des tests ;
- `agent-skills:code-reviewer` pour les revues de lot ;
- `agent-skills:security-auditor` pour les lots T et U ;
- `Plan` si une mission demande d'abord un plan détaillé.

### 4.2 Le brief d'une mission

Chaque sous-agent ne connaît que son brief. Il contient toujours :
1. L'objectif et le critère « fini quand », repris du §5.
2. Les fichiers à lire d'abord (CLAUDE.md, les entrées CHOIX citées, les
   fichiers existants à imiter), et le **périmètre exact** des fichiers qu'il a
   le droit de modifier.
3. Les règles du §3 qui le concernent, recopiées, pas résumées par un renvoi.
4. L'exigence de tests :
   - toute fonction pure nouvelle a ses tests Vitest, écrits **avant** le code
     quand c'est un moteur (barème, préremplissage, gestes, chiffre d'affaires) ;
   - il lance `npm test`, `npm run lint` et `npm run build` avant de rendre.
5. L'interdiction de committer, de toucher `main`, d'installer une dépendance
   non prévue, ou de modifier un fichier hors périmètre.
6. Le format du compte rendu :
   - fichiers modifiés ;
   - tests ajoutés et leur nombre ;
   - résultat des trois commandes ;
   - écarts par rapport au brief ;
   - questions ouvertes ;
   - ce qui n'a pas pu être vérifié.

### 4.3 Parallélisme et fichiers partagés

- **Un seul écrivain à la fois** pour `prisma/schema.prisma`,
  `prisma/migrations/manual/`, `prisma/seed.ts`, `scripts/verifier.ts`,
  `CHOIX.md` et `docs/VOCABULAIRE.md`. Le schéma d'un lot est toujours la
  première mission du lot, seule. **Tu écris toi-même** les entrées `CHOIX.md`
  et `VOCABULAIRE.md`, à partir des comptes rendus.
- Après la mission schéma, les missions d'un même lot qui touchent des
  fichiers disjoints peuvent tourner en parallèle, avec `isolation:
  "worktree"`. Tu fusionnes ensuite. Au moindre recouvrement de fichiers, tu
  fais tourner les missions l'une après l'autre.
- Les lots se suivent. Ne lance pas un lot tant que le précédent n'est pas
  commité.

### 4.4 Revues et tests, à chaque étape

**Après chaque mission :**
- lis le diff (`git diff --stat`, puis les parties sensibles) ;
- relance `npm test`, `npm run lint` et `npm run build` ;
- un compte rendu n'est pas une preuve : vérifie.

**À la fin de chaque lot :**
1. **Revue de code indépendante** : un agent `agent-skills:code-reviewer` en
   `opus`, effort `high`. Donne-lui le diff du lot, les règles du §3 et les
   critères du lot, **pas tes conclusions**. Il classe ses remarques en
   bloquant, important et mineur.
   - Les bloquants et les importants sont corrigés par un agent
     d'implémentation, puis une nouvelle revue a lieu, jusqu'à ce qu'il ne
     reste aucun bloquant.
   - Les mineurs écartés sont notés dans le compte rendu du lot.
2. **Revue des tests** : un agent `agent-skills:test-engineer` en `sonnet`,
   effort `high`, pour les lots R et S (moteurs). Il cherche les cas limites
   manquants : bornes, arrondis au centime, valeurs nulles, forçage, dates.
3. **Revue de sécurité** : un agent `agent-skills:security-auditor` en
   `opus`, effort `high`, pour T (texte libre, destinataires, droits) et U
   (appels sortants, en-têtes). Ou la skill `anthropic-skills:security-review`.
4. **Vérification HTTP** : un script `scripts/verifier-<lettre>.ts` branché
   dans `scripts/verifier.ts`, sur le modèle de `verifier-p.ts`. Il couvre les
   gardes (droits, rôle développeur, 409, validation, valeurs refusées). Lance
   `npm run dev`, puis `npm run verifier`, puis `npm run seed`.
5. **Performance** : `npm run mesurer` si la fiche ou une liste gagne des
   données (Q, R, S). Aucune requête par ligne (pas de N+1).
6. **Vérification à l'écran**, dans le navigateur intégré
   (`preview_start {name: "pilot"}`) :
   - chaque écran touché, à 375 px et à 1440 px ;
   - mesure en JavaScript qu'aucun élément ne dépasse
     (`scrollWidth <= clientWidth`, page et zones internes) ;
   - clavier : Tab, Échap, Ctrl+K ;
   - captures d'écran à l'appui.
7. Mets à jour `CHOIX.md`, `docs/VOCABULAIRE.md` et, si un fichier s'ajoute
   ou si une dépendance arrive, `docs/INTEGRATION-DASHBOARD.md`.
8. **Un commit local par lot.** Message en français, au format des commits
   existants : `feat(pilot): …`, un paragraphe qui dit pourquoi, la référence
   CHOIX. Termine-le par la ligne d'attribution du dépôt.
9. Compte rendu court à l'utilisateur : ce qui marche, ce qui reste, ce qui
   n'a pas été vérifié. Puis enchaîne sur le lot suivant, sauf si un point du
   §6 bloque.

## 5. Les lots et leurs missions

### Lot Q : ergonomie (rendre visible l'existant)

| # | Mission | Niveau | Fini quand |
|---|---|---|---|
| Q1 | **Recherche fixe.** `src/components/Recherche.tsx` et `Coquille.tsx` : la boîte au centre de l'écran devient un champ dans la barre du haut, avec les résultats en liste déroulante juste en dessous. Ctrl+K place le curseur dans le champ, Échap le vide et le quitte, les flèches parcourent les résultats. Sur téléphone, une loupe dans la barre ouvre le champ sur toute la largeur. On garde le POST, le début de mot et l'absence de journal (C-36), ainsi que « Créer le prospect … ». | Soutenu | Le champ reste visible au défilement sur toutes les pages, il marche au clavier, et aucune barre horizontale n'apparaît à 375 px. |
| Q2 | **RIS et outil de RDV appris.** Les suggestions = la liste du code (`EDITEURS_RIS`, `OUTILS_RDV`) + les valeurs distinctes déjà saisies (organisations et centres), dédoublonnées par famille (`familles.ts`, C-66). Une seule lecture, pas de requête à chaque frappe. Texte d'aide : « Choisissez dans la liste ou saisissez-le. » S'applique à la fiche rapide (`NouveauProspect.tsx`) et à `ChampsOrganisation.tsx`. | Standard | Un RIS saisi sur un prospect est proposé à la création du suivant. Une fonction pure de fusion est testée. |
| Q3 | **Montant visible.** (a) Un champ « Montant estimé par mois » dans la fiche rapide, prérempli par une fonction pure `estimerMontant(salles, offres, grille)`. La grille est lue par **un seul accès**, `lireGrilleEnVigueur()`, qui lit `CrmParametresApport` jusqu'au lot S, où seule sa source changera. Le montant crée une **opportunité** (`CrmOpportunite`) dans la transaction de création : pas de nouvelle colonne, pas de deuxième vérité. (b) Les cartes du tableau Prospects et l'en-tête de la fiche montrent le montant mensuel. En négociation, c'est le total de la dernière proposition qui l'emporte. Le libellé dit d'où vient le chiffre (« estimé », « proposition v2 »). (c) L'onglet Argent reste, mais la Négociation montre les opportunités. | Soutenu | Un prospect créé avec un montant l'affiche sur sa carte et dans sa fiche. `npm run mesurer` ne gagne aucune requête par ligne. Tests de `estimerMontant`. |
| Q4 | **Convertir en client.** Règle du §2 : on franchit les étapes intermédiaires. Un bouton sur la fiche, à toutes les étapes avant la signature. S'il existe une proposition envoyée ou en discussion, le bouton ouvre son acceptation (C-39, qui crée le contrat). L'acceptation franchit elle aussi les étapes manquantes, au lieu de laisser « l'étape reste à changer ». Sinon, une boîte courte : date de signature, début officiel facultatif. Elle crée un contrat en brouillon daté. Dans les deux cas, une fonction pure `cheminVersSigne(depuis)` donne la suite des étapes, et chacune passe par `changerEtapeDansTransaction`, dans une seule transaction. Ventes le liste alors « À compléter » (C-62). L'écran rappelle que la fiche, les contacts et la chronologie restent les mêmes. Garde serveur, journal, 409. | Expert | On convertit depuis chaque étape avant Signé, y compris depuis Prospect, sans jamais contourner `transitionPermise`. Le journal montre chaque passage avec « à la conversion ». Une erreur au milieu annule tout. Tests de `cheminVersSigne` (chaque étape de départ, étapes de sortie refusées), cas HTTP dans `verifier-q.ts`. |

### Lot R : concurrents et barème

| # | Mission | Niveau | Fini quand |
|---|---|---|---|
| R1 | **Schéma.** `CrmConcurrent` : nom unique, type (énumération `CrmTypeConcurrent` : ROBOT_VOCAL, CENTRE_APPELS, SECRETARIAT_EXTERNALISE, EDITEUR_RDV, AUTRE), offre (texte), site web, notes. `CrmReleveConcurrent` : relevé daté (`releveLe`), prix repère par salle et par mois et prix d'installation en centimes (facultatifs), conditions en texte, source. « En vigueur » = le relevé le plus récent. Sur `CrmOrganisation` : `concurrentId` (en place) et `concurrentGagnantId` (affaire perdue contre lui, avec `raisonSortieCode` CONCURRENT). Forçage de la température : `temperatureForcee` (énumération `CrmTemperature` : FROID, TIEDE, CHAUD), `temperatureForceeParId`, `temperatureForceeLe`. Nouvelles valeurs de `CrmTypeEvenement`, ajoutées en fin d'énumération. SQL manuel et Prisma. | Expert | `npm run db:manual` est rejouable deux fois sans erreur, `db:generate` passe, `build` passe. |
| R2 | **Moteur du barème.** `src/lib/organisations/temperature.ts`, fonction pure. Elle prend la fiche et les rôles des contacts, et rend la température, les points par critère, les raisons en clair (« Tiède : pas de décideur identifié ») et l'état du forçage. Référentiel des points et des seuils en tête de fichier (§2). Le décideur se lit dans les contacts (`roleDecision`), le calendrier dans `decisionAttendueLe`, la taille dans les salles (salles déclarées, sinon somme des équipements). Les cases `qualifDecideur` et `qualifCalendrier` restent en base mais ne comptent plus : une seule source par critère. Écris-le dans CHOIX. Tests d'abord : chaque critère, chaque seuil, le garde-fou du décideur, valeurs inconnues, forçage, étapes après signature. | Expert | Au moins 25 cas de test. `qualification.ts` est soit remplacé, soit appelé, sans logique en double. |
| R3 | **API concurrents et forçage.** Routes CRUD des concurrents et de leurs relevés (validation zod, journal sans le texte libre, 409), lien organisation → concurrent, forçage et retrait du forçage de la température. Droits : tout compte de l'équipe lit ; création et modification selon les droits existants, à justifier dans CHOIX. | Soutenu | Cas HTTP dans `verifier-r.ts` : création, doublon de nom refusé, relevé, forçage, retrait, 409. |
| R4 | **Écrans.** (a) Page Concurrents sous « Plus » : liste, fiche avec les relevés datés (le plus récent marqué « en vigueur », l'ancienneté visible), centres équipés, affaires perdues contre lui. (b) Fiche rapide et fiche organisation : quand l'outil de RDV ou la solution actuelle désigne un concurrent, un champ « Lequel ? » pioche dans la liste ou en crée un à la volée. (c) Sortie en Perdu pour raison concurrent : « Contre qui ? ». (d) La température apparaît sur la fiche, avec le détail des points et le bouton « Corriger », sur les cartes du tableau, et dans la liste À prospecter, avec un filtre et un tri. Une température forcée affiche « Forcée chaud par X le 18/11, le calcul dit tiède ». La liste se charge sans N+1. | Soutenu | Captures à 375 et 1440 px, aucune barre horizontale, `mesurer` stable. Le seed couvre un froid, un tiède, un chaud et un forcé, ainsi que deux concurrents avec des relevés. |

### Lot S : tarifs et propositions

| # | Mission | Niveau | Fini quand |
|---|---|---|---|
| S0 | **Repérage.** Les propositions et les contrats sont-ils en HT ? Comment `prixHt()` convertit la grille TTC de l'apport ? Où le moteur du chiffre d'affaires (C-45), le réel figé (C-46) et l'export lisent-ils `CrmTypeLigne` et `productId` ? Rends une carte des points d'impact. | Léger (`Explore`) | Liste des fichiers et des fonctions touchés. |
| S1 | **Schéma.** `CrmGrilleTarifaire` : `applicableLe`, notes, auteur. Une grille est modifiable tant qu'aucune proposition ne l'utilise ; ensuite, on en crée une nouvelle. `CrmTarif` : grille, produit, type de ligne, base (énumération `CrmBaseTarif` : PAR_SALLE, PAR_SITE, PAR_ORGANISATION, POURCENTAGE), montant HT en centimes **facultatif** (vide = « Prix à renseigner »), pour-mille pour un pourcentage. `CrmProposition.grilleId`. `CrmTypeLigne` gagne `PRESTATION`. `productId` devient facultatif sur `CrmLigneProposition` et `CrmLigneContrat` (libellé obligatoire sans produit, garde dans la validation). `offerte` (booléen) sur les deux tables de lignes. La première grille est créée par le SQL manuel à partir de `CrmParametresApport`, convertie **exactement** comme `prixHt()`. Desk et NoShow y figurent sans prix. | Expert | Rejouable deux fois, `build` passe. |
| S2 | **L'apport lit la grille commune.** `lireGrilleEnVigueur()` lit désormais `CrmGrilleTarifaire`. L'apport d'affaires ne porte plus sa grille ; les colonnes de `CrmParametresApport` restent en base, non lues, et c'est écrit dans CHOIX. **Test de non-régression d'abord** : les commissions et le prévisionnel du seed sont identiques au centime avant et après. | Expert | Le test de non-régression passe, et les captures de l'onglet Paramètres de l'apport renvoient vers Tarifs. |
| S3 | **Moteurs purs.** `preremplir(grille, centres, offres)` : une ligne par centre et par produit offert (`offreTalk`, `offreKonnect`, `offreConnecteurRis`), multipliée par les salles du centre (`CrmSalle`, sinon la répartition de `nombreSalles`), plus l'installation selon le mode. Un tarif sans prix donne une ligne à 0, marquée « prix à renseigner » : jamais un prix inventé. Gestes : une ligne `offerte` a un net de 0 et garde son brut affiché. Les totaux (`totauxProposition`) exposent le brut, la remise, les gestes et le net. Le chiffre d'affaires (C-45, C-46, export) compte une `PRESTATION` une seule fois, au début officiel, comme une mise en service. Tests d'abord, arithmétique entière, arrondi par ligne (C-39). | Expert | Tests des trois moteurs, cas limites revus par `test-engineer`. Projection et réel du seed inchangés hors des nouveaux cas. |
| S4 | **API.** Grilles : lister, créer, modifier tant qu'elle n'est pas utilisée, sinon 409 avec la raison. Droit « modifier les montants ». Proposition créée vide ou préremplie depuis la grille en vigueur, `grilleId` figé. Lignes hors grille et lignes offertes validées. À l'acceptation, la copie vers le contrat garde `offerte` et le libellé. | Soutenu | Cas HTTP dans `verifier-s.ts` : grille utilisée non modifiable, développeur sans droit refusé, ligne sans produit ni libellé refusée, acceptation avec une ligne offerte. |
| S5 | **Écrans.** (a) Page Tarifs sous « Plus » : grille en vigueur, grilles passées, prochaine grille datée, « Prix à renseigner » visible pour Desk et NoShow, avec l'invitation à le remplir. (b) Dialogue de proposition : bouton « Préremplir avec la grille du JJ/MM/AAAA », ligne « Hors grille » (libellé, montant, type, produit facultatif), case « Offert » par ligne, remise en %, récapitulatif brut, remise, gestes et net. (c) Ventes et fiche : les gestes apparaissent en clair. | Soutenu | Captures, aucune barre horizontale, clavier. Le seed contient une proposition préremplie avec une salle offerte et une vente de RIS hors grille. |

### Lot T : commentaires avec alerte

| # | Mission | Niveau | Fini quand |
|---|---|---|---|
| T1 | **Schéma.** `CrmAccesPilot.departement` (énumération `CrmDepartement` : COMMERCIAL, PROJET, TECHNIQUE, DIRECTION, facultatif). Vérifie comment le super-administrateur, sans ligne d'accès selon C-64, reçoit un département, et choisis la voie la plus simple qui ne touche pas au miroir `User`. `CrmCommentaire` : organisation, auteur, texte (2 000 caractères au plus), cible (énumération `CrmCibleCommentaire` : TOUS, DEPARTEMENT, PERSONNE), département ciblé, date. `CrmDestinataireCommentaire` : commentaire, destinataire, `luLe`. Les destinataires sont figés à l'écriture : qui était dans le département à ce moment-là. L'auteur n'en fait jamais partie. | Expert | Rejouable, `build` passe. |
| T2 | **API.** Écrire (calcul des destinataires dans une fonction pure testée), lister par organisation, marquer lu. Seul l'auteur supprime, et un super-administrateur aussi. Le journal porte la cible et le nombre de destinataires, **jamais le texte**. Aucun log du texte. Les droits : un compte retiré ne reçoit rien. | Soutenu | Tests de la fonction des destinataires (tous, département vide, personne, auteur exclu, accès retiré). Cas HTTP dans `verifier-t.ts`. |
| T3 | **Écrans.** (a) Fiche, onglet Résumé : fil des commentaires, zone d'écriture, sélecteur « Prévenir : personne / tout le monde / un département / une personne ». Le département et la personne sont choisis dans une liste. (b) Aujourd'hui : « Pour vous » réunit les demandes et les commentaires non lus, du plus récent au plus ancien. Ouvrir un commentaire le marque lu. (c) Pastille dans le menu. (d) Écran Équipe : le super-administrateur choisit le département de chaque compte. | Soutenu | Captures, clavier, aucune barre horizontale. Le seed contient un commentaire à un département lu par un compte et pas par l'autre. Revue de sécurité passée. |

### Lot U : carte

| # | Mission | Niveau | Fini quand |
|---|---|---|---|
| U0 | **Vérifications externes.** Avant tout code : (1) le point d'accès actuel du géocodage national. L'ancien `api-adresse.data.gouv.fr` a été remplacé par le service de la Géoplateforme (`data.geopf.fr/geocodage`) : confirme-le sur la documentation officielle, avec les limites de débit et le format de réponse. (2) La politique d'usage des tuiles OpenStreetMap : attribution obligatoire, en-tête Referer exigé, alors que `next.config.js` impose `Referrer-Policy: same-origin`. Prévois l'option `referrerPolicy` de la couche de tuiles Leaflet. (3) Les versions compatibles React 18 / Next 14 : `leaflet` 1.9.x, `react-leaflet` 4.x et les types, chacune publiée depuis plus de deux semaines. | Léger (`general-purpose`, `haiku`) | Compte rendu sourcé. **Toi**, tu écris l'entrée CHOIX : bibliothèque, service, données envoyées (adresses publiques d'établissements, jamais de donnée patient), alternatives écartées (carte par département sans dépendance, Google Maps). |
| U1 | **Schéma et géocodage.** `CrmCentre` : `latitude` et `longitude` (`Decimal(9,6)`), `geocodageStatut` (énumération : A_FAIRE, OK, AMBIGU, INTROUVABLE), `geocodeLe`, score. `src/lib/carte/geocoder.ts` : une fonction pure qui analyse la réponse (testée sur des réponses enregistrées) et un appel réseau vers un seul hôte fixe. Le géocodage se fait **après le commit**, à la création d'un centre ou au changement de son adresse (même principe que C-22), et n'est jamais bloquant. `npm run geocoder` rattrape les centres existants avec un débit limité. Les logs portent l'identifiant du centre et le statut, jamais l'adresse. | Expert | Tests de l'analyse (trouvé, ambigu, rien, erreur réseau), script rejouable, aucun appel pendant `npm test`. |
| U2 | **Écran Carte** (`/pilot/carte`, sous « Plus »). Chargement côté client uniquement (`dynamic`, `ssr: false`). Marqueurs par centre : prospects colorés par température, clients, avec la légende. Filtres : prospects / clients, température, concurrent en place, commercial, famille de RIS. Filtres dans l'adresse, aucun texte saisi (C-36). Un clic ouvre une bulle : nom, étape, montant, lien vers la fiche. La cartographie des concurrents passe par le filtre « concurrent en place » et une teinte par concurrent. Un concurrent n'a pas d'adresse chez nous : ce sont ses centres équipés qui s'affichent. Une liste « Pas encore localisés » dit pourquoi pour chaque centre (adresse manquante, adresse ambiguë…). Plein écran sur téléphone, attribution OpenStreetMap visible. | Soutenu | Captures à 375 et 1440 px, aucune barre horizontale, les tuiles se chargent (Referer correct), le seed contient des centres géolocalisés hors ligne (coordonnées écrites dans le seed, sans appel réseau). Revue de sécurité passée. |

## 6. Quand tu t'arrêtes pour demander

Utilise AskUserQuestion. Ne demande que ce qui revient à l'utilisateur :
- la branche (§0) ;
- un conflit entre une demande et une règle de `CLAUDE.md` ou du dossier
  produit : signale-le, ne le contourne pas ;
- une dépendance autre que celles prévues en U ;
- une revue qui laisse un bloquant après deux tours de correction.

Ne demande pas les prix de Desk et de NoShow : la page Tarifs les montre « à
renseigner », et l'utilisateur les saisira. Ne demande pas les valeurs du
barème ou des départements : elles sont codées en référentiel et seront
ajustées après la validation du directeur commercial.

## 7. Fin du chantier

1. Une revue finale de l'ensemble des lots Q à U par un agent
   `agent-skills:code-reviewer` en `opus`, effort `high`, sur le diff complet
   depuis le point de départ. Elle cherche en priorité les doubles vérités, les
   gardes absentes côté serveur, du texte libre dans le journal ou les logs, et
   de l'argent en flottant.
2. `npm test` (le nombre de tests est supérieur à la référence du §0),
   `npm run lint`, `npm run build`, `npm run verifier` sur une base fraîche,
   puis `npm run seed`, et `npm run mesurer`.
3. `docs/RETOUR-COMMERCIAL-LIVRE.md` : pour le directeur commercial, une page
   en phrases courtes. Pour chacune de ses demandes, ce qui a changé et où le
   trouver. Mentionne ce qui existait déjà et où cela se trouve maintenant.
   Indique ce qu'il doit valider (barème, départements, prix de Desk et
   NoShow). Aucun vocabulaire technique.
4. Ne fusionne rien dans `main` sans l'accord de l'utilisateur. Rends-lui la
   liste des commits, les entrées CHOIX créées, et ce qui n'a pas pu être
   vérifié.
