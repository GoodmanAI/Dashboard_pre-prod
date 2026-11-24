# LYRAE PILOT — brief pour un agent d'amélioration

Document autoportant. Il décrit le projet, son but, ses fonctions, ce qui est
construit, ce qui ne l'est pas, et les règles qu'une amélioration ne doit pas
casser. Lire aussi `CHOIX.md` (décisions et alternatives écartées) et
`docs/INTEGRATION-DASHBOARD.md` (greffe dans le dépôt cible).

État au 26/10/2026 : lot 1 livré, commit `0a801ec` sur `main`, 4 400 lignes de
code, `npm run build` vert.

---

## 1. Le contexte : l'écosystème Lyrae

Lyrae est une suite de produits pour les **centres de radiologie français**,
éditée par NEURACORP AI. Six briques existent déjà :

| Brique | Rôle | État |
|---|---|---|
| **LyraeTalk** | Agent vocal téléphonique qui répond aux patients et prend des RDV | En production, 13 cabinets, ~142 appels/jour |
| **Konnect** | Portail patient en marque blanche : ordonnance photographiée, OCR, RDV en ligne | Avancé |
| **AI2Xplore** | Seule passerelle vers le RIS Xplore (éditeur EDL) + relances SMS | En production |
| **Dashboard** | Base de vérité de la configuration **et API centrale** du produit. Next.js 14, Prisma, PostgreSQL | En production |
| **Azure Functions** | Compréhension du langage pour le robot | En production |
| **Daily Report** | Rapport quotidien par mail | En production |

Deux produits sont en cours d'ajout : **Lyrae Desk** (poste de travail des
secrétaires, non commencé) et **Lyrae Pilot**, objet de ce dépôt.

Un client Lyrae est une **organisation** (groupe privé, hôpital, GIE, cabinet)
qui possède un ou plusieurs **centres** (sites). Chaque centre peut souscrire à
un ou plusieurs **produits**. Mettre un centre en service demande une
intégration technique réelle : jeton d'accès au RIS obtenu auprès d'EDL, code
centre rattaché, mapping des examens, réglages du robot, numéro de téléphone,
formation des secrétaires.

---

## 2. Le but de Pilot

**Donner à toute l'équipe Lyrae la même vue : qui est prospect, qui est en
intégration et à quelle étape, qui est en production, qui est parti, et ce que
l'ensemble rapporte.**

Aujourd'hui cette information vit dans des fils de mails et des tableurs. Le
problème n'est pas de la stocker, c'est qu'elle soit **vraie sans ressaisie** :
le Dashboard sait déjà si le mapping d'examens d'un centre est fait ou si son
numéro est posé. Pilot lit ces faits et coche la check-list tout seul. Les
étapes que le système ne peut pas constater (une visio, une formation) restent
manuelles.

Second but, prévu mais pas encore construit : afficher le chiffre d'affaires
signé, en cours et projeté, et laisser simuler l'avenir en cochant ou décochant
des prospects.

Nom provisoire : le dossier produit laisse la question ouverte, à côté d'un
autre outil interne appelé Véga.

### Les utilisateurs

| Profil | Usage principal |
|---|---|
| Direction | Chiffre d'affaires, prévisions, scénarios, santé du parc |
| Commercial | Prospects, rendez-vous, relances, propositions, probabilité de signature |
| Chef de projet d'intégration | Étapes d'intégration, blocages, dates promises au client |
| Technique et support | Interfaçage RIS et téléphonie, incidents par client |

Tout le monde voit tout. Seules la direction et les commerciaux modifient les
montants des contrats.

---

## 3. Les règles qui ne se négocient pas

Elles viennent du dossier produit et de l'écosystème. **Une amélioration qui en
casse une est un échec, même si elle est élégante.**

1. **Aucune donnée patient dans Pilot.** Organisations, contacts
   professionnels, contrats, agrégats. Rien d'autre. Base légale : intérêt
   légitime, suppression sur demande.
2. **Pilot lit le Dashboard, il n'écrit jamais sa configuration.** Pas de
   double vérité.
3. **Pilot ne recalcule rien de ce que le Dashboard sait déjà.** Le registre de
   complétude du Dashboard est la source ; Pilot lit `evaluerCentre`. Écrire une
   seconde implémentation du calcul de complétude est explicitement interdit.
