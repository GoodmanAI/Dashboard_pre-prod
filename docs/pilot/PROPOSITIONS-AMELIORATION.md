# LYRAE PILOT : propositions d'amélioration

Document de réflexion, rédigé le 26/10/2026 à partir de `BRIEF-AMELIORATION.md`,
`CHOIX.md`, du schéma et du code du lot 1. Rien n'est codé ici. Chaque
proposition dit ce qu'elle apporte, ce qu'elle coûte, et ce qu'elle respecte.
Les questions qui demandent une réponse humaine sont en fin de document, avec
la réponse que je prendrais par défaut.

---

## 1. Ce que j'ai compris

Pilot doit répondre à trois questions, pour trois métiers, sans ressaisie :

| Question | Qui la pose | Ce qui manque aujourd'hui |
|---|---|---|
| **Qu'est-ce que je fais aujourd'hui ?** | commercial, chef de projet | aucune liste d'actions, les relances se devinent |
| **Qui bloque, et depuis quand ?** | chef de projet, technique | la case vide dit pourquoi, pas qui doit agir |
| **Où en sera-t-on dans trois mois ?** | direction | lot 2 non construit, aucune date réaliste calculée |

Le lot 1 pose de bonnes fondations : cycle de vie gardé côté serveur, check-list
qui se coche seule, alertes calculées à la lecture, argent en centimes. Mais il
reste un outil de **consultation**. Un commercial ne peut pas créer un prospect,
un chef de projet ne peut pas dire « j'attends EDL depuis 12 jours », la
direction ne voit aucun chiffre.

Le fil conducteur des propositions ci-dessous : **transformer Pilot en outil de
pilotage quotidien**, où chaque écran se termine par une action, et où le passé
est journalisé pour que le futur se calcule.

---

## 2. Le socle transversal (à faire avant tout le reste)

### 2.1 Un journal d'événements unique

**Quoi.** Une table `CrmEvenement` : qui, quand, sur quoi (organisation, centre,
contrat, opportunité, étape), quel type, valeur avant, valeur après. Toute
mutation y écrit une ligne : transition d'étape, case cochée ou décochée (auto
ou manuelle), date promise déplacée, montant modifié, échange saisi, contact
ajouté.

**Pourquoi.** Un seul mécanisme règle cinq besoins :

1. la journalisation d'audit exigée par le Dashboard (faiblesse n° 5) ;
2. la chronologie complète d'une organisation sur sa fiche, pas seulement les
   échanges ;
3. les métriques de vitesse : temps moyen par étape, taux de conversion,
   nombre de reports d'une date promise ;
4. la détection des régressions automatiques : « le mapping d'examens était
   terminé le 3, il ne l'est plus le 12 » est un événement, donc visible ;
5. le « quoi de neuf depuis ma dernière visite » pour chaque utilisateur.

**Coût.** Une table, une fonction `journaliser()` appelée dans chaque route, un
composant chronologie. Format JSON aligné sur `auditLog(...)` du Dashboard.

**Respecte.** Aucune donnée patient (les événements portent des identifiants
d'organisation et des libellés d'étape). Enum de types additive.

### 2.2 Les écrans de création et d'édition

**Quoi.** Formulaires pour organisation, contact, centre, rattachement produit,
contrat et lignes, opportunité. Schémas Zod partagés entre le formulaire et la
route. Un bouton « Nouveau prospect » visible depuis le pipeline.

**Pourquoi.** C'est le manque le plus visible (faiblesse n° 7). Sans lui, Pilot
ne remplace pas le tableur, il le double.

**Détail qui compte.** La création d'un prospect demande le minimum : nom,
type, responsable. Tout le reste se complète plus tard, et la fiche affiche ce
qui manque (voir 3.1).

### 2.3 Les alertes acquittables

**Quoi.** Une table `CrmAcquittement` : clé d'alerte, acquittée par, jusqu'à
quelle date, raison. L'alerte reste calculée à la lecture (C-08), mais l'écran
la range sous « mises en sommeil » tant que l'acquittement court.

