# Cadrage du retour du président (20/11/2026)

Sources : « Lyrae Pilot : analyse poussée par Claude » et « Lyrae Pilot :
analyse fonctionnelle », 20/11/2026. Ce compte rendu garde les décisions prises
en réunion de cadrage, au fil des questions. Rien n'est codé tant que les
questions bloquantes ne sont pas tranchées.

## Décisions

### D-1 : un prospect devient client une fois le POC validé (option B)

Avant la signature définitive, un prospect peut être « en POC ». À la fin du
POC :
- POC validé : il devient client ;
- sinon : il passe en « POC non transformé ».

Conséquences déjà connues :
- le parcours gagne des étapes (on ajoute des valeurs à `CrmEtapeCommerciale`,
  on n'en renomme aucune) ;
- un centre en POC est installé pour être testé : l'espace Déploiement doit
  donc montrer aussi les prospects en POC, pas seulement les clients ;
- la règle « un client dès la signature » de `rubriqueDe` (C-87) change : un
  prospect en POC reste rangé dans Prospects ;
- le tableau Prospects perd la famille « Après la signature ».

### D-2 : un POC gratuit d'un mois, prolongeable d'un mois, et une formation payante

- Le POC dure **1 mois, gratuit**. Il peut parfois être **prolongé d'un mois**,
  gratuit lui aussi.
- La **formation est facturée 750 € HT** (75 000 centimes) **dès le début du
  POC**, que le POC soit validé ou non.

Ce qu'on en tire, sauf avis contraire :
- la fiche garde la date de début du POC, sa fin prévue et une éventuelle
  prolongation (une seule) ;
- une alerte s'ouvre avant la fin du POC pour décider : validé, prolongé ou non
  transformé ;
- les 750 € de formation sont une prestation facturée une fois (C-76) : ils
  comptent dans le chiffre d'affaires du mois de début du POC et figurent dans
  le calendrier de facturation, même si le POC n'est pas transformé ;
- le prix de 750 € entre dans la grille tarifaire datée (C-75), pas dans le
  code.

Décision du 22/11/2026 (C-95) : aucun essai payant supplémentaire après le
POC. Les mois payants sont ceux du contrat depuis son début officiel.
La formation est unique pendant toute la vie du dossier, liée au premier POC,
hors contrat. Son prix est celui de la grille au jour du début, conservé.

### D-3 : toute alerte va d'office au directeur général, qui réattribue

- Chaque nouvelle alerte est attribuée au **directeur général**, quelle que
  soit sa nature.
- Il la **réattribue à la main** à une autre personne si besoin.
- L'alerte affiche toujours **le poste et la personne** qui doit agir.

Ce qu'on en tire, sauf avis contraire :
- le super-administrateur désigne le directeur général dans l'écran Équipe ;
  tant que personne n'est désigné, les alertes vont au super-administrateur,
  pour qu'aucune ne reste sans personne ;
- le poste affiché est le département de la personne (Commercial, Projet,
  Technique, Direction, C-78) ;
- une réattribution est une décision humaine enregistrée, comme le silence
  d'une alerte (C-35) : l'alerte reste calculée à la lecture ; la personne
  choisie la garde, avec qui l'a réattribuée, et la retrouve si la même cause
  revient sur le même dossier (précisé à la réalisation, C-91) ;
- la personne qui reçoit une alerte la voit sur sa page Aujourd'hui, comme une
  demande d'un collègue (C-58) ;
- le filtre « À moi » des alertes suit désormais la personne attribuée, et non
  plus le commercial ou le chef de projet du dossier.

### D-4 : un client sans contrat saisi compte un montant estimé, jamais mêlé au signé

- Un POC validé sans contrat actif devient client quand même : on ne bloque pas
  le passage.
- Le chiffre d'affaires compte alors un **montant estimé**, affiché à part,
  « estimé, contrat à saisir », à côté des abonnements signés.
- Une alerte « contrat à saisir » part au directeur général (D-3).
- Le montant devient « signé » dès que le contrat est activé.

Ce qu'on en tire, sauf avis contraire :
- l'estimation suit la règle d'origine déjà en place (C-70) : la dernière
  proposition acceptée, sinon la dernière proposition, sinon l'opportunité
  ouverte ;
- C-45 change sur ce point seulement : un brouillon ne compte toujours pas
  comme signé, mais un client sans contrat actif nourrit la ligne « estimé » ;
- le réel figé (C-46) et l'export comptable ne prennent jamais l'estimé : ils
  ne gardent que le signé ;
- la même règle vaut pour les clients déjà signés aujourd'hui sans contrat
  actif, pas seulement après un POC.

### D-5 : l'ordre des lots

1. **Qui fait quoi** (D-3) : alertes attribuées au directeur général et
   réattribuables, poste et personne affichés, alertes moins bruyantes (délai
   après création, une alerte par client pour une même cause), nouveau nom de
   « Santé des centres ».
2. **Des chiffres fiables** : montant estimé (D-4), trois récurrents nommés
   chacun, pas d'« En service » avec une étape bloquante ouverte, une seule
   source pour le nombre de sites, contrôles de saisie (code postal, salles,
   date de la prochaine action).
3. **POC et Déploiement** (D-1, D-2) : étapes du POC, Prospects sans « Après la
   signature », espace Déploiement « à venir » puis « en cours » (téléphonie,
   RIS, bon de commande EDL, commercial EDL, API reçue).
4. **Facturation** : calendrier (formation à 750 €, mois gratuit, prolongation,
   mois payants), prévisions et alertes.

### D-6 : « Santé des centres » devient « Centres à surveiller »

Le nom dit ce qu'on doit faire : repérer les centres en service qui décrochent
et les appeler.

## Avancement

- **Lot 1, Qui fait quoi : réalisé le 21/11/2026** (CHOIX.md, C-91). Une
  alerte par cause plutôt que par client : une proposition expirée et une étape
  en retard d'un même client appellent deux personnes différentes.
- **Lot 2, Des chiffres fiables : réalisé le 22/11/2026** (CHOIX.md, C-92).
  Trois choix faits à la réalisation, à revoir si besoin :
  - le nombre de sites est le nombre saisi sur la fiche, jamais moins que les
    centres créés : 108 dossiers sur 114 n'ont encore aucun centre ;
  - un dossier sans centre suivi dans Pilot peut passer « En service » ; s'il a
    des centres suivis, l'un d'eux doit être déclaré en service ;
  - pour estimer, un contrat en brouillon déjà rempli passe avant la
    proposition acceptée.
- **Lot 3, POC et Déploiement : réalisé le 22/11/2026** (CHOIX.md, C-93).
  Choix faits à la réalisation :
  - POC facultatif à 80 % de probabilité, toujours prospect ; validation par la
    conversion existante. Le POC non transformé demande un motif et peut être reconquis ;
  - mois calendaires, dernier jour compris ; une seule prolongation. Les dates
    de l'organisation sont conservées après décision, séparées de l'essai du contrat ;
  - À venir accueille aussi les dossiers sans centre suivi. En cours commence
    au premier travail coché ou au rattachement au Dashboard ;
  - quatre prérequis réutilisent les sources existantes. Seule la case de
    réception du bon de commande EDL est ajoutée. La décision du 22/11/2026
    conserve la case seule, sans fichier ni lien (C-94) ;
  - recette lancée hors du bac à sable de Codex sur lyrae_pilot_test : migration,
    génération Prisma et seed réussis, Phi en POC présent. Résultat confirmé :
    1 877 vérifications HTTP, 0 échec, dont 42 du lot Z. Mesure réussie :
    Déploiement à 9 requêtes à 1 puis 20 centres, nombre identique. Les cinq
    prérequis ne s'affichent que dans À venir : un centre déjà en service n'a
    plus à préparer sa commande EDL. Aucun défilement horizontal constaté à
    375 px sur les cinq écrans contrôlés par l'utilisateur. Tests unitaires,
    lint et build déjà réussis.
- **Décisions métier du 22/11/2026, réalisées en C-94** :
  - chaque POC est un cycle distinct. Le nouveau cycle demande une date et
    permet à nouveau une prolongation unique. Les reprises directes d'un test
    suspendu continuent le même cycle ;
  - les cycles clos sont conservés dès la décision, avec leurs dates et leur
    issue. La fiche montre le POC précédent. Le lot 4 lira le courant sur
    l'organisation et les cycles passés dans l'historique, par identifiant ;
  - bon de commande EDL : la case seule, sans fichier ni lien. Un emplacement
    documentaire commun sera choisi plus tard.
- **Lot 4 réalisé le 22/11/2026** (CHOIX.md, C-95) : calendrier dans Argent et
  Ventes, formation unique du premier POC dans la prévision et le réel, export
  agrégé conservé, déclaration datée de facture et alertes à la Direction générale.
  Un prix absent se complète sur le dossier, sans modifier une grille passée.
  Une clé déjà figée reste intacte et demande une régularisation humaine.
  Après retour du pilote : contrat à saisir sans doublon du top, attentes de
  copie tarifaire corrigées et rattrapage mensuel des seules formations dont
  le prix a été renseigné tardivement. 2 817 tests réussis, lint, TypeScript et
  build réussis. Recette du 23/11/2026 sur lyrae_pilot_test : migration
  idempotente, seed, 1 961 vérifications HTTP sans échec dont 72 du lot AA,
  mesure réussie. Écrans à contrôler à 375 px et en grand écran.

## Questions encore ouvertes

Peuvent attendre : le choix d’un emplacement
documentaire commun, la fusion
température et priorité (accord du directeur commercial), développer ou
acheter le CRM générique, la version testée par le président.