4. **Une étape automatique ne peut jamais être cochée à la main.** La garde est
   côté serveur, pas seulement dans l'interface.
5. **Les énumérations ne se renomment jamais.** On ajoute des valeurs ; une
   valeur abandonnée reste en place.
6. **L'argent est en centimes, en entiers.** Jamais de flottant.
7. **Aucune donnée patient dans les logs**, règle transverse de l'écosystème.
8. **Rien ne part sur GitHub.** Dépôt local, aucun remote, le commit reste ici.
   Cette consigne vient de l'utilisateur, pas du dossier produit.

Ton de l'interface : phrases courtes, aucun tiret cadratin, aucun emoji, aucune
icône « sparkles », aucun vocabulaire interne dans un écran qu'un commercial
montre à l'extérieur.

---

## 4. Où ce dépôt se situe

Le dossier produit recommande que Pilot vive **dans le dépôt dashboard**, comme
un produit de plus au sens de sa table `Product` : l'authentification, les
droits et le système visuel y sont déjà, un dépôt séparé les doublerait.

Ce dépôt-ci est donc un **atelier local**, pas la destination. Il reprend la même
pile et les mêmes conventions pour que les fichiers se transposent sans
réécriture. Conséquence directe pour toute amélioration : **ne rien introduire
qui n'existe pas déjà dans le Dashboard** (pile, bibliothèque, convention) sans
une décision écrite dans `CHOIX.md`.

`docs/INTEGRATION-DASHBOARD.md` liste fichier par fichier ce qui se copie, ce
qui se remplace et ce qui ne part pas.

---

## 5. La pile et le dépôt

Next.js 14 App Router, TypeScript strict, MUI 5, Prisma 6, PostgreSQL 18, Node
24. Alias `@/*` vers `src/*`. Même pile que le Dashboard.

```
prisma/
  schema.prisma                       modèles Crm* + miroirs du Dashboard
  migrations/manual/*.sql             SQL idempotent destiné au Dashboard
  seed.ts                             jeu de démonstration, noms neutres
scripts/apply-manual-migrations.js    applique le SQL manuel
src/lib/
  checklist/definition.ts             les 11 étapes, leur mode, leur source
  checklist/evaluer.ts                projette la complétude sur les cases auto
  checklist/cocher.ts                 cochage manuel + garde serveur
  completude/adapter.ts               adaptateur du registre de complétude
  pipeline.ts                         cycle de vie, transitions, probabilités
  alertes.ts                          les 5 alertes, calculées à la lecture
  argent.ts                           centimes, formatage, pondération
  session.ts                          bouchon d'authentification local
  prisma.ts                           client Prisma
src/app/pilot/                        les 4 écrans
src/app/api/pilot/                    3 routes
src/components/Coquille.tsx           coquille de navigation
```

Commandes :

```bash
npm run dev          # http://localhost:3100
npm run build        # next build : le seul vrai garde-fou, aucun test
npm run lint
npm run db:push      # pose le schéma local (pas de prisma migrate, voir C-11)
npm run db:manual    # applique le SQL manuel
npm run seed         # jeu de démonstration
```

---

## 6. Le modèle de données

Neuf tables préfixées `Crm`, propriété de Pilot :

| Table | Contenu |
|---|---|
| `CrmOrganisation` | Le client ou le prospect, son étape commerciale, son responsable, son RIS, son volume d'appels estimé |
| `CrmContact` | Les personnes chez le client, avec leur rôle dans la décision |
| `CrmCentre` | Un site du client, son `codeSite` Xplore |
| `CrmCentreProduit` | Rattachement centre × produit, et vers le `UserProduct` du Dashboard quand il existe. Porte la date promise |
| `CrmEchange` | Visio, mail, démo, devis : date, type, compte rendu, prochaine action |
| `CrmEtapeIntegration` | Une case de check-list par centre, produit et étape |
| `CrmContrat` / `CrmLigneContrat` | Montants par produit : mise en service, abonnement, part variable |
| `CrmOpportunite` | Un prospect chiffré : montant mensuel, probabilité, date de démarrage attendue |
| `CrmScenario` / `CrmScenarioOpportunite` | Un jeu d'opportunités cochées, enregistré sous un nom |