**Pourquoi.** Un centre fermé pour travaux déclenchera « silence 48 h » tous les
jours pendant trois semaines. Au troisième jour plus personne ne lit les
alertes. La fatigue d'alerte est le premier tueur des outils de suivi. La clé
stable `Alerte.cle` est déjà prévue pour cela.

**Respecte.** C-08 reste vrai : on ne stocke pas l'alerte, on stocke la décision
humaine de la taire.

### 2.4 Les vues « à moi » et la recherche

**Quoi.** Chaque liste a un filtre « mes dossiers » (par `responsableId`). Une
recherche globale au clavier (Ctrl+K) sur organisations, contacts, centres.

**Pourquoi.** Tout le monde voit tout, c'est voulu. Mais un commercial ouvre
Pilot pour **ses** prospects. Deux clics économisés cent fois par jour.

### 2.5 La page « Aujourd'hui »

**Quoi.** Remplace ou complète la vue d'ensemble. Pour l'utilisateur connecté :
ses actions du jour et en retard, ses alertes non acquittées, ses dates promises
dans les 14 jours, ses prospects muets. Chaque ligne a un bouton d'action
(« marquer fait », « replanifier », « acquitter »).

**Pourquoi.** C'est l'écran qu'on ouvre le matin. Les outils qui marchent
(Pipedrive, Attio, HubSpot) ont tous convergé vers une vue centrée sur l'action
plutôt que sur l'état.

---

## 3. Prospects

### 3.1 Prochaine action obligatoire, portée par l'organisation

**Quoi.** `prochaineAction` et `prochaineActionLe` remontent sur
`CrmOrganisation` (dénormalisés depuis le dernier échange, comme
`dernierEchangeLe`). Règle douce : une organisation en étape commerciale sans
prochaine action datée est signalée en orange dans le pipeline. Pas de blocage
serveur, un signal.

**Pourquoi.** C'est la pratique la plus efficace connue en vente B2B à cycle
long (« activity-based selling ») : on ne pilote pas des étapes, on pilote la
prochaine action. Un prospect sans prochaine action est un prospect qu'on va
oublier. L'alerte « 30 jours sans contact » arrive trop tard.

### 3.2 Vieillissement par étape

**Quoi.** `etapeDepuisLe` sur l'organisation, posé à chaque transition. Chaque
carte du pipeline affiche « 12 j dans cette étape ». Au-delà d'un seuil par
étape (à valider, voir questions), la carte passe en orange.

**Pourquoi.** Le temps passé dans une étape est le meilleur prédicteur d'un
deal qui meurt. Avec le journal (2.1), on obtient aussi le temps médian réel
par étape, qui remplace les seuils estimés.

### 3.3 Raisons de perte et de sommeil normalisées

**Quoi.** `raisonSortieCode` (enum : PRIX, CONCURRENT, PAS_DE_BUDGET,
RIS_INCOMPATIBLE, TIMING, SANS_REPONSE, AUTRE) à côté du texte libre existant.
Date de réveil `reveilLe` pour EN_SOMMEIL, qui crée une action à cette date.

**Pourquoi.** Un texte libre ne se compte pas. Au bout de vingt pertes, la
direction veut savoir si c'est le prix ou le RIS. Et « en sommeil » sans date
de réveil est un « perdu » qui ne dit pas son nom.

### 3.4 Qualification structurée

**Quoi.** Sur la fiche, un bloc « Qualification » à cinq cases : besoin
identifié, décideur rencontré, budget évoqué, calendrier connu, solution
actuelle connue (RIS, standard téléphonique, concurrent). Score affiché en
« 3/5 ». Les cases manquantes sont listées en clair.

**Pourquoi.** Version légère de ce que font MEDDIC ou BANT. Elle donne au
commercial la liste de ce qu'il lui reste à apprendre, et à la direction une
lecture honnête d'un pipeline qui peut gonfler de prospects mal qualifiés.
Pas de blocage de transition : un signal, pas une règle.

### 3.5 Contacts : attitude et fraîcheur