Et six modèles **miroir** du Dashboard (`User`, `Product`, `UserProduct`,
`UserNumber`, `ExamMapping`, `Call`), reproduits au minimum utile pour que Pilot
tourne en local. Ils portent les noms de champs exacts du Dashboard. **Ils ne
sont pas à nous : on les lit, on ne les fait pas évoluer, et ils ne partent pas
dans la migration livrée.**

### Le cycle de vie

```
COMMERCIAL     Prospect → Pourparlers → Visio technique → Proposition
                                                              ↓
LIVRAISON      Arrêté ← En production ← En intégration ← Signé
                  ↑ reconquête
```

Toute étape commerciale peut sortir en **Perdu** ou **En sommeil**, la raison
est obligatoire. Un client arrêté, perdu ou en sommeil peut repartir en
Prospect. Les transitions permises sont dans `transitionPermise`
(`src/lib/pipeline.ts`) : un cran en avant, un cran en arrière, une sortie, ou
la reconquête.

L'**organisation** porte l'étape commerciale ; chaque **centre** porte son étape
d'intégration **par produit**. Un centre peut être en production sur LyraeTalk et
en intégration sur Konnect.

---

## 7. Les fonctions construites (lot 1)

### 7.1 La check-list d'intégration

Onze étapes par centre et par produit (`src/lib/checklist/definition.ts`). Le
référentiel vit dans le code et non en base, pour qu'une évolution ne demande
pas de migration ; les lignes déjà cochées sont retrouvées par leur clé.

| Étape | Produits | Cochage | Source de la réponse |
|---|---|---|---|
| Première visio (pourparlers) | tous | manuel | Pilot |
| Visio technique (route API, accès RIS, VPN) | tous | manuel | Pilot |
| Jeton Xplore reçu d'EDL et testé | tous | **auto** | configuration AI2Xplore, sonde |
| Code centre rattaché | tous | **auto** | `ExternalCenterMapping`, `KonnectTenantMapping` |
| Mapping des examens terminé | tous | **auto** | `ExamMapping`, registre de complétude |
| Réglages du robot (consignes, FAQ, questions, SMS) | Talk | **auto** | `REGISTRE_TALK` |
| Interfaçage téléphonique (numéro, redirection, essais) | Talk, Desk | mixte | `UserNumber`, heartbeat |
| Intégration du site web (iframe) | Konnect | manuel | Pilot |
| Formation des secrétaires | Talk, Desk | manuel | Pilot, avec la liste des présents |
| Premier appel réel, premier RDV pris | tous | **auto** | `Call`, remontée Konnect |
| Passage en production déclaré | tous | manuel | `CentreStatut` |

Chaque étape porte aussi une **durée attendue en jours** et un drapeau
**bloquante**. Ces deux valeurs ne figurent pas dans le dossier produit : elles
ont été estimées et doivent être corrigées avec le chef de projet.

Quand une case automatique est vide, l'écran affiche **pourquoi** : « Mapping
incomplet : 2 examens sur 5 attendus », « Aucun UserProduct au Dashboard pour ce
centre ». C'est un parti pris du produit : un chef de projet ne doit jamais
avoir à deviner ce qui bloque.

### 7.2 Les quatre écrans

- **Vue d'ensemble** (`/pilot`) — compteurs par étape sur les deux couloirs,
  alertes du jour triées bloquantes d'abord, intégrations en retard.
- **Pipeline** (`/pilot/pipeline`) — une colonne par étape, cartes glissables,
  montant mensuel pondéré par colonne, mention en rouge d'un prospect sans
  contact depuis 30 jours. Glisser vers Perdu ou En sommeil ouvre une boîte qui
  exige la raison ; annuler remet la carte à sa place.
- **Intégrations** (`/pilot/integrations`) — une ligne par centre et par
  produit, les onze cases en pastilles avec leur motif en infobulle, compteur
  de bloquantes ouvertes, date promise colorée selon l'échéance, mention
  explicite quand le centre n'a pas encore de compte au Dashboard.
- **Fiche organisation** (`/pilot/organisations/[id]`) — identité, argent,
  contacts avec rôle dans la décision, centres et leur avancement par produit,
  chronologie des échanges avec saisie d'un nouvel échange et de sa prochaine
  action. Plus une liste `/pilot/organisations`.

### 7.3 Les cinq alertes

Calculées à la lecture, jamais stockées, parce que leur valeur dépend de l'heure
qu'il est (`src/lib/alertes.ts`) :

1. une étape ouverte au-delà de sa durée prévue ;
2. une date promise qui approche (7 jours) avec des étapes bloquantes ouvertes ;
3. un centre déclaré en production avec un élément bloquant manquant ;
4. un client en production sans appel ni RDV depuis 48 h ;
5. un prospect sans contact depuis 30 jours.

Chaque alerte porte une clé stable et unique par cause (`silence-12`,
`date-promise-7`), prévue pour servir de clé de déduplication le jour où elles
partiront en notifications.

### 7.4 Les trois routes

| Route | Méthode | Gardes |
|---|---|---|
| `/api/pilot/organisations/[id]/etape` | PATCH | 404 organisation inconnue, 409 transition illégale, 400 sortie sans raison |
| `/api/pilot/etapes` | POST | 404 centre non rattaché au produit, 409 étape automatique |
| `/api/pilot/echanges` | POST | 404 organisation inconnue, 400 date invalide |

Toutes les entrées sont validées par Zod. `dernierEchangeLe` est dénormalisé sur
l'organisation pour l'alerte « sans contact », et **n'est jamais reculé** par un
échange saisi rétroactivement.

### 7.5 Ce qui a été vérifié

`npm run build` passe (TypeScript strict et lint). Les six comportements
suivants ont été éprouvés en direct contre le serveur :

| Cas | Attendu | Obtenu |
|---|---|---|
| Cocher une étape automatique à la main | refus | 409 |
| Centre non rattaché au produit | refus | 404 |
| Cocher une étape manuelle | passe | 200 |
| En production vers Prospect | refus | 409 |
| Sortie en Perdu sans raison | refus | 400 |
| Reconquête En sommeil vers Prospect | passe | 200 |

Le SQL manuel a été rejoué sur une base déjà peuplée : il passe, donc
l'idempotence est réelle.

Deux défauts ont été trouvés et corrigés pendant la mise au point : une course
entre deux requêtes simultanées qui créait deux fois la même case (passée en
`upsert`), et un identifiant inconnu qui ressortait en 500 au lieu d'un 404.

---

## 8. Ce qui n'est pas construit

### Lot 2 — chiffre d'affaires et scénarios

Les tables existent et se remplissent ; **seuls les écrans manquent**. Le dossier
produit le spécifie ainsi :

Trois composantes, toutes calculées, aucune saisie à la main en dehors des
contrats :
- le **récurrent signé** : somme des abonnements des contrats actifs, ramenée au
  mois ;
- la **part variable** : pour un contrat facturé à l'usage (appels traités, RDV
  pris, SMS envoyés), lire les compteurs déjà tenus par le Dashboard et les
  multiplier par le tarif de la ligne ; le mois en cours s'affiche au jour près,
  avec la projection à fin de mois ;
- les **mises en service** : facturées une fois, à la date du passage en
  production ou à la signature selon le contrat.

Projection d'un mois futur :

```
CA(m) = R_signé(m) + V(m) + Σ  p_o · M_o
                            o cochées, d_o ≤ m
```

où `R` est le récurrent des contrats signés actifs au mois `m`, `V` la part
variable projetée, et pour chaque opportunité cochée `o` : sa probabilité `p`,
son montant mensuel `M`, sa date de démarrage `d`.

Exigences d'interface : cocher ou décocher une opportunité **recalcule la courbe
sur 24 mois dans le navigateur, sans aller-retour serveur** ; trois lectures
côte à côte (signé seul, pondéré, optimiste à 100 %) ; décaler une date de
démarrage d'un glisser montre l'effet d'un retard d'intégration sur l'année ; un
scénario s'enregistre sous un nom et se compare au réel mois après mois.

Pilot **n'est pas un logiciel de facturation** : il exporte en CSV ce que la
comptabilité doit facturer.

### Lot 3 — santé du parc

Écran « Parc » : santé de chaque client en production — usage, taux de RDV pris,
incidents, tickets ouverts, et plus tard l'adoption de Desk (part des RDV pris
dans Desk plutôt que dans Xplore).

### Sorties d'alertes