**Quoi.** Sur `CrmContact` : `attitude` (SOUTIEN, NEUTRE, OPPOSANT, INCONNU) et
`dernierContactLe` (dénormalisé depuis les échanges liés au contact).

**Pourquoi.** Un décideur opposant et un prescripteur soutien, c'est la carte
d'un deal. Savoir qu'on n'a pas parlé au décideur depuis 60 jours alors que la
proposition est envoyée, c'est une alerte utile.

### 3.6 Échanges planifiés

**Quoi.** `statut` sur `CrmEchange` (PLANIFIE, REALISE, ANNULE). Un échange dans
le futur est un rendez-vous. La page « Aujourd'hui » et une vue semaine les
affichent.

**Pourquoi.** Une seule table sert l'historique et l'agenda. Pas de second
modèle. Les formations de secrétaires et les visios techniques sont des échanges
planifiés, pas une structure à part.

---

## 4. Négociations

C'est le volet le moins couvert par le dossier produit, et celui que vous avez
nommé explicitement. Aujourd'hui, entre « Proposition » et « Signé », Pilot ne
sait rien.

### 4.1 Les propositions versionnées

**Quoi.** Une table `CrmProposition` rattachée à l'organisation : version,
produits et montants (mise en service, abonnement, part variable), remise
accordée, durée d'engagement en mois, envoyée le, valide jusqu'au, statut
(ENVOYEE, EN_DISCUSSION, ACCEPTEE, REFUSEE, EXPIREE), réponse du client en
clair, lien vers le document (URL, jamais le fichier). À l'acceptation, la
proposition **devient** le contrat : les lignes se copient, pas de ressaisie.

**Pourquoi.** Une négociation est une suite de versions. Voir « v1 à 1 200 €,
v2 à 1 050 € avec engagement 24 mois, v3 acceptée » sur une fiche, c'est tout
l'historique d'une négo en trois lignes. La remise cumulée par commercial et
par trimestre devient lisible pour la direction. Et l'expiration d'une
proposition sans réponse est une alerte naturelle (« proposition expirée depuis
5 jours, aucune réponse »).

### 4.2 Date de décision attendue, distincte du démarrage

**Quoi.** `decisionAttendueLe` sur l'organisation (ou la proposition).
`demarrageAttenduLe` existe déjà sur l'opportunité et garde son sens.

**Pourquoi.** Le client décide en décembre et démarre en mars. Confondre les
deux dates fausse à la fois les relances et la projection de CA.

### 4.3 Catégorie de prévision

**Quoi.** `categoriePrevision` sur l'opportunité : ENGAGE (le commercial s'y
engage), PROBABLE, POSSIBLE, EXCLU. Indépendante de la probabilité chiffrée.

**Pourquoi.** La probabilité par étape est mécanique. La catégorie est le
jugement du commercial, et c'est elle que la direction veut voir dans une revue
de pipeline. Les deux lectures côte à côte révèlent les écarts (« 65 % par
l'étape, mais le commercial dit possible seulement »).

### 4.4 Plan de signature

**Quoi.** Pendant l'étape Proposition, une courte liste de jalons partagés avec
le client : « validation juridique », « passage en comité », « signature ».
Chaque jalon a une date et un responsable (Lyrae ou client). Modélisé comme des
`CrmEchange` planifiés d'un type JALON, pas une table de plus.

**Pourquoi.** C'est le « mutual action plan » des ventes complexes, réduit à
l'essentiel. Il remplace la question « ça en est où ? » par un calendrier que
le commercial et le client regardent ensemble.

---

## 5. Déploiements

### 5.1 Qui bloque : la balle est chez qui

**Quoi.** Sur `CrmEtapeIntegration`, pour les étapes manuelles et mixtes :
`enAttenteDe` (LYRAE, CLIENT, EDL, OPERATEUR_TELEPHONIE, PRESTATAIRE_SITE_WEB,
AUTRE), `demandeeLe` (date où la demande est partie), `derniereRelanceLe`,
`echeanceLe`. L'écran Intégrations affiche, par ligne, « en attente d'EDL depuis
18 jours, relancé le 20 ».

**Pourquoi.** C'est la proposition qui changera le plus la vie du chef de
projet. Une intégration Lyrae dépend de tiers (EDL pour le jeton, l'opérateur
pour le numéro, le prestataire web du client pour l'iframe). Savoir que la case
est vide ne suffit pas ; il faut savoir qui doit agir et depuis quand. Une vue
« Nos demandes en attente chez des tiers » devient la liste de relances du
lundi matin.

**Respecte.** Une étape automatique n'est pas cochée par ce champ : il décrit
l'attente, il ne décide pas du fait. La garde serveur ne bouge pas.

### 5.2 Date réaliste de mise en production, calculée

**Quoi.** Pour chaque rattachement centre × produit, une `dateRealiste`
calculée à la lecture : aujourd'hui plus le reste à faire des étapes bloquantes
ouvertes, selon leur durée attendue et le temps déjà écoulé. Affichée à côté de
la date promise, avec l'écart en jours.

**Pourquoi.** La date promise est un engagement, la date réaliste est une
estimation. L'écart entre les deux est ce que le chef de projet doit expliquer
au client, et ce que la direction doit voir avant que le client ne l'apprenne.
L'heuristique de calcul (étapes en parallèle ou en série) est à valider, mais
une estimation visible vaut mieux qu'une date promise seule.

### 5.3 Historique des dates promises

**Quoi.** Chaque changement de `datePromise` est un événement du journal (2.1).
La fiche affiche « date promise reportée 2 fois, 23 jours au total ».

**Pourquoi.** Un report est normal. Trois reports, c'est un client qui doute.
C'est le signal de santé le plus simple à calculer et le plus souvent oublié.

### 5.4 Déploiement par vagues pour les groupes

**Quoi.** `vague` (entier) et `ordre` sur `CrmCentreProduit`. La fiche
organisation groupe les centres par vague avec une date promise par vague. La
vue Intégrations se filtre par vague.

**Pourquoi.** Un groupe privé à dix sites ne s'intègre pas d'un bloc. Sans
notion de vague, dix lignes identiques dans l'écran Intégrations ne disent pas
où on en est du plan.

### 5.5 Prêt à passer en production ?

**Quoi.** Sur chaque rattachement, un résumé calculé : « Prêt » ou « Pas prêt :
3 bloquantes ouvertes, dont 2 en attente d'un tiers ». Le cochage manuel de
PASSAGE_PRODUCTION reste possible, mais la fiche dit clairement que c'est un
passage en production avec réserves, et l'alerte n° 3 existe déjà pour le
rappeler.

**Pourquoi.** Le chef de projet n'a pas à compter les pastilles. L'écran répond
à la question qu'il se pose.

### 5.6 Période de suivi renforcé après mise en production

**Quoi.** `suiviRenforceJusquAu` sur le rattachement, posé à 14 jours après
le passage en production. Pendant cette période, l'alerte silence passe de
48 h à 24 h, et la fiche affiche le compteur d'appels jour par jour.

**Pourquoi.** Les deux premières semaines décident de l'adoption. Un centre qui
ne reçoit pas d'appels à J+3 a un problème de redirection téléphonique, pas un
problème d'usage.

### 5.7 Régressions automatiques visibles

**Quoi.** Quand l'évaluateur fait passer une case automatique de faite à non
faite, un événement de type REGRESSION est journalisé, et une alerte dédiée
apparaît : « Mapping des examens : était terminé le 3, ne l'est plus ».

**Pourquoi.** Aujourd'hui la case se décoche en silence. En production, c'est
un incident qui mérite d'être vu avant que le client n'appelle.

---

## 6. Chiffre d'affaires et scénarios (lot 2)

Le dossier produit spécifie bien le besoin. Trois précisions d'architecture.

### 6.1 Un moteur de projection pur, partagé navigateur et serveur

**Quoi.** `src/lib/ca/projeter.ts` : une fonction pure `projeter(contrats,
opportunites, scenario, moisDepart, nbMois)` qui renvoie 24 lignes de
centimes entiers, en trois lectures (signé, pondéré, optimiste). Aucun accès à
la base. Le serveur l'appelle pour l'écran initial, le navigateur la rappelle à
chaque coche sans aller-retour, et les tests la vérifient.

**Pourquoi.** L'exigence « recalcule dans le navigateur sans aller-retour »
impose la pureté. Une seule implémentation évite deux vérités entre l'écran et
l'export.

### 6.2 Le réel mensuel figé

**Quoi.** Une table `CrmCaMensuel` : mois, organisation, produit, récurrent,
part variable, mises en service, en centimes. Remplie par un passage mensuel
(cron) le premier jour du mois suivant. Jamais réécrite.

**Pourquoi.** « Comparer un scénario au réel mois après mois » suppose que le
réel d'un mois passé ne bouge plus. Les compteurs du Dashboard sont vivants
(une correction de `Call` en novembre changerait le CA d'octobre). Il faut
figer. C'est aussi la table que l'export CSV pour la comptabilité lit.

### 6.3 Les contrats portent leur engagement

**Quoi.** `engagementMois` et `preavisMois` sur `CrmContrat`. `renouvelleLe`
existe déjà. Alerte « renouvellement dans 90 jours » et « fin d'engagement dans
90 jours ».

**Pourquoi.** Un parc à abonnement vit de ses renouvellements. Le signé qui
sort est aussi important que le signé qui entre, et la projection à 24 mois
doit faire tomber un contrat à son terme si rien n'est reconduit.

---

## 7. Santé du parc (lot 3)

### 7.1 Usage réel contre volume annoncé

**Quoi.** `volumeAppelsEstime` existe sur l'organisation, déclaré en
pourparlers. En production, le comparer aux appels réels : « 60 % du volume
annoncé ».

**Pourquoi.** C'est à la fois un signal de santé (le client n'a pas redirigé
tout son trafic) et un retour pour le commercial (les volumes annoncés sont
surestimés de 30 % en moyenne, donc la projection de CA variable doit être
corrigée).

### 7.2 Score de santé lisible, pas une note magique

**Quoi.** Quatre feux par centre en production : usage (tendance sur 4
semaines), taux de RDV pris, incidents ouverts (tickets du Dashboard), silence.
Pas de note composite.

**Pourquoi.** Un score à 72/100 ne dit pas quoi faire. Quatre feux disent
lequel est rouge. Même principe que « quand une case est vide, l'écran dit
pourquoi ».

---

## 8. Dette à régler dans le même mouvement

| Faiblesse du brief | Remède proposé |
|---|---|
| 1. Aucun test | Vitest sur les fonctions pures : `transitionPermise`, `verdictAutomatique`, `projeter`, `dateRealiste`. Décision à écrire dans CHOIX.md (bibliothèque absente du Dashboard). |
| 2 et 3. N+1 sur l'évaluation | Charger tous les rattachements, étapes et états en trois requêtes, écrire en une transaction. L'évaluation ne tourne plus à l'ouverture de l'écran mais par un passage toutes les 15 minutes ; l'écran lit la base et affiche « évalué il y a 4 min ». |
| 4. Garde des montants sans dents | Appeler `peutModifierLesMontants` dans les routes contrat, proposition et opportunité dès maintenant, avec le bouchon de session. Le jour de l'intégration, seul le bouchon change. |
| 5. Pas d'audit | Le journal d'événements (2.1). |
| 6. Rollback optimiste trop large | Un état par carte, rollback de la seule carte refusée. |
| 8. Étape mixte à moitié traitée | Documenter dans `definition.ts` : le volet auto renseigne le motif, le volet manuel coche. Avec 5.1, l'étape porte aussi « en attente de l'opérateur ». |
| 10. Pas de clavier sur le pipeline | Menu « Déplacer vers » sur chaque carte, accessible au clavier. Le glisser reste. |

---

## 9. Ce que je déconseille

- **Synchronisation des boîtes mail.** Lourde, fragile, et elle ferait entrer
  dans Pilot des mails qui peuvent contenir des données patient. Un échange se
  saisit à la main en trente secondes. À la rigueur, plus tard, une adresse de
  dépôt en copie.
- **Un score prédictif « IA » de signature.** Avec trente prospects, aucun
  modèle n'apprend rien. La probabilité par étape corrigée à la main suffit, et
  elle s'explique.
- **Un outil de facturation.** Le dossier le dit : Pilot exporte, il ne facture
  pas.
- **Toute bibliothèque absente du Dashboard** hors Vitest, et Vitest seulement
  parce qu'un code sans test ne se transpose pas sereinement.

---

## 10. Priorités proposées

| Lot | Contenu | Valeur |
|---|---|---|
| **1 bis** | Création et édition, journal d'événements, prochaine action et page Aujourd'hui, qui bloque, alertes acquittables, vieillissement par étape, raisons normalisées, évaluation par lots, tests, clavier | Pilot devient utilisable au quotidien |
| **2** | Propositions versionnées, moteur de projection, réel mensuel figé, scénarios, date réaliste, vagues, engagement des contrats, export CSV | La direction voit l'argent, le chef de projet voit les dates |
| **3** | Santé du parc, usage contre annoncé, renouvellements, suivi renforcé, régressions | Le parc existant est surveillé, pas seulement le nouveau |

---

## 11. Questions

Chaque question change l'architecture. Pour chacune, la réponse que je prends
si vous n'avez pas d'avis.

**Q1. Le modèle tarifaire.** Comment Lyrae facture aujourd'hui : un abonnement
mensuel par site, par organisation, à l'appel, un mélange ? Y a-t-il une durée
d'engagement (12, 24, 36 mois) et une mise en service facturée une fois ?
*Par défaut : abonnement mensuel par site et par produit, mise en service
unique, part variable optionnelle à l'appel ou au RDV, engagement 12 mois. La
structure actuelle de `CrmLigneContrat` le couvre.*

**Q2. Les tiers qui bloquent.** Qui fait attendre une intégration, en vrai ?
EDL pour le jeton, l'opérateur téléphonique pour le numéro, le prestataire web
du client pour l'iframe, le client lui-même ? D'autres ?
*Par défaut : LYRAE, CLIENT, EDL, OPERATEUR_TELEPHONIE, PRESTATAIRE_SITE_WEB,
AUTRE. L'enum s'étend, jamais ne se renomme.*

**Q3. La négociation réelle.** Une vente passe-t-elle par plusieurs versions de
devis, avec remises et allers-retours, ou par un devis unique accepté ou
refusé ? Les devis existent-ils en documents (PDF sur un drive) ?
*Par défaut : plusieurs versions possibles, lien vers le document, remise et
engagement tracés par version.*

**Q4. Deux responsables.** Faut-il distinguer le responsable commercial et le
chef de projet d'intégration sur une organisation, ou une seule personne suit
le client de bout en bout ?
*Par défaut : deux champs, `responsableCommercialId` et `chefDeProjetId`, le
second optionnel. L'actuel `responsableId` devient le commercial.*

**Q5. Les groupes multi-sites.** Les clients à plusieurs centres s'intègrent-ils
par vagues planifiées, ou site par site au fil de l'eau ?
*Par défaut : vagues optionnelles. Un client à un site n'en voit jamais la
notion.*

**Q6. L'historique existant.** Il y a un tableur aujourd'hui. Combien de lignes,
quelles colonnes, et faut-il l'importer au démarrage ou ressaisir à la main ?
*Par défaut : un import CSV minimal (organisation, type, étape, contact
principal, responsable), en une commande, pas d'écran.*

**Q7. Les seuils.** Les durées attendues par étape et le seuil de vieillissement
par étape commerciale sont des estimations. Qui les valide, et quand ?
*Par défaut : on garde les estimations, le journal d'événements mesure le réel,
on corrige après trois mois de données.*

Une réponse « les défauts partout » est valide. L'architecture détaillée sera
rédigée à partir des réponses.