`calculerAlertes()` calcule et renvoie, rien de plus. Restent à brancher, au
Dashboard : création d'une `Notification` assignée au responsable du client,
mail Brevo, et une remontée dans Véga pour Enzo.

---

## 9. Les faiblesses connues, à traiter en priorité

Honnêtement listées, par ordre d'importance pour qui veut améliorer ce code.

1. **Aucun test, d'aucune sorte.** Ni unitaire, ni intégration, ni e2e, aucun
   runner installé. Le seul garde-fou est `npm run build`. Les vérifications du
   §7.5 ont été faites à la main, en `curl`, et ne sont pas rejouables. Les
   premières cibles évidentes : `transitionPermise`, `cocherEtape`,
   `verdictAutomatique`, et la projection de CA quand elle existera. C'est le
   même manque qu'au Dashboard, mais ce n'est pas une raison de le reproduire.
2. **`evaluerTousLesCentres()` est en N+1 et tourne à chaque ouverture de
   l'écran Intégrations.** Une boucle par rattachement, et dans chaque boucle un
   `findUnique` par étape, plus deux requêtes `Call`. Correct pour un parc de
   trois centres, intenable à trente. Deux directions : charger les étapes
   existantes en une requête et ne faire qu'un `createMany` / `updateMany`, ou
   déplacer l'évaluation dans un passage périodique et ne lire que le cache à
   l'affichage.
3. **`calculerAlertes()` appelle `evaluerCentreProduit` dans une double
   boucle**, donc recharge le même `UserProduct` plusieurs fois. Même remède.
4. **La garde « seules la direction et les commerciaux modifient les montants »
   est écrite mais sans dents**, puisque la session est un bouchon
   (`peutModifierLesMontants` n'est appelé nulle part). À brancher le jour de
   l'intégration, et à ne pas oublier.
5. **Aucune journalisation d'audit.** Le Dashboard impose `auditLog(...)` sur
   toute mutation sensible, et le format JSON de ces logs est consommé par
   Grafana. Changer l'étape commerciale d'un client ou cocher une case
   d'intégration sont des mutations sensibles.
6. **Le mouvement de carte du Pipeline est optimiste sans rollback complet** :
   en cas de refus serveur, l'état est remis depuis les `cartes` d'origine, ce
   qui annule aussi les autres mouvements faits entre-temps dans la même
   session d'écran.
7. **Pas d'écran de création.** Organisations, contacts, centres, contrats et
   opportunités se créent par le seed ou en SQL. Seul l'échange a un formulaire.
   C'est le manque le plus visible pour un utilisateur réel.
8. **L'étape mixte « interfaçage téléphonique » est à moitié traitée** : le volet
   automatique renseigne un motif quand le numéro manque, mais ne coche jamais
   rien ; le volet manuel (les essais) est le seul qui coche. Le comportement est
   défendable, il n'est pas documenté côté produit.
9. **`MAPPING_EXAMENS_MINIMUM = 5`** est un seuil de démonstration dans
   l'adaptateur, pas une règle métier. Il disparaîtra avec l'adaptateur, mais il
   ne doit pas se mettre à ressembler à une règle entre-temps.
10. **Accessibilité et clavier non traités.** Le dossier impose « le clavier
    d'abord » pour Desk, pas pour Pilot, mais le pipeline en glisser-déposer n'a
    aucune alternative clavier.

---

## 10. Un module existant qui documente l'API réelle du Dashboard

Avant de toucher à `src/lib/completude/adapter.ts` ou de supposer quoi que ce soit
sur les routes du Dashboard, **lire ce module** :

```
D:\projets\KONNECTNEURACORP\.claude\worktrees\desk-radiology-booking-features-b59cdc\backend\app\lyrae_dashboard\
  client.py        791 lignes, le point d'egress HTTP désigné, longuement commenté
  service.py     2 054 lignes
  provisioning.py  196 lignes, création des cabinets manquants depuis le Dashboard
  garde.py          84 lignes
```

C'est du code réel, sur la branche `dev` de Konnect, pas un brouillon. Il donne
les noms exacts des routes que le Dashboard expose à Konnect :

```
/api/konnect-configuration        /api/konnect-sites
/api/konnect-examens              /api/konnect-tenant-mapping/resolve
/api/konnect-tenants-attendus     /api/konnect-demandes-rappel
/api/konnect-remontee             /api/konnect-logo
/api/product-config
```

Deux d'entre elles touchent directement la check-list de Pilot :
`/api/konnect-tenant-mapping/resolve` et `/api/konnect-tenants-attendus`
recouvrent l'étape « code centre rattaché », que l'adaptateur local câble
aujourd'hui sur un champ inventé (`UserProduct.codeCentreRattache`).

`provisioning.py` confirme le fait sur lequel repose tout `CrmCentreProduit` :
« Le Dashboard attribue maintenant l'identité à l'affiliation du produit. »
C'est bien le `UserProduct` qui porte l'identité d'un cabinet, et un centre sans
`UserProduct` est un centre qui n'existe pas encore côté Dashboard — ce que Pilot
affiche déjà comme tel.

L'en-tête de `client.py` date aussi la règle reprise au §3, règle 2 : la double vérité a
été « fermée le 28/08/2026 », et renvoyer de la configuration au Dashboard la
rouvrirait. L'interdiction ne vient donc pas du dossier produit de Pilot, elle lui
préexiste.

**Une asymétrie à ne pas confondre.** Ce module existe parce que Konnect est
derrière un VPN et que le Dashboard ne peut pas venir le lire : Konnect pousse, et
tout ce qui descend est tiré. Pilot est dans le cas inverse, il vit *dans* le
Dashboard et lit sa base en direct. Ce code est donc **une source de vérité sur
les noms et les formes de l'API, pas une dépendance à réutiliser**.

Vérifié au passage : ce module ne contient aucun littéral de nom de produit, il
ne répond donc pas à la question des libellés de `Product` posée ci-dessous.

---

## 11. Les questions ouvertes, qui ne se tranchent pas en codant

Elles demandent une réponse humaine. Un agent qui les rencontre doit les
signaler, pas les décider.

- **Le modèle tarifaire réel de Lyrae** : forfait, usage, par site, par poste ?
  Le dossier produit le signale lui-même comme non décrit dans le workspace. La
  structure actuelle de `CrmLigneContrat` couvre forfait et usage, par site ou
  pour l'organisation entière, mais elle doit être validée. Le dossier place
  cette validation « avant le lot 3 » alors que le chiffre d'affaires est le
  lot 2 : incohérence à lever.
- **D'où viennent les compteurs de la part variable.** En local, `Call` fait
  office de compteur. Au Dashboard il faudra trancher entre `Call`,
  `CallConversation` et la remontée Konnect — le contrat du Dashboard signale
  que `Call` et `CallConversation` coexistent pour un même appel.
- **Les noms exacts de Konnect et de Desk dans la table `Product`** de la base
  de production. Seul `LyraeTalk` est certain : c'est une chaîne magique en dur
  dans une soixantaine d'endroits du Dashboard, comparée tantôt en strict,
  tantôt en `toLowerCase()`. La renommer en base casse l'application entière
  sans erreur de compilation.
- **Les durées attendues** de chaque étape de la check-list, et lesquelles sont
  réellement bloquantes.
- **Le nom « Pilot »**, à côté de Véga.
- **L'import d'un historique existant** (tableur, mails) au démarrage.

---

## 12. Comment vérifier une amélioration

Il n'y a pas de CI. Au minimum, avant de dire qu'un changement tient :

```bash
npm run build          # TypeScript strict + lint, le seul garde-fou actuel
npm run seed           # remet le jeu de démonstration
npm run dev
```

Puis, sur le jeu de démonstration, les faits suivants doivent rester vrais :

- `Groupe d'imagerie Alpha` ressort **10/10** sur LyraeTalk ;
- `Centre d'imagerie Beta` ressort **4/10**, 4 bloquantes, date promise dans
  5 jours, et affiche « Mapping incomplet : 2 examens sur 5 attendus » ;
- `GIE Imagerie Gamma` ressort **0/10** avec « Aucun UserProduct au Dashboard
  pour ce centre » sur chaque case automatique, et **8 étapes seulement** sur
  Konnect ;
- `Cabinet Zeta` déclenche l'alerte « prospect sans contact depuis 47 jours » ;
- les six cas du §7.5 répondent avec les mêmes codes HTTP.

Les identifiants changent à chaque `npm run seed` : les lire en base avant de
rejouer des appels `curl`, ne pas les coder en dur.
