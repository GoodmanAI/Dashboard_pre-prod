# CHOIX — Lyrae Pilot

Registre des décisions non imposées par le dossier produit, sur le modèle du
`CHOIX.md` de Konnect : ce qui a été décidé, pourquoi, et ce qui a été écarté.

Source de vérité du besoin : « Lyrae Desk et Lyrae Pilot : deux nouveaux produits
dans l'écosystème Lyrae », 19/10/2026. Une règle de ce document ne se contourne
pas ici ; si un ticket la contredit, on le signale avant de coder.

---

## C-01 — Les tables `Crm*` sont créées en SQL manuel ET déclarées dans `schema.prisma`

**Décision.** Le fichier `prisma/migrations/manual/2026_10_26_crm_pilot.sql` crée
les tables, idempotent et additif. Les mêmes tables sont déclarées dans
`schema.prisma` pour que le client Prisma les expose.

**Pourquoi.** Le dossier produit impose la migration SQL manuelle, comme toutes
les tables ajoutées au Dashboard depuis 2026. Mais le Dashboard documente aussi
le coût de la variante stricte : neuf tables y vivent uniquement en SQL manuel,
donc hors de `prisma.*`, et tout `/api/rdv/*` ou `/api/prescriptions/*` passe par
un pool `pg` en requêtes paramétrées. Pour neuf tables neuves et un module entier,
ce coût serait permanent.

Le Dashboard a déjà un précédent pour la voie retenue : `LoginAttempt`,
`ModuleInfoItem` et `TicketMessage` sont nées manuelles puis ont été rapatriées
dans `schema.prisma`, leur `.sql` conservé, le `IF NOT EXISTS` évitant le conflit.
Pilot naît directement dans cet état.

**Conséquence.** Ne jamais lancer `prisma migrate reset` ni `prisma db push` sur
une base qui contient des données : les tables manuelles du Dashboard seraient
perdues ou marquées en dérive. En local, Pilot a sa propre base, la question ne
se pose pas ; à l'intégration, elle se posera.

**Écarté.** Tout en SQL brut via un pool `pg` : fidèle à la lettre, mais neuf
tables sans typage et une requête paramétrée à la main par écran.

---

## C-02 — Les modèles du Dashboard sont reproduits en miroir, au minimum utile

**Décision.** `User`, `Product`, `UserProduct`, `UserNumber`, `ExamMapping` et
`Call` figurent dans `schema.prisma`, avec les noms de champs exacts du
Dashboard, sous un bandeau « miroir ». Ils ne partent pas dans la migration
appliquée au Dashboard.

**Pourquoi.** Pilot doit tourner et se démontrer avant d'être greffé au dépôt
dashboard. Sans ces tables, aucune case automatique ne peut être éprouvée.
Reprendre les noms exacts fait que le code de Pilot se transpose sans réécriture.

**Règle qui ne bouge pas.** Pilot lit ces tables, il ne les écrit jamais — sauf
le seed, qui fabrique le décor local, et les comptes de l'équipe, que le
super-administrateur crée depuis Pilot (C-64, une seule exception écrite).
Le dossier produit est net : « Pilot lit, il n'écrit jamais la configuration.
Pas de double vérité. »

---

## C-03 — L'authentification est un bouchon en local

**Décision.** `src/lib/session.ts` renvoie le premier compte interne trouvé. Pas
d'écran de connexion, pas de NextAuth configuré.

**Pourquoi.** En production, Pilot vit dans l'espace admin du Dashboard et hérite
de sa session : NextAuth, rôles `SUPER_ADMIN` / `ADMIN` / `CLIENT`, sous-comptes,
permissions par page. Construire une seconde authentification ici reviendrait à
écrire du code destiné à être jeté le jour de l'intégration.

**Conséquence.** La règle « seules la direction et les commerciaux modifient les
montants » est écrite (`peutModifierLesMontants`) mais n'a pas de dents tant que
la session est un bouchon. À brancher au premier jour dans le dépôt dashboard.

---

## C-04 — Le registre de complétude passe par un adaptateur

**Décision.** `src/lib/completude/adapter.ts` expose `evaluerCentreProduit`, qui
lit les tables miroir en local. À l'intégration, l'implémentation est remplacée
par un appel à `evaluerCentre` du Dashboard ; le reste du code ne bouge pas.

**Pourquoi.** « Pilot ne recalcule rien, il lit `evaluerCentre`. » Une seconde
implémentation du calcul de complétude donnerait au parc deux vérités, ce que le
dossier interdit explicitement.

**Seuil local.** `MAPPING_EXAMENS_MINIMUM = 5` est une valeur de démonstration,
pas une règle métier. Elle disparaît avec l'adaptateur.

---

## C-05 — Le référentiel de check-list vit dans le code, pas en base

**Décision.** `src/lib/checklist/definition.ts` porte les onze étapes, leur mode
de cochage, les produits concernés, la source, la durée attendue et le caractère
bloquant. La base ne stocke que la clé de l'étape et son état.

**Pourquoi.** Faire évoluer le référentiel ne doit pas demander une migration.
Les lignes déjà cochées restent valables : elles sont retrouvées par leur clé.

**Durées attendues.** Elles ne figurent pas dans le dossier produit, qui dit
seulement « plus longtemps que la durée prévue pour elle ». Les valeurs posées
ici sont une première estimation, à corriger avec le chef de projet.

---

## C-06 — L'invariant « étape automatique » est gardé côté serveur

**Décision.** `cocherEtape` refuse toute étape dont le mode est `AUTOMATIQUE`,
avec un 409. L'interface grise la case, mais ce n'est pas elle qui protège.

**Pourquoi.** Le dossier produit en fait une règle, pas une préférence : « Une
étape automatique ne peut pas être cochée à la main, pour qu'il n'y ait jamais
deux vérités. » Une garde seulement visuelle tombe au premier appel direct.

**409 et non 403.** La demande est légitime ; c'est l'état du monde qui la
refuse. Le Dashboard répond déjà ainsi sur ses transitions illégales.

---

## C-07 — L'argent est en centimes, entiers

**Décision.** Toutes les colonnes monétaires sont des `Int` nommés
`*Centimes`. Aucun flottant, aucune conversion avant l'affichage
(`src/lib/argent.ts`).

**Pourquoi.** Une projection sur 24 mois multiplie et additionne des montants
pondérés par des probabilités. En flottant, l'écart se voit à l'écran.

---

## C-08 — Les alertes sont calculées à la lecture, jamais stockées

**Décision.** `src/lib/alertes.ts` recalcule les cinq alertes à chaque appel.

**Pourquoi.** Leur valeur dépend de l'heure qu'il est. Le Dashboard a déjà tranché
ainsi pour ses sondes de déploiement : « Le statut est dérivé à la lecture, jamais
stocké — il dépend de l'heure qu'il est. »

**À l'intégration.** Elles partent dans `Notification` et en mail Brevo, assignées
au responsable du client, ce qui est une écriture — mais d'une notification, pas
d'une vérité.

---

## C-09 — Nom des produits dans `Product`

**Décision.** Le seed crée `LyraeTalk`, `Konnect` et `Desk`.

**À vérifier avant l'intégration.** Seul `LyraeTalk` est certain : c'est une
chaîne magique en dur dans une soixantaine d'endroits du Dashboard, dont un en
`toLowerCase()` et les autres en comparaison stricte. Les libellés exacts de
Konnect et de Desk dans la table `Product` de la base de production n'ont pas été
lus. Les corriger ici est sans conséquence ; les renommer en base casserait le
Dashboard sans erreur de compilation.

---

## C-10 — Données de démonstration neutres

**Décision.** Le seed n'emploie aucun nom de ville, de cabinet ou de patient
réel : Alpha, Beta, Gamma, « Site principal », « Centre scanner ».

**Pourquoi.** C'est la règle de neutralité du brief Lyrae appliquée aux seeds, et
cela évite d'écrire le parc réel dans un dépôt de travail. Le parc réel s'importe
dans une base, pas dans un fichier versionné.

---

## Questions ouvertes, non tranchées ici

- **Le modèle tarifaire de Lyrae.** Forfait, usage, par site, par poste ? Le
  dossier produit le signale lui-même comme non décrit dans le workspace.
  `CrmLigneContrat` couvre forfait et usage, par site ou pour l'organisation
  entière, mais la structure doit être validée.
  Au passage, le dossier place cette validation « avant le lot 3 » alors que le
  chiffre d'affaires est le lot 2 : à lever.
- **Le nom « Pilot »**, à côté de Véga.
- **L'import d'un historique existant** (tableur, mails) au démarrage.
- **Les durées attendues** de chaque étape de la check-list (voir C-05).

---

## C-11 — En local, le schéma se pose par `prisma db push`, pas par `prisma migrate`

**Décision.** `npm run db:push` pose le schéma dans la base locale. Il n'y a pas
de dossier `prisma/migrations/` versionné en dehors de `manual/`.

**Pourquoi.** `prisma migrate dev` a besoin d'une *shadow database*, donc du
droit `CREATEDB` sur le rôle applicatif. Le rôle `pilot_app` ne l'a pas, et il ne
doit pas l'avoir : c'est un rôle d'application, pas d'administration — la même
logique que le rôle `konnect_app` de Konnect, non-superuser et non-bypassrls pour
que la RLS ne soit pas contournable.

Surtout, un historique de migrations Prisma ici n'aurait aucune valeur à
l'arrivée : le Dashboard applique les tables `Crm*` par le fichier manuel
(C-01), pas par cet historique. Deux histoires de migration pour les mêmes
tables, c'est une de trop.

**Vérifié.** Le fichier `manual/2026_10_26_crm_pilot.sql` a été rejoué sur une
base où `db push` avait déjà tout créé : il passe sans erreur. L'idempotence
annoncée est donc réelle, pas seulement intentionnelle.

---

## C-12 — Vitest, seule bibliothèque ajoutée

**Décision.** `vitest` en devDependency, version épinglée. `npm test` lance les
tests colocalisés `src/**/*.test.ts`. Ils portent sur les fonctions pures :
`transitionPermise` (table des cent paires écrite en dur), garde de changement
d'étape, ligne d'audit, fusion et curseur de la chronologie, autorisations,
référentiel de check-list, validation des échanges.

**Pourquoi.** Un code sans test ne se transpose pas sereinement au Dashboard.
Les règles qui ne se négocient pas (étape automatique, transitions, rien dans
les logs) doivent tomber en rouge, pas en revue.

**Complément.** `scripts/verifier.ts` (`npm run verifier`) rejoue les six cas
HTTP du brief et les faits du §11 contre le serveur de développement, en lisant
les identifiants en base. Il modifie la base : relancer `npm run seed` après.

**Écarté.** Jest (plus lourd, configuration TypeScript à part) ; tests
d'intégration contre une base dédiée, tant qu'aucune base de test n'existe.

---

## C-13 — `avant` / `apres` du journal en `jsonb`

**Décision.** `CrmEvenement.avant` et `apres` sont des colonnes `Json`. Elles ne
portent que des champs Pilot : jamais de donnée patient, jamais le compte rendu
d'un échange, jamais le texte du commentaire d'une étape (liste des présents),
jamais les champs d'un contact supprimé.

**Pourquoi.** Chaque type d'événement a sa forme ; une colonne par champ
suivi ferait une table creuse qui grossit à chaque incrément.

---

## C-18 — Deux responsables par organisation

**Décision.** `responsableId` reste le commercial ; `chefDeProjetId`, optionnel,
désigne le chef de projet d'intégration. Sans chef de projet, le commercial
reçoit tout.

**Pourquoi.** Réponse Q4 du 26/10/2026.

---

## C-22 — La ligne d'audit part après le commit

**Décision.** `journaliser(tx, e)` écrit `CrmEvenement` dans la transaction et
produit la ligne JSON `{ niveau: "audit", type, organisationId, auteurId,
resume, ts }`. Les mutations passent par `transactionJournalisee`, qui retient
ces lignes et ne les écrit sur stdout qu'une fois la transaction validée.

**Pourquoi.** Une ligne d'audit écrite puis annulée par un rollback dirait à
Grafana qu'une chose a eu lieu alors qu'elle n'a pas eu lieu.

**Règle.** `resume` est affiché et loggé : il ne contient jamais de compte
rendu, de nom de contact ni de commentaire d'étape. Il est construit depuis des
libellés du code (« Appel noté », « Coché : Formation des secrétaires · Site
principal · LyraeTalk »).

---

## C-23 — `etapeDepuisLe` rempli à l'ajout de la colonne, une seule fois

**Décision.** Le fichier `2026_11_01_pilot_journal.sql` ajoute `etapeDepuisLe`
dans un bloc qui ne s'exécute que si la colonne n'existe pas, et remplit les
lignes existantes avec `COALESCE("dateSortie", "creeLe")`.

**Pourquoi.** « Maintenant » ferait croire que tout le parc vient de changer
d'étape. Un `UPDATE` hors de cette condition casserait l'idempotence : rejouer
le fichier écraserait les dates posées depuis par `changerEtape`.

**Nommage.** Les fichiers SQL des incréments suivent l'ordre du §3.4 de
l'architecture : `2026_11_01_pilot_journal`, puis `_02_actions`,
`_03_attentes`, `_04_vagues`, `2026_12_01_propositions`, `_02_ca`. L'ordre
alphabétique du script d'application est ainsi l'ordre de livraison.

---

## C-24 — Chronologie : curseur composite, pas de `relationJoins`

**Décision.** La chronologie d'une fiche fusionne échanges et événements,
triés par date décroissante, puis l'échange avant l'événement, puis id
décroissant. Le curseur de pagination porte les trois (`date~nature~id`). Les
événements `ECHANGE_SAISI` et `ECHANGE_MODIFIE` n'y figurent pas : l'échange
lui-même y est déjà. Lecture par pages de 50, cinq requêtes au plus quelle que
soit la taille de l'historique.

**Pourquoi.** Les échanges sont datés au jour, donc souvent du même minuit. Un
curseur sur la date seule perdait ceux qui tombaient à la frontière de deux
pages.

**Écarté.** La fonctionnalité Prisma en préversion `relationJoins`, qui aurait
ramené la lecture à deux requêtes : elle change la stratégie de chargement de
tout le client et n'existe pas au Dashboard.

---

## C-25 — Autorisations : un rôle CLIENT n'ouvre rien de Pilot

**Décision.** `src/lib/autorisations.ts` porte la table du §9.1 de
l'architecture. « Tous » désigne les comptes internes (`SUPER_ADMIN`,
`ADMIN`) ; un compte `CLIENT` reçoit 403 partout. Ordre des gardes dans chaque
route : session, autorisation, validation, existence, métier, journal.

**`peutModifierLesMontants`** a quitté `session.ts`. En A, la fiche
l'appelle pour dire « Montants en lecture seule pour votre rôle » ; les routes
de contrats, propositions et opportunités l'appelleront dès leur création
(incréments G et H). À l'intégration, seul `session.ts` change (C-03).

---

## C-26 — Concurrence : écriture conditionnelle, 409 au second

**Décision.** `changerEtape` écrit sous condition de l'étape lue ; le cochage
manuel écrit sous condition de l'état `faite` lu, et la création d'une case
s'appuie sur l'unicité `(centre, produit, clé)`. Le perdant d'une course reçoit
un 409 « Rechargez la page ».

**Pourquoi.** Sans cela, deux déplacements simultanés appliquaient une
transition jamais vérifiée, et deux cochages simultanés journalisaient deux
fois le même fait.

**Corollaire.** Rester en Perdu ou En sommeil avec une autre raison corrige la
raison (événement `ORGANISATION_MODIFIEE`), sans toucher à la date de sortie.
Un commentaire seul sur une case ne change ni sa date ni son auteur, et ne
produit pas d'événement de cochage.

---

## C-27 — Le journal ne garde aucune valeur d'un contact

**Décision.** Les événements `CONTACT_AJOUTE` et `CONTACT_MODIFIE` ne portent
dans `avant` / `apres` que la liste des champs touchés (`{ champs: ["email"] }`),
jamais leurs valeurs. `CONTACT_SUPPRIME` ne porte rien. Les résumés disent
« Contact ajouté », « Contact modifié », « Contact supprimé », sans nom.

**Pourquoi.** Une valeur écrite dans le journal survivrait à la suppression du
contact : la suppression sur demande (§9.2 de l'architecture) ne serait plus
réelle. Les organisations, centres et rattachements, qui ne sont pas des
personnes, gardent leurs valeurs avant / après.

**Corollaire.** Supprimer un contact laisse ses échanges en place, sans nom de
contact (clé étrangère `SET NULL`). Un seul contact principal par organisation :
en nommer un autre retire le drapeau au précédent dans la même transaction,
sous verrou de l'organisation. Supprimer le principal n'en promeut aucun : le
bloc « À compléter » le redemande.

---

## C-28 — Un centre n'emprunte que les accès produit de son client

**Décision.** Rattacher un centre à un compte Dashboard (`UserProduct`) exige :
le même produit, un accès non retiré, aucun autre rattachement Pilot sur ce
compte (409), et, quand l'organisation a déjà son compte Dashboard, que l'accès
appartienne à ce compte (400). L'écran ne propose que les accès du compte du
client ; sans compte connu, il invite à l'associer d'abord.

**Pourquoi.** La fiche se montre au client. La liste des comptes ne doit jamais
afficher l'email d'un autre client, et un centre lié à l'accès d'un autre
client cocherait sa check-list avec les faits de quelqu'un d'autre.

**Toujours lecture seule.** Pilot lit `User` et `UserProduct`, il n'y écrit
rien ; le script de vérification compare les deux tables avant et après.

**À l'intégration.** Si le Dashboard rattache des sous-comptes à un compte
principal, la règle « même compte » devra suivre ce lien : à vérifier sur le
schéma réel.

---

## C-29 — Fiche à onglets dès B, avancement compté sur le référentiel

**Décision.** La fiche organisation passe aux onglets du §6.3 dès
l'incrément B : Résumé, Contacts, Centres, Argent, Chronologie. L'onglet actif
est dans l'URL (`?onglet=centres`). Négociation arrivera avec les propositions
(G). Le Résumé porte un bloc « À compléter » calculé par une fonction pure
(`aCompleter`), dont chaque ligne ouvre l'onglet et le formulaire concernés.

**Avancement.** Le compte « 2/10 » et les bloquantes ouvertes partent du
référentiel du produit (`etapesDuProduit`), pas des lignes présentes en base :
une case pas encore créée est une case ouverte. Sinon un centre jamais évalué
affichait « 2/2, rien de bloquant ».

**Évaluation ponctuelle.** Rattacher un produit ou changer son compte Dashboard
lance `evaluerCentre` après le commit, pour que la check-list existe aussitôt.
Un échec de cette évaluation est écrit en log (identifiant seul) et ne fait pas
échouer le rattachement, déjà validé. Elle n'est pas journalisée : l'incrément D
la remplace par l'évaluation par lots, qui journalise.

**Formulaires.** Dialogues MUI (Échap ferme), premier champ en focus, Entrée
soumet, Ctrl+Entrée aussi dans un champ multiligne. Un refus nomme le champ à
corriger (« Vérifiez le champ « Nom du contact » ») ; une erreur serveur
inattendue reste une phrase, jamais un message technique.

---

## C-30 — La prochaine action vient de la dernière décision, et une action faite ne revient pas

**Décision.** La prochaine action d'une organisation (`prochaineAction`,
`prochaineActionLe`) est calculée par une fonction pure, `prochaineActionDe`,
et recalculée à chaque écriture d'un échange :

- l'**action courante** est celle de l'échange réalisé le plus récent qui en
  porte une. Les actions des échanges plus anciens sont dépassées par cette
  décision et ne reviennent jamais ;
- chaque **rendez-vous planifié** est candidat, passé compris : un rendez-vous
  passé non confirmé attend « réalisé » ou « annulé » ;
- la date la plus proche l'emporte. Une action sans date ne passe devant un
  rendez-vous que s'il n'y en a aucun.

**Écart avec l'architecture.** Le §8.6 dit « la plus proche date future parmi
les échanges réalisés portant une prochaine action non faite ». Pris à la
lettre, une action en retard disparaissait (elle n'est plus future) et une
action marquée faite pouvait ressusciter celle d'un échange plus ancien. D'où
un champ hors architecture, `CrmEchange.prochaineActionFaiteLe`, posé par
« Fait ». La règle « jamais reculé par une saisie rétroactive » (§3.2) tient :
un échange plus ancien que la décision en cours ne la remplace pas.

**Fait et Replanifier.** « Fait » marque l'action de l'échange source, ou
réalise le rendez-vous. Il accepte une suite facultative (ce qui s'est passé,
prochaine action) qui crée l'échange dans la même transaction. « Replanifier »
déplace la date sur l'échange source et refuse une date passée.

**Dates de contact.** `dernierEchangeLe` et `dernierContactLe` ne bougent que
pour un échange réalisé. Un rendez-vous confirmé après coup garde sa date
prévue ; réalisé en avance, il prend la date de la confirmation.

**Jours civils.** « Aujourd'hui », « en retard » et « demain » sont comptés en
jours UTC, comme les champs date des formulaires.

---

## C-31 — Sorties codées, réveil obligatoire, et ce qu'on en tire

**Décision.** Une sortie en Perdu ou En sommeil exige la précision en texte et
son motif codé (`CrmRaisonSortie`). En sommeil exige une date de réveil à partir
de demain. La reconquête efface motif, précision, date de sortie et réveil.

**Conséquences de lecture.** Un dossier perdu, arrêté ou en sommeil ne remonte
plus dans « À faire » par sa prochaine action ; un dossier en sommeil y remonte
par son réveil. L'alerte « prospect sans contact » ne vise plus un dossier en
sommeil : son silence est voulu jusqu'au réveil.

**Concurrence.** L'écriture se fait sous condition de l'étape et des champs de
sortie lus (C-26), pas de `majLe` : une écriture sans rapport, comme le recalcul
de la prochaine action, ne fait pas échouer un changement d'étape.

---

## C-32 — `decisionAttendueLe` et `solutionActuelle` posés dès l'incrément C

**Décision.** Le fichier `2026_11_02_pilot_actions.sql` ajoute aussi
`decisionAttendueLe` et `solutionActuelle`, que le §3.4 ne range dans aucun
fichier.

**Pourquoi.** `solutionActuelle` fait partie de la qualification à cinq cases
(propositions §3.4), livrée ici. L'alerte `decision-depassee` de l'incrément E
a besoin de `decisionAttendueLe` ; la poser en G l'aurait laissée sans donnée.
`aLaChargeDe` sur `CrmEchange`, qui dépend de `CrmTiers` (incrément D), arrivera
avec les jalons (G).

---

## C-33 — Les alertes lisent le Dashboard par l'adaptateur, en une passe

**Décision.** `completude/adapter.ts` gagne `evaluerPlusieurs(ids)` : l'état de
plusieurs centres en trois lectures, quel que soit leur nombre.
`evaluerCentreProduit` en devient un cas particulier. Les alertes chargent les
tables Pilot puis appellent `evaluerPlusieurs` une fois.

**Pourquoi.** La page Aujourd'hui affiche les alertes à chaque ouverture : la
double boucle d'avant (faiblesse n° 3 du brief) n'était plus tenable. Une
première version lisait `UserProduct` et `Call` en SQL brut, hors de
l'adaptateur : refusée, parce qu'au Dashboard ces faits vivent ailleurs et
viennent d'`evaluerCentre` (C-04). Le calcul pur des alertes et leur
acquittement restent à l'incrément E.

**Mesuré.** `/pilot` : 16 requêtes, identiques à 1 et à 60 organisations, seconde page comprise (`npm run mesurer`).

---

## C-17 — Check-list évaluée par passage périodique, pas à l'ouverture d'écran

**Décision.** `evaluerParc()` met à jour toutes les cases automatiques en cinq
lectures (rattachements, lignes existantes, trois pour l'adaptateur de
complétude) et une seule transaction d'écriture. Il tourne toutes les 15 minutes
(`scripts/evaluer-parc.ts`, ligne de crontab dans
`docs/INTEGRATION-DASHBOARD.md`), à la demande (bouton « Évaluer maintenant »,
réservé à la direction) et à la fin du seed. L'écran Intégrations lit, il
n'évalue plus : il affiche « Évalué il y a 4 min ». Une case jamais évaluée
s'affiche « Pas encore évaluée », ouverte.

**La différence est pure.** `diffEtapes` décide de tout ce qui s'écrit : les
cases MANUEL ne sont jamais touchées ; le volet automatique d'une case MIXTE ne
pose ou n'efface que le motif, seul le volet manuel la coche ; une case
automatique qui passe de faite à vide est une **régression**, journalisée avec
sa date d'avant et affichée en tête de l'écran Intégrations.

**Concurrence.** Un verrou consultatif sépare les passages. Le passage du parc
cède la place s'il en trouve un autre (le suivant rattrapera). Un passage
ponctuel, qui suit un geste humain (cocher, rattacher), attend son tour. Chaque
écriture est conditionnée par l'état lu, date d'évaluation comprise : un passage
ancien n'écrase jamais un passage récent, ni un cochage manuel.

**Écarté.** Garder l'évaluation à l'ouverture de l'écran, en lots : moins de
code, mais un écran qui écrit à chaque lecture et une durée d'affichage qui
grandit avec le parc.

---

## C-34 — Attentes chez les tiers : un fait déclaré, jamais un cochage

**Décision.** Une case MANUEL ou MIXTE peut porter une attente : qui doit agir
(`CrmTiers`), depuis quand, dernière relance, échéance. Une case AUTOMATIQUE ne
peut pas en porter (409), même si l'attente réelle est chez EDL pour le jeton :
la case dit déjà pourquoi elle est vide, et elle se cochera seule. Une case
faite ne peut pas être en attente ; la cocher lève l'attente dans la même
transaction.

**Relance due.** Une attente sans relance, ni demande, depuis plus de 7 jours
remonte dans le bloc « Chez les tiers » de la page Aujourd'hui. La page
`/pilot/attentes` est la liste de relances complète, groupée par tiers.

**La table `CrmAcquittement`** est créée par le même fichier SQL, comme le
prévoit le §3.4. Sa logique arrive à l'incrément E.

---

## C-35 — Alertes : un calcul pur, et seul le silence humain est stocké

**Décision.** `src/lib/alertes/` remplace `alertes.ts` : `charger.ts` lit en
dix requêtes, constantes quel que soit le parc (sept lectures Pilot, trois de
l'adaptateur de complétude, C-33) ; `calculer.ts` est pur (`maintenant` en
paramètre) et rend `{ actives, acquittees }`. Les cinq alertes du lot 1 gardent
leurs clés et leurs textes. C-08 tient : l'alerte n'est jamais stockée.

**Acquittement.** « Mettre en sommeil » écrit un `CrmAcquittement` : clé de
l'alerte, jusqu'à quand (de demain à 90 jours), raison obligatoire. On ne met en
sommeil qu'une alerte réellement active (404 sinon). « Réactiver » ramène la
date de fin à maintenant. La raison reste dans `CrmAcquittement` : ni le
journal, ni le log, ni le résumé ne la portent.

**À moi.** Une alerte commerciale va au commercial (`responsableId`) ; une
alerte d'intégration au chef de projet, et au commercial s'il n'y en a pas
(§8.7).

**Aujourd'hui ne dit pas deux fois la même chose.** Son bloc Alertes omet les
types déjà montrés par un autre bloc de la page (action en retard, sans
prochaine action, réveil, attente sans relance). La page `/pilot/alertes`
montre tout.

**Trois clés du §8.7 arrivent avec leurs données.** Le §10 demande « toutes les
alertes du §8.7 » en E, mais trois s'appuient sur des colonnes livrées plus tard
: `proposition-expiree` (propositions, G), le volet « fin d'engagement » de
`renouvellement` (engagement, H), `silence-renforce` (suivi renforcé, K). Leurs
types existent, leur règle viendra avec la donnée ; aucune colonne n'a été
inventée en E. Le renouvellement est livré sur `renouvelleLe`, à 90 jours.

**Glissement depuis le journal.** Comme le dit le §8.4, le glissement d'une
date promise se lit dans les événements `DATE_PROMISE_CHANGEE` : nombre de
reports, et écart entre la date actuelle et la première date connue. Plus de
deux reports ou plus de 30 jours : alerte. `datePromiseInitiale` (F) ne fera
que simplifier cette lecture.

---

## C-36 — Recherche : POST, début de mot, rien dans les journaux

**Décision.** La recherche Ctrl+K appelle `POST /api/pilot/recherche` avec
`{ q }` dans le corps, et non `GET ?q=` comme l'écrit le §5. Trois requêtes,
huit résultats au plus par groupe (organisations, contacts, centres), à partir
de deux lettres. Correspondance au début d'un mot, insensible à la casse ; les
caractères `%` et `_` saisis restent littéraux.

**Pourquoi.** Le texte saisi est souvent un nom de personne. Dans une URL, il
finit dans les journaux d'accès (Next en développement, le proxy du VPS, Loki
au Dashboard). Dans un corps de requête, il n'y va jamais. Ni la route ni le
service ne journalisent la requête ou ses résultats.

**Écarté.** Garder le GET et filtrer la sortie du serveur : un remplacement de
`process.stdout.write` pour tout le processus, fragile, sans effet sur le proxy,
intransposable au Dashboard. Retirer les journaux d'erreur de Prisma pour la
même raison : on perdait la trace de toutes les autres routes.

**Création depuis la recherche.** « Créer le prospect « x » » ouvre
`/pilot/organisations/nouveau?nom=x`. Ici le texte est un nom d'organisation,
choisi pour être créé ; il peut passer par l'URL.

---

## C-37 — Vagues : une date pour le groupe, un glissement par rattachement

**Décision.** `CrmVague` (§3.3) groupe des rattachements d'une même
organisation, numérotée à la suite sous le verrou de l'organisation. Changer la
date promise d'une vague la reporte sur chacun de ses rattachements, dans la
même transaction, avec un `DATE_PROMISE_CHANGEE` par rattachement modifié.
Entrer dans une vague datée reprend sa date. Un rattachement d'une vague peut
ensuite recevoir sa propre date : un site glisse parfois seul, la fiche le
signale.

**Pourquoi.** Les alertes et le glissement se lisent par rattachement (§8.4,
§8.7). Une date héritée à la lecture aurait fait deux vérités ; la recopie
journalisée en garde une seule, et chaque report reste compté là où il compte.

**Un client à un site ne voit jamais de vague** (propositions, §5.4) : le
bouton « Créer une vague » n'apparaît qu'à partir de deux centres, et l'onglet
Centres garde sa présentation par centre tant qu'aucune vague n'existe. Pas de
suppression de vague dans cet incrément : on en retire les produits.

**Glissement.** `datePromiseInitiale` est posée à la première date promise et ne
bouge plus, même si la date est effacée. Le fichier `_vagues.sql` la remplit une
fois depuis le journal, comme C-23 pour `etapeDepuisLe`. `glissement()` (pur,
testé) compte les reports dans le journal et l'écart initiale → actuelle en
jours calendaires UTC. Plus de deux reports ou plus de 30 jours : alerte.

**Colonnes réservées.** `miseEnProductionLe` et `suiviRenforceJusquAu` sont
créées par ce fichier, comme le range le §3.4, et restent inutilisées jusqu'à K.

**Seed.** Les vagues sont posées sur Gamma, signé pour deux sites. Alpha garde
son seul site intégré à 10/10.

---

## C-38 — Import CSV : refuser plutôt que deviner

**Décision.** `npm run import -- fichier.csv [--essai] [--auteur email]`.
Lecture CSV écrite à la main (RFC 4180, `;` ou `,`, BOM), sans bibliothèque.
Toutes les lignes sont validées avant d'écrire ; les écritures tiennent dans une
transaction ; un seul `IMPORT_EXECUTE` porte les comptes, jamais un nom.
Rejouer un fichier ne change rien.

**Ce qui est refusé, ligne par ligne, avec la colonne en cause :**
- une étape de sortie (Perdu, En sommeil, Arrêté) : elle exige raison et code
  (C-31), à poser dans Pilot ;
- une création sans type : le type ne se devine pas ;
- un nom déjà porté par une organisation sans cette clé : pas de doublon
  silencieux ;
- un e-mail de responsable inconnu ou d'un compte client ;
- une clé répétée dans le fichier.

**Mise à jour.** Seules les cases remplies remplacent une valeur. L'étape ne
change jamais par import : l'écart est signalé dans le rapport. Le dernier
échange ne recule jamais. Le contact principal est retrouvé par e-mail, puis
par nom.

**Champ ajouté.** `CrmOrganisation.notes`, que le §9.6 importe et que le modèle
n'avait pas.

---

## C-39 — Propositions : versions figées, remise par ligne, acceptation en une transaction

**Décision.** `CrmProposition` et `CrmLigneProposition` (§3.3), dans
`2026_12_01_pilot_propositions.sql`. Une seule version en brouillon à la fois
(409 sinon) ; une nouvelle version reprend les lignes, la remise, l'engagement
et le préavis de la plus récente. Une fois envoyée, une version ne change plus :
seuls la réponse du client, les notes et le lien du document se complètent.
Transitions : exactement la table du §8.10, sans retour en arrière.

**Argent.** La remise est en pour-mille entier (C-14) et s'applique à chaque
ligne, part variable comprise, arrondie au centime par ligne
(`montantNet`, arithmétique entière). Les totaux affichés sont la somme des
lignes nettes : la fiche, la comparaison des versions et le contrat créé
donnent les mêmes centimes. À l'acceptation, les lignes du contrat sont
copiées **au montant net** : le contrat dit ce que le client paie, la
proposition garde le brut et la remise.

**Acceptation.** Une transaction (§8.10) : version acceptée, autres versions
en cours refusées, contrat ACTIF, opportunités ouvertes des mêmes produits
gagnées, passage en Signé par `changerEtapeDansTransaction` si la transition
est permise. Sinon le contrat est créé quand même et l'écran dit que l'étape
reste à changer. Un contrat actif déjà présent n'est pas clos : la boîte de
confirmation le signale. Le remplacement d'un contrat viendra avec H.

**Expiration.** `npm run expirer`, quotidien à 06:00 (crontab dans
`INTEGRATION-DASHBOARD.md` §6), rejouable, auteur système.

---

## C-40 — Alerte « proposition expirée » : la dernière version restée sans réponse

**Décision.** Le §8.7 dit « ENVOYEE ou EN_DISCUSSION, validité dépassée de plus
de 3 jours ». Avec l'expiration quotidienne, une telle proposition passe
Expirée dès le lendemain : prise au mot, la règle ne se déclencherait que si le
cron ne tourne pas. Règle retenue : la **version la plus récente** de
l'organisation est Envoyée, En discussion ou Expirée, sans réponse, validité
dépassée de plus de 3 jours, organisation ni cliente ni sortie. Une nouvelle
version, un refus, une acceptation ou une sortie la font disparaître. Une
requête de plus au chargement des alertes (11 au total).

---

## C-41 — Plan de signature : des jalons, pas une table

**Décision.** Comme le proposent les propositions (§4.4), un jalon est un
`CrmEchange` de type JALON, planifié, à la charge de Lyrae ou du client
(`aLaChargeDe`, prévu au §3.2 depuis C et posé seulement maintenant). Son
libellé vit dans `compteRendu`, que le journal ne porte jamais (C-27). Franchir,
replanifier et annuler réutilisent les routes des rendez-vous ; franchir garde
le libellé. Un jalon planifié compte comme un rendez-vous pour la prochaine
action, et Aujourd'hui l'affiche avec son libellé et le côté qui le porte.

**Un jalon franchi n'est pas un contact.** Il n'avance ni `dernierEchangeLe`
ni le dernier contact, et le « dernier échange » de la fiche l'ignore : un
comité tenu chez le client ne dit pas que Lyrae lui a parlé, et ne doit pas
masquer l'alerte « prospect sans contact ».

---

## C-42 — Contrats : trois statuts, une fin d'engagement calculée, un remplacement explicite

**Décision.** Un contrat passe Brouillon → Actif → Terminé, sans retour.
Activer demande une ligne ; un contrat terminé ne change plus ; seul un
brouillon se supprime. Les lignes s'adressent par leur identifiant,
`/contrats/[id]/lignes/[ligneId]`, là où le §5 ne nomme que la collection.

**Fin d'engagement.** Elle n'est pas stockée : `echeancesContrat()` la
calcule depuis le début (ou la signature) et `engagementMois`, en mois
calendaires UTC, le 31 janvier plus un mois donnant la fin février. La limite
du préavis est la fin d'engagement moins `preavisMois`. Une donnée dérivée
stockée aurait fini par contredire ses sources.

**Une fin se pose le jour venu.** Terminer un contrat demande une date
d'aujourd'hui au plus tard. Terminé à une date future, il quitterait dès
aujourd'hui le récurrent signé et les alertes, alors qu'il est encore payé.

**Remplacement (laissé par G, C-39).** À l'acceptation d'une proposition,
chaque contrat actif de l'organisation a sa case « Terminer … à la
signature », décochée par défaut : le contrat coché se termine à la date de
début du nouveau, ou aujourd'hui, dans la même transaction.

**Journal.** La référence est saisie librement : elle reste hors du résumé, et
l'identifiant aussi, qui ne dit rien à l'écran (« Contrat : Actif vers
Terminé »).

---

## C-43 — Renouvellement : l'alerte s'ouvre avant la limite du préavis

**Décision.** Le §8.7 dit « renouvelleLe ou fin d'engagement dans 90 jours ».
Avec un préavis de trois mois ou plus, l'alerte apparaîtrait alors après la
date où il fallait décider. Elle s'ouvre donc 90 jours avant l'échéance la plus
proche, **ou 90 jours avant la limite du préavis** quand celle-ci tombe plus
tôt, tant que la fin d'engagement n'est pas passée. Le détail dit la fin
d'engagement et « décider avant le … », ou « Préavis dépassé depuis le … ».
Même clé `renouvellement-{contrat}`, aucune requête de plus.

---

## C-44 — Opportunités : la probabilité de l'étape, sauf correction à la main

**Décision.** Une opportunité naît à la probabilité de son étape. Une
probabilité saisie la fige (`probabiliteForcee`), et le changement d'étape ne
la touche plus ; « Revenir à l'étape » la libère. La catégorie de prévision
(Engagé, Probable, Possible, Exclu) s'affiche à côté de la probabilité, sans
règle qui les accorde : l'écart entre les deux est l'information que la
direction veut voir (propositions, §4.3). Le démarrage attendu est un mois,
ramené au 1er. Une opportunité gagnée ou perdue ne change plus ; la raison de
perte est obligatoire et reste hors du journal et du log.

---

## C-45 — Projection : un moteur pur, compté au mois

**Décision.** `projeter()` (`src/lib/ca/projeter.ts`) applique le §8.8 sans
accès à la base ni à l'horloge ; le serveur l'appelle pour le premier
affichage, le navigateur à chaque coche ou glisser, sans requête. Les
précisions que le §8.8 laisse ouvertes :
- **Tout se compare au mois**, premier du mois UTC : un contrat qui débute le
  20 compte le mois entier ; un contrat terminé le 10 compte encore ce mois-là.
- **Début d'un contrat = `debuteLe`, sinon `signeLe`.** Un contrat accepté
  sans date de début compte depuis sa signature ; sans l'une ni l'autre, il ne
  compte pas.
- **Les contrats terminés comptent jusqu'au mois de `termineLe`**, comme le
  dit le texte du §8.8 (sa formule ne cite que les ACTIF). Les brouillons ne
  comptent jamais.
- **Un seul arrondi par opportunité et par mois**, sur sa contribution entière
  (abonnement, plus la mise en service le mois du démarrage), comme l'écrit le
  §8.8.
- **Part variable à zéro en I** : la carte `variableMensuelleParLigne` se
  remplira avec les mois figés (J). L'écran le dit.

**Scénarios.** Un nom unique, des notes facultatives, et pour chaque
opportunité ouverte : cochée ou non, démarrage décalé ou non. Une opportunité
créée après l'enregistrement est cochée par défaut, et l'écran le signale. Le
journal ne porte ni le nom ni les notes. Changer de scénario avec des
modifications en cours demande confirmation.

---

## C-46 — Réel mensuel : figé une fois, compté comme la projection

**Décision.** `figerMois` écrit `CrmCaMensuel` pour un mois **terminé** (le
mois en cours est refusé), le 1er du mois à 02:00 (`npm run figer`). Une clé
déjà figée n'est jamais réécrite (C-16) ; rejouer n'écrit rien et ne journalise
rien. Une clé nouvelle dans un mois déjà figé (un contrat antidaté) est
écrite : seul l'existant est intouchable. Un mois sans aucune ligne n'est pas
marqué figé.

**Une seule règle de comptage.** Les contrats du réel sont ceux de la
projection (`contratCompteLeMois`, C-45). Un mois figé et un mois projeté ne
peuvent pas diverger sur la question « ce contrat compte-t-il ».

**Clé.** `AAAA-MM|organisation|produit|centre ou 0` : le même « 2026-10 » que
le cron et l'export.

**Les compteurs passent par un adaptateur** (`src/lib/ca/compteurs.ts`, comme
C-04). En local, le miroir `Call` ; au Dashboard, la source (`Call`,
`CallConversation`, remontée Konnect) reste à trancher (§12), et seul ce
fichier changera. Pas de compteur de SMS en local : la part variable d'une
ligne au SMS vaut zéro et l'écran le dit.

**Deux unités sur une même clé.** Leurs montants s'additionnent, mais
`uniteVariable` et `volumeVariable` restent vides : une ligne de
`CrmCaMensuel` ne porte qu'une unité. Limite connue tant que le modèle
tarifaire (Q1) n'est pas tranché.

**Mois en cours au jour près, jamais écrit.** La part variable projetée à fin
de mois porte le **volume** à fin de mois (`volume × jours du mois / jours
écoulés`), puis retire le volume inclus (§8.9). Projeter le montant aurait
laissé à zéro tout contrat encore sous son forfait.

**La projection lit le réel.** La part variable d'une clé est la moyenne
entière de ses trois derniers mois figés disponibles (un à trois), attribuée à
une seule ligne variable par clé pour ne pas la compter deux fois.

**Comparaison au réel.** Le réel figé de chaque mois (douze au plus) face à la
lecture pondérée du scénario, **rejouée sur l'état actuel** des contrats et des
opportunités : Pilot ne garde pas l'état d'un pipeline à une date passée.
L'écran le dit.

**Export comptable.** Direction seulement, lu dans `CrmCaMensuel` et nulle part
ailleurs. UTF-8 avec BOM, `;`, virgule décimale, CRLF, champs texte entre
guillemets, formules neutralisées. La première ligne avertit « Modèle tarifaire
à valider » tant que `MODELE_TARIFAIRE_VALIDE` reste faux (C-21).

**Fait par un agent Claude.** Le quota de Codex étant épuisé jusqu'au
4 novembre, J a été implémenté par un agent Claude sur le même brief, avec la
même revue.

---

## C-47 — Date réaliste et suivi renforcé : une estimation dite comme telle

**Date réaliste.** `dateRealiste()` applique le §8.3 tel quel : étapes
bloquantes en parallèle, échéance prise en compte, sept jours au moins pour un
tiers externe sans échéance (EDL, opérateur, prestataire du site ; « Autre »,
Lyrae et le client n'en sont pas), puis la durée du passage en production s'il
n'est pas coché. Une case absente en base est ouverte, créée « maintenant ». À
égalité, l'étape critique est la première du référentiel. L'écran écrit
toujours « estimation » à côté, et l'écart avec la promesse en jours.

**Prêt ou pas.** Sur les seules étapes bloquantes (§8.5). La fiche distingue
« Prêt pour la production », « Pas encore prêt », « En production avec
réserves » et « En production ». Le passage en production reste cochable avec
des réserves.

**Suivi renforcé.** Cocher « Passage en production déclaré » pose
`miseEnProductionLe` et 14 jours de suivi, dans la même transaction et le même
événement (une seule ligne de chronologie) ; décocher les efface.
L'évaluateur n'y touche jamais. Pendant la période, 24 h sans appel s'alertent
en bloquant ; le silence se compte depuis le plus récent de la mise en
production et du dernier appel, pour qu'un centre mis en production il y a
trois heures ne sonne pas encore.

**Pas de trou entre les deux silences.** `silence-renforce` remplace `silence-`
seulement quand il sonne. Sinon `silence-` reste dû : une mise en production
récente ne tait pas un centre déjà muet depuis deux jours.

**Aujourd'hui.** Les dates promises à 14 jours sont triées par écart, les plus
en retard d'abord ; la fenêtre est lue en entier puis paginée, comme les
alertes, en un nombre de requêtes inchangé.

**Seed.** Un centre neutre, « Centre d'imagerie Nu », porte le cas du suivi
renforcé et des réserves : aucun rattachement existant ne le pouvait sans
toucher aux faits du §11.

**Fait par un agent Claude**, Codex étant hors quota (comme C-46).

---

## C-48 — Parc : quatre feux qui disent pourquoi, et deux sources pas encore branchées

**Décision.** `/pilot/parc` montre une ligne par centre en production, triée
par gravité, avec quatre feux (Usage, RDV pris, Incidents, Silence) et jamais
de note composite (propositions §7.2). Chaque feu porte sa raison en texte :
une couleur seule ne dit rien, ni à un lecteur d'écran ni à quelqu'un qui doit
agir. Lecture seule, sept requêtes quel que soit le parc.

**En production** : passage déclaré dans Pilot, ou statut EN_PRODUCTION au
Dashboard ; l'un suffit, et la ligne dit lequel manque.

**Seuils dans le code** (comme C-20), révisés après trois mois de parc. Usage :
vert à 80 % du volume annoncé, rouge sous 50 % ; une baisse de plus de 20 %
entre les deux dernières semaines et les deux précédentes fait passer un vert
à orange. RDV : vert à 30 % des appels, rouge sous 15 %. Silence : orange à
24 h, rouge à 48 h, le seuil de l'alerte. Les pourcentages se comparent tels
qu'ils s'affichent, arrondis vers zéro. Le volume annoncé de l'organisation se
répartit à parts égales entre ses rattachements en production.

**Tickets : un adaptateur, pas un miroir deviné.** Le schéma des tickets du
Dashboard n'est pas connu ici, et C-02 interdit un miroir aux noms supposés.
`src/lib/parc/tickets.ts` renvoie « non branché » en local ; le feu Incidents
est gris et le dit. À l'intégration, seul ce fichier change (tickets ouverts
par compte client, lecture seule).

**Desk : rien d'inventé.** L'adoption de Desk n'a pas encore de source ;
`src/lib/parc/desk.ts` renvoie « non disponible » et l'écran dit « Desk n'est
pas encore en service. »

**Une seule règle de renouvellement.** La section « à 90 jours » appelle
`renouvellementContrat()`, extraite de l'alerte (C-43) et partagée, jamais
recopiée.

**Fait par un agent Claude**, Codex étant hors quota (comme C-46).

## C-49 — Une seule conversion pour les dates des requêtes brutes

**Le défaut.** Les colonnes sont des horodatages sans fuseau, écrits en UTC. Un
`Date` passé à une requête brute arrive en timestamptz : Postgres lit alors la
colonne dans le fuseau de la session, Europe/Paris en local. Une action datée de
demain passait pour due aujourd'hui, une date promise du jour sortait de la liste,
une mise en sommeil d'alerte expirait une ou deux heures trop tôt.

**La décision.** `instantSql()` (`src/lib/datesSql.ts`) est le seul passage d'un
instant vers une requête brute. Les requêtes Prisma classiques n'ont pas ce
décalage et ne changent pas. Une date ajoutée à une requête brute passe par là.

**Écarté.** Régler la connexion en UTC dans `DATABASE_URL` : le code resterait
faux sur toute base qui n'a pas ce réglage, et Pilot ne décide pas de la connexion
du Dashboard une fois intégré. Convertir la colonne à chaque requête : le même
résultat, avec un risque de se passer de l'index.

**Contrôle.** `scripts/verifier-fuseau.ts` rejoue chaque borne à une demi-heure
près sur la vraie base. Il affiche le fuseau de la session : en UTC, il ne prouve
rien. Avant le correctif, 8 contrôles sur 13 échouaient.

## C-50 — Aucune barre de défilement horizontale

**La décision.** Tout écran tient dans la largeur de la fenêtre. Cela vaut pour
la page et pour chaque zone intérieure. Une ligne trop large se replie, se
réorganise ou cède ses colonnes secondaires. Elle ne défile jamais.

**Ce que cela change.** Le pipeline passe de dix colonnes de 268 px sur une
rangée à trois rangées : Commercial, Livraison et vie du client, Sorties, les
familles déjà montrées sur Aujourd'hui. Les onglets de la fiche passent à la
ligne. Le tableau des organisations masque ses colonnes secondaires. Les deux
tableaux du chiffre d'affaires se partagent la largeur. Sous 900 px, le menu ne
garde que ses icônes.

**Le défaut trouvé au passage.** Parc faisait 1719 px de large à 1024 px : dans
un `sx` MUI, `width: 1` vaut 100 %, pas 1 pixel. Le texte réservé au lecteur
d'écran poussait donc la page. Toute taille en pixels s'écrit en texte dans
`sx`.

**Écarté.** `overflow-x: hidden` sur la page : la barre disparaît, le contenu
reste coupé. Un pipeline à défilement interne : c'est le problème signalé.

**Contrôle.** Mesurer aussi les zones intérieures : `scrollWidth` et
`clientWidth` de tout élément en `overflow-x: auto` ou `scroll`, pas seulement
ceux de la page. Mesuré à 375, 1024 et 1366 px. Ce contrôle n'est pas automatisé.

**Remplacé par C-51.** Les trois rangées étaient une solution d'attente. Une
famille d'étapes à la fois les remplace. La règle reste.

## C-51 — Refonte visuelle : la maquette Claude Design, dans MUI

**La décision.** L'interface suit la maquette « Lyrae Pilot, Refonte » : encre et
blanc, un seul accent bleu, bouton principal noir, cartes à filet sans ombre,
Inter en chiffres tabulaires. Tout passe par `src/theme.ts`, et les jetons sont
dans `src/jetons.ts`, lisible aussi depuis une page serveur. Les écrans n'écrivent aucun code couleur. Les briques
communes sont dans `src/components/Bloc.tsx`. Aucune bibliothèque ajoutée.

**Le pipeline.** Une famille à la fois, Commercial, Livraison et vie du client,
Sorties, sur quatre colonnes au plus. La famille est dans l'adresse. Le
glisser-déposer agit dans la famille affichée. Pour passer d'une famille à
l'autre, de Proposition à Signé ou vers une sortie, le menu Déplacer reste le
chemin, et un message dit où part la carte.

**Inter.** Chargée par `next/font/google`, déjà dans Next. Le navigateur ne
contacte aucun tiers. Le build, lui, doit joindre Google Fonts : sans réseau, il
échoue. L'aperçu lancé par l'application refusait le certificat de Google : il
démarre avec `NODE_OPTIONS=--use-system-ca` (`.claude/launch.json`). Après un
échec, vider `.next` : le cache garde la police de secours.

**Écarts avec la maquette, assumés.**
- Pas de compteurs dans le menu : ils recalculeraient les alertes à chaque
  navigation.
- Pas d'avatar : la session locale est un bouchon (C-03), et l'initiale coûterait
  une requête sur chaque page pour un décor.
- Le titre « Attentes sans relance » reste « Chez les tiers », le vocabulaire du
  menu.
- Pas de bouton « Reporter la date promise » sur Intégrations : la date se change
  depuis la fiche, seul endroit où l'action existe.
- Les données de la maquette sont fictives : les écrans affichent les vraies.
- La carte « Actions en retard » n'existe pas à part : ces actions sont en tête
  du bloc À faire.
- Les blocs d'exemple de la maquette, comme « État vide, à titre d'exemple », ne
  sont pas repris : un vide s'affiche quand il y a lieu.

**Conservé pour les contrôles.** Les textes que `npm run verifier` lit, comme
« Régressions récentes » ou « dans cette étape depuis », restent mot pour mot.

**À l'intégration.** `src/theme.ts` remplaçait jusqu'ici le thème du Dashboard.
Le rendu de Pilot dépend désormais du sien : garder ces réglages sous `/pilot`, ou
accepter le thème du Dashboard, est une décision à prendre à ce moment-là.

**Écarté.** Reprendre les classes CSS de la maquette telles quelles : une seconde
source de style à côté de MUI, intransposable dans le Dashboard.

## C-52 — Trois étapes de check-list nées d'un déploiement difficile

**La source.** Retour d'un client le 05/11/2026, après un déploiement difficile :
Dashboard envoyé trop tard, paramétrage difficile et long (un mois),
interfaçage Xplore et Dashboard très complexe, robot qui voit souvent un faux
planning complet parce qu'Xplore est mal paramétré, formation au Dashboard
insuffisante. La solution qu'il cite : tester les créneaux.

**La décision.** Trois clés ajoutées à `CrmCleEtape` (on ajoute, on ne renomme
pas), toutes MANUEL et pour tous les produits :
- `ACCES_DASHBOARD_ENTRAINEMENT`, juste après la visio technique : l'accès au
  Dashboard part tôt, sur un site fictif, pour que le client s'entraîne avant
  d'avoir ses vraies données. 7 jours, non bloquante : une fois le paramétrage
  réel commencé, la manquer ne rend pas un passage en production malhonnête.
- `FORMATION_DASHBOARD`, avant le jeton Xplore : la formation de qui paramètre.
  Distincte de la formation des secrétaires, qui vient à la fin et forme à
  l'usage. 14 jours, bloquante.
- `TEST_CRENEAUX`, après le mapping des examens : un essai de prise de rendez-vous
  confirme que le planning vu par le robot est celui d'Xplore. 7 jours,
  bloquante. Aucune sonde ne voit un planning faussement complet : c'est un
  constat humain, donc MANUEL et non AUTOMATIQUE.

**Durée.** `REGLAGES_ROBOT` passe de 21 à 30 jours. Le mapping était déjà à 30.
C'est la correction par le terrain que C-05 annonçait. Une seule source pour
l'instant : à revoir avec le chef de projet sur les prochains déploiements.

**Conséquences.** Le référentiel compte quatorze étapes, et non plus onze (C-05). Le
fichier `2026_12_03_pilot_retour_deploiement.sql` ajoute les trois valeurs.
`npm run evaluer` a créé les nouvelles cases, ouvertes, sur les rattachements
existants. Un centre déjà en production les voit donc ouvertes : il passe « En
production avec réserves » tant qu'on ne les coche pas. C'est voulu, la case dit
ce qui n'a pas été vérifié chez lui. `scripts/verifier.ts` et `prisma/seed.ts`
comptent encore dix étapes Talk (Alpha 10/10) : à mettre à jour avant le
prochain `npm run verifier`.

**Écarté.** Un TEST_CRENEAUX automatique adossé aux appels : un appel qui
aboutit ne prouve pas que le planning est juste. Une étape « paramétrage d'un
mois » : la durée est un attribut des étapes existantes, pas une étape.

## C-53 — Refonte visuelle dans l'esprit des applications Apple

**La décision.** L'interface prend les codes des applications Apple, demandés le
05/11/2026 : fond gris clair, cartes blanches très arrondies à ombre douce et
sans filet, un bleu d'accent (#0071E3) pour les liens, les icônes du menu et le
bouton principal, boutons en pilule de 36 px, grands titres gras. La police est
celle du système sur Mac et iPhone (SF), Inter ailleurs, déjà servie par Pilot.
Tout passe encore par `src/theme.ts` et `src/jetons.ts` (C-51) ; les écrans
n'écrivent toujours aucun code couleur.

**La coquille.** Barre latérale translucide sur toute la hauteur, avec l'icône
de l'application et deux groupes, « Au quotidien » et « Direction ». Barre
d'outils floutée au-dessus du contenu, qui porte la recherche. Sous 600 px, barre
d'onglets en bas, translucide, l'onglet actif en bleu. La recherche s'ouvre en
haut de l'écran, comme Spotlight.

**Les composants.** Les onglets de la fiche deviennent un contrôle segmenté et
passent toujours à la ligne. Les lignes de carte ont un séparateur qui part du
texte, comme une liste iOS. Les cases de check-list se cochent d'un rond bleu,
comme Rappels. Les colonnes du pipeline sont posées sur un couloir gris, la carte
se soulève au survol. Les dialogues ont 22 px d'arrondi et un fond flouté.

**Ergonomie.** Cibles plus hautes (boutons 36 px, lignes 56 px), anneau de
focus de 4 px visible au clavier, transitions de 160 à 240 ms coupées si le
système demande moins d'animations.

**Contrôle.** Aucune barre horizontale (C-50), mesurée à 375, 1024 et 1366 px
sur Aujourd'hui, Pipeline, Intégrations, Organisations, fiche (Centres,
Négociation), Chiffre d'affaires et Parc. Les textes lus par `npm run verifier`
n'ont pas bougé.

**Écarté.** Un mode sombre : il double chaque jeton et doit se vérifier écran par
écran ; à faire à part si on le veut. Les polices SF embarquées : leur licence ne
les autorise que sur les appareils Apple.

**À l'intégration.** Même réserve que C-51 : ce thème remplace celui du
Dashboard sous `/pilot`, à arbitrer ce jour-là.

## C-54 — Un vocabulaire pour qui découvre Pilot, et des écrans qu'on lit d'un coup d'œil

**La source.** Demande du 06/11/2026 : que chaque nom parle à un nouvel
utilisateur, et un design plus abouti dans l'esprit d'Apple.

**Le vocabulaire.** Le glossaire est dans `docs/VOCABULAIRE.md` ; tout texte
nouveau s'y conforme. On nomme ce que l'utilisateur fait (Ventes, Mises en
service, Relances, Clients, Santé des centres), pas l'outil (Pipeline,
Intégrations, Chez les tiers, Organisations, Parc). Les vrais systèmes gardent
leur nom (Xplore, EDL, RIS, Dashboard). « Mise en service » désigne le seul
déploiement d'un centre ; les frais facturés une fois deviennent « frais
d'installation ». « Pondéré » devient « probable », « jalon » « étape clé »,
« en sommeil » « en pause », « mettre en sommeil » une alerte « reporter ».

**Ce qui ne bouge pas.** Les codes et les énumérations (CLAUDE.md). Les
événements déjà journalisés gardent leur résumé d'origine : seuls les nouveaux
prennent les nouveaux mots.

**L'import CSV.** Il reconnaissait les étapes à leur libellé affiché. Les
anciens noms restent acceptés (`ANCIENS_LIBELLES`, jamais affichés), pour qu'un
fichier préparé avant ce changement passe encore.

**Estimation (C-47).** Sur Aujourd'hui, « Estimée au 19 nov. » remplace
« Réaliste 19 nov., estimation » : le mot dit déjà que la date est estimée.
L'écran Mises en service garde « , estimation » à côté de la date.

**Le design.** Il prolonge C-53. Une tuile de couleur par écran dans le menu,
comme Réglages Système, et la sélection en bleu plein. Une pastille ronde de la
même famille devant chaque section, comme les listes de Rappels : une teinte par
sujet, toujours la même (`TEINTES` dans `src/jetons.ts`, composant
`src/components/Tuile.tsx`). Aujourd'hui s'ouvre sur quatre tuiles de résumé
(À faire, Rendez-vous, Alertes, Relances), chacune un lien vers sa section : le
résumé avant le détail. Les couleurs système ne portent jamais de texte, seulement
un pictogramme blanc ; l'état (bloquant, en retard) reste porté par le texte et
les pastilles d'état.

**Contrôle.** 850 tests unitaires et 683 contrôles `verifier` sur 684 (le
684e dépend du jour où le seed est lancé, voir le contrôle L d'Alpha). Aucune
barre horizontale à 375, 1024 et 1366 px.

**Écarté.** Renommer « Prospect », « Signé », « Perdu » : ils sont déjà clairs.
Remplacer « Dashboard » par un nom générique : c'est le nom que le client voit.
Un mode sombre : toujours à part (C-53).

## C-55 — Barres flottantes et un seul bouton plein par vue (Liquid Glass)

**La source.** Repasse du design avec le skill `apple-design` (HIG et Liquid
Glass, mi-2026), le 06/11/2026.

**Ce qui change.**
- Les commandes flottent au-dessus du contenu au lieu d'être des bandes collées
  aux bords : la barre latérale est un îlot de verre arrondi, la recherche une
  capsule, la barre d'onglets mobile une capsule en bas. Plus de filet : le
  contenu passe sous la barre d'outils dans un fondu flouté (effet de bord de
  défilement). Le verre reste réservé aux commandes, jamais au contenu.
- Un seul bouton plein par vue, pour l'action principale de l'écran (Noter un
  échange, Nouveau prospect, Nouveau client, Enregistrer). Les autres deviennent
  des pilules grises, sans bordure : la variante `outlined` de MUI est restylée
  ainsi dans `src/theme.ts`.
- Un bouton pressé s'atténue et se resserre, sans onde.
- Les cibles de la barre d'onglets et de la recherche font au moins 44 px.

**Écarts assumés avec le guide.**
- Le bleu reste #0071E3 et non le bleu système #0088FF : celui-ci n'offre que
  3,4:1 avec un texte blanc, sous le seuil de 4,5:1 pour nos textes de 13 à
  14 px.
- Les tuiles de couleur du menu restent (C-54) : ce sont les icônes de Réglages,
  que le guide décrit pour les rangées de liste.
- Pas de mode sombre : toujours à part (C-53).

## C-56 — NoShow, quatrième produit

**La décision.** `NoShow` (rappels anti-absence avant le rendez-vous) rejoint
Talk, Konnect et Desk dans `TOUS_PRODUITS`. Il suit les étapes communes, sans
« Créneaux testés » ni « Premier vrai appel » : il ne prend ni RDV ni appel. Deux
étapes lui sont propres, `MESSAGES_RAPPEL` (texte des rappels validé par le
centre, bloquante) et `PREMIER_RAPPEL` (premier envoi et première réponse, à
cocher en attendant une source automatique).

**Santé des centres.** Sans appel, les feux Volume d'appels, RDV pris et Dernier
appel d'un centre NoShow sont gris et le disent ; ils seront branchés sur le
journal des envois.

**À vérifier à l'intégration.** Le libellé exact du produit dans la table
`Product` du Dashboard (même réserve que C-09). La ligne n'est jamais créée par
une migration : en local, le seed la pose comme décor.

## C-57 — Une connexion par personne, et un super-administrateur

**La décision.** Chaque personne se connecte avec son e-mail et son mot de
passe (NextAuth, déjà dans la pile, `src/lib/auth.ts`). Le compte est lu dans la
table `User` du Dashboard ; Pilot n'en crée ni n'en modifie aucun (C-02). Un
compte CLIENT est refusé. Le middleware renvoie toute page vers `/connexion` et
répond 401 à toute API sans session. Le rôle est relu en base à chaque appel.

**Remplace le bouchon de C-03** en local. En production, `session.ts` reste le
seul fichier à remplacer par la session du Dashboard.

**Super-administrateur.** `SUPER_ADMIN` a tous les droits, dont l'export
comptable, la vérification des étapes et le traitement de n'importe quelle
demande. Un compte dédié, `admin@exemple.test`, est créé en local.

**Mots de passe locaux.** Hachés avec `scrypt` de Node (aucune bibliothèque).
Le mot de passe de démonstration vit dans `.env` (`PILOT_MOT_DE_PASSE_LOCAL`),
jamais dans le dépôt. `npm run comptes:locaux` le pose sur une base restaurée et
refuse toute base distante.

**Scripts.** `verifier` se connecte comme un utilisateur (`scripts/connexion.ts`).
Les scripts qui appellent les fonctions sans requête HTTP agissent au nom d'un
compte de script (`PILOT_COMPTE_SCRIPT`, sinon le premier compte interne) : ce
chemin n'existe pas pour une requête web.

**Écarté.** Gérer les comptes depuis Pilot : cela contredirait C-02.
Revu en C-64, à la demande : le super-administrateur crée les comptes de l'équipe.

## C-58 — Demander à un collègue d'agir

**La décision.** `CrmDemande` : sur un client, quelqu'un demande à un collègue
de faire une chose, avec une échéance facultative et des précisions. Quatorze
types, dans l'ordre d'un déploiement de prise de RDV en radiologie (rappeler le
client, préparer le devis, valider une remise, obtenir l'accès au RIS, relancer
EDL pour le jeton Xplore, finir l'association des examens, tester les créneaux,
planifier une formation, préparer la mise en service…). Depuis une étape de
mise en service, le type le plus probable est déjà choisi.

**Qui fait quoi.** Le destinataire marque faite, avec une réponse ; le demandeur
annule ; un super-administrateur fait les deux. On ne se demande rien à
soi-même : on note une prochaine action. L'écriture est conditionnée par le
statut lu : le second traitement reçoit 409.

**Où.** Aujourd'hui (tuile et bloc « Demandes pour vous »), la fiche client
(bouton « Demander à… » et bloc « Demandes en cours »), le volet d'une étape, la
page Demandes (pour moi, envoyées, toute l'équipe) et Mon compte.

**Journal.** `DEMANDE_CREEE` et `DEMANDE_TRAITEE` portent le type et le
destinataire, jamais les précisions ni la réponse (C-22).

## C-59 — Une fiche client tirée du terrain

**La source.** Deux ans de mails commerciaux (novembre 2024 à novembre 2026),
lus le 06/11/2026 : ce que l'équipe se demande sans cesse sur un centre. Aucun
nom de client n'est écrit dans le dépôt (C-10).

**La décision.** La fiche gagne : version du RIS, outil de prise de RDV en
place, nombre de secrétaires, équipements par modalité, origine du contact,
GHT ou groupe de rattachement, et ce qui bloque le déploiement (huit causes
relevées : API de l'éditeur, version du RIS, réseau, plages pas ouvertes au RDV
externe, codes examens, téléphonie, HDS/RGPD, décision du GHT). Deux types
d'établissement s'ajoutent : clinique et CHU.

**Listes dans le code.** `src/lib/organisations/referentielClient.ts`, comme la
check-list (C-05) : du texte, pas des énumérations. Le RIS et l'outil de RDV se
choisissent dans une liste ou se saisissent librement.

## C-60 — Reprise du parc : relier les comptes du Dashboard, déclarer ce qui est déjà fait

**Le besoin.** Avant la mise en ligne, les centres déjà en service doivent entrer
dans Pilot. L'import CSV ne crée que l'organisation et un contact (C-38) : ni
centre, ni rattachement au compte Dashboard, ni contrat. Ressaisir le parc fiche
par fiche, en choisissant le bon compte dans une liste, promet des oublis, et
rien ne dit quand la reprise est finie.

**La décision.** Un écran `/pilot/comptes`, « Comptes à relier », calculé à la
lecture comme les alertes (C-08) :
- **Comptes sans fiche** : un accès `UserProduct` actif d'un compte CLIENT
  qu'aucun rattachement ne suit, et dont le compte n'est relié à aucune
  organisation. Trois gestes : créer la fiche, relier à un client existant sans
  compte, écarter.
- **Produits à ajouter** : le même accès libre, sur un compte déjà relié à une
  organisation. L'écran reste utile après la reprise : un produit ouvert au
  Dashboard apparaît ici tant qu'aucun centre ne le suit.
- **Contrats à saisir** : un client Signé, en mise en service ou en service sans
  contrat actif. Son chiffre d'affaires compte zéro tant qu'il manque.
- **Comptes écartés**, avec « Réafficher ».

Quand les trois premières listes sont vides, la reprise est finie.

**Une transaction par geste.** `reprendreCompte()` crée ou relie l'organisation,
crée ou choisit le centre, crée un rattachement par accès, puis journalise. Les
gardes sont celles des écrans existants, réutilisées et non recopiées :
`verifierCompte` (C-28, exportée de `rattacher.ts`), `verifierResponsables`,
`EtapeAutomatiqueError`. Un compte relié à un autre client est refusé (400),
un compte déjà relié aussi (409), un nom déjà pris renvoie vers « Relier à un
client » (409). Un verrou consultatif par compte (72105) sérialise reprise, écart
et réaffichage. Pilot n'écrit toujours rien au Dashboard : il pose
`utilisateurId` sur sa propre table.

**L'étape du client.** Une fiche créée entre directement à Signé, Mise en service
ou En service : la reprise constate un état, elle ne rejoue pas la vente. L'écran
propose En service quand le Dashboard le dit d'un des accès. Une organisation
existante garde son étape : le cycle de vie ne se court-circuite pas.

**Les étapes déjà faites.** Sans elles, un centre en service depuis un an arrive
avec sept ou huit cases manuelles ouvertes. Une semaine plus tard, autant
d'alertes « étape en retard » et une « en service avec étapes bloquantes » par
centre : la page Alertes serait noyée le jour de la mise en ligne. Le dialogue
liste donc les étapes **manuelles et mixtes** des produits repris. Elles sont
toutes cochées par défaut pour un centre en service, aucune sinon. L'humain
décoche ce qui n'a pas été fait. Ce qui reste décoché s'ouvre normalement : c'est
la case honnête de C-52.
- Une étape automatique ne se déclare jamais : refus en 409, côté serveur. Le
  registre de complétude les constate juste après le commit
  (`evaluerSansEchouer`), comme pour tout rattachement.
- Déclarer « Mise en service déclarée » exige sa date, même approximative, jamais
  future. Elle date toutes les étapes déclarées et ouvre le suivi renforcé à
  cette date (C-47). Pour un centre en service depuis des mois, il est déjà clos.
- Chaque case déclarée porte l'auteur et le commentaire « Faite avant Pilot,
  déclarée à la reprise du parc. »
- Un seul événement `COMPTE_REPRIS` par rattachement, avec la liste des étapes, et
  aucun `ETAPE_INTEGRATION_COCHEE` pour elles. Un historique déclaré n'est pas un
  cochage du jour. Les durées réelles par étape, mesurées plus tard sur le
  journal (C-20), l'excluent ainsi naturellement.

**Écarter un compte.** Démonstration, entraînement (C-52), test interne : seule
la décision humaine est stockée, dans `CrmCompteEcarte`, comme un acquittement
(C-35). La précision libre reste dans la table ; le journal ne garde que la
catégorie (`COMPTE_ECARTE`, `COMPTE_REAFFICHE`). Un compte relié à un client ne
s'écarte pas : on ajoute ses produits à la fiche.

**Lecture.** Sept requêtes quel que soit le parc : les accès libres en une
requête brute, le registre par l'adaptateur (C-04, trois lectures), les
organisations, les comptes internes, les contrats à saisir. Aucune écriture.

**Schéma.** `2026_12_07_pilot_reprise.sql` : trois valeurs de
`CrmTypeEvenement` et la table `CrmCompteEcarte`, additifs et idempotents. Deux
relations inverses sur le miroir `User`, comme pour `CrmAcquittement`.

**Limites connues.**
- Un groupe à plusieurs comptes Dashboard bute sur C-28 : un seul compte par
  organisation. Si le Dashboard rattache des sous-comptes, la règle suivra ce lien.
- Les contrats ne se créent pas depuis cet écran : « Saisir le contrat » ouvre
  l'onglet Argent de la fiche, où ils se saisissent déjà (H). Le modèle tarifaire
  reste une question ouverte.
- On écarte un compte entier, pas un seul de ses accès.

**Écarté.**
- Cocher d'office toutes les étapes d'un centre en service : rapide, mais faux
  pour le test des créneaux ou la formation au Dashboard, que les anciens clients
  n'ont souvent pas eus.
- Réutiliser `cocherEtape` en boucle : un événement et une évaluation par case,
  et une date de cochage du jour au lieu de la date réelle.
- Étendre l'import CSV aux centres et aux comptes : le compte Dashboard se choisit
  mieux sur une liste lue en direct que par un email recopié dans un tableur.
- Déduire la date de mise en service du premier appel : l'adaptateur ne la
  fournit pas, et un appel d'essai la fausserait.

**Contrôle.** `regles.test.ts` (16 tests) et `scripts/verifier-m.ts`, joué en
dernier par `npm run verifier` : lecture seule, neuf refus sans écriture, les
cases et les dates d'Omicron, une seule alerte honnête, Nu et Theta, écart et
réaffichage, miroirs inchangés. Seed : Omicron en service sans fiche, Pi à deux
produits, un compte de démonstration, Xi écarté, Konnect ouvert chez Nu.

**Fait par un agent Claude**, dans un worktree séparé (`feat/reprise-parc`), une
autre session travaillant au même moment dans le dossier principal.

## C-61 — Une session périmée renvoie vers la connexion, jamais en erreur 500

**Le défaut.** Le middleware (C-57) ne regarde que la présence d'un jeton. Un
jeton encore valide dont le compte a disparu (après un `npm run seed`, une
suppression au Dashboard) ou perdu ses droits passait donc, puis
`utilisateurCourant` levait une erreur 401 dans le rendu de la page : toutes les
pages finissaient en erreur 500, sans dire quoi faire.

**La décision.** Le middleware transmet le chemin demandé dans un en-tête
(`x-pilot-chemin`), toujours réécrit : un client ne le choisit pas. Quand
`utilisateurCourant` refuse, il lit cet en-tête :
- une page est renvoyée vers `/connexion`, avec son adresse de retour et la
  raison (`session` ou `acces`). L'écran de connexion dit pourquoi : « Votre
  session a pris fin. Reconnectez-vous. », ou que le compte n'a plus accès ;
- une API répond 401 en JSON, avec le même message qu'avant : ni les écrans ni
  les contrôles existants ne changent ;
- un appel sans chemin connu répond 401, comme avant.

Une seule fonction pure, `adresseDeConnexion` (`src/lib/refusSession.ts`), sans
dépendance serveur pour que le middleware l'importe aussi.

**Écarté.**
- Une garde dans un `layout.tsx` de `/pilot` : elle ne se rejoue pas à la
  navigation entre deux pages, et chaque chargeur appelle déjà
  `utilisateurCourant`.
- Vérifier le compte dans le middleware : il tourne à la périphérie, sans
  Prisma.
- Une page `error.tsx` : en production, elle ne voit que le condensé de
  l'erreur, pas son statut.
- Déconnecter d'office : la connexion suivante remplace le jeton, et un compte
  sans droits doit lire pourquoi.

**Contrôle.** `refusSession.test.ts` (4 tests) et `scripts/verifier-session.ts`,
joué avant toute connexion : un jeton signé pour un compte absent renvoie
`/pilot/comptes` vers la connexion, et `/api/pilot/alertes` répond 401.

## C-62 — Prospects d'un côté, Ventes de l'autre

**La source.** Retour d'un utilisateur, 06/11/2026 : l'écran « Ventes » n'est
pas intuitif, c'est un écran de prospects. Il attend dans Ventes, pour chaque
client : la date de la réunion de formation, celle de l'interfaçage, la durée
de l'essai, la date officielle de début du contrat, sa durée, la date et les
modalités de reconduction, le nombre et le nom des produits qui tournent avec
leurs dates propres, et les conditions tarifaires négociées.

**Deux écrans.** Le tableau à colonnes garde son adresse (`/pilot/pipeline`) et
prend le nom « Prospects » ; sa première famille devient « Avant la
signature ». Un nouvel écran `/pilot/ventes`, « Ventes », montre ce qui a été
vendu : une carte par client Signé, en mise en service ou en service, avec un
segment « À compléter » et un segment « Terminés ». Sous 600 px, la barre
d'onglets garde quatre entrées (Aujourd'hui, Prospects, Ventes, Alertes) : Mises
en service passe sous « Plus ». Sur Aujourd'hui, Signé et Contrat terminé
mènent désormais à Ventes.

**Une carte dans l'ordre où ça se passe.** Formation, Interfaçage, Essai, Début
officiel, Durée, Reconduction, puis Produits et Conditions tarifaires. Six
cases sur grand écran, deux par ligne sur téléphone, jamais de barre
horizontale (C-50). Chaque case vide dit pourquoi et comment la remplir.

**Formation et interfaçage : lus, pas ressaisis.** Une réunion a sa place dans
le journal : elle y a une date, un statut, et remonte dans Aujourd'hui. Stocker
une « date de formation » sur le contrat aurait fait une deuxième vérité à côté
du rendez-vous. La case lit donc, dans l'ordre : le prochain rendez-vous
planifié ; sinon la dernière réunion faite ; sinon un rendez-vous passé resté
planifié, signalé « à confirmer » ; sinon la dernière case cochée de la
check-list (`FORMATION_DASHBOARD` ou `FORMATION_SECRETAIRES`,
`INTERFACAGE_TELEPHONIQUE`), dite « d'après la check-list ». Un rendez-vous
annulé ne compte jamais. « Interfaçage » devient un type d'échange
(`INTERFACAGE`, valeur ajoutée), parce que le terrain l'entend au sens large :
RIS et téléphonie. Le bouton « Planifier » ouvre le dialogue du journal,
prérempli.

**Ce que le contrat gagne.** Quatre colonnes facultatives sur `CrmContrat` :
- `essaiDebuteLe` et `essaiJours` (1 à 365). La fin se calcule, jour compris :
  30 jours à partir du 3 finissent le 2. L'écran dit « en cours, N jours
  restants », « à venir » ou « terminé ». L'essai ne touche pas au chiffre
  d'affaires : il compte depuis le début officiel (C-45), que le formulaire
  appelle désormais ainsi.
- `reconduction`, nouveau type `CrmReconduction` : tacite, sur accord écrit,
  sans reconduction. La date affichée est la prochaine échéance et la limite du
  préavis de `echeancesContrat()`, la fonction des alertes et de la Santé des
  centres (C-43) : l'écran ne peut pas dire autre chose que l'alerte.
- `conditionsTarifaires`, texte libre de 2 000 caractères : remise, gratuité,
  prix garanti. Les montants restent dans les lignes. Comme la référence, le
  texte reste hors du résumé du journal et des logs.

**Produits.** Un produit par ligne, avec ses propres dates : la première mise
en service de ses centres, sinon la date promise la plus proche. Un produit
vendu sans centre qui le suive le dit. L'abonnement mensuel du produit vient
des lignes du contrat.

**À compléter.** Contrat absent, en brouillon, sans début officiel, sans durée,
sans reconduction ou sans tarif. L'essai n'en fait pas partie : un contrat peut
ne pas en prévoir.

**Écarté.**
- Garder un seul écran avec un onglet « Signés » : le mot « Ventes » restait
  sur un tableau de prospects, ce que le retour reproche.
- Un tableau à neuf colonnes : illisible sans barre horizontale.
- Des dates d'essai et de début par produit : une nouvelle table pour un cas
  rare. Un produit ajouté plus tard à d'autres conditions fait l'objet d'un
  nouveau contrat ; la carte affiche alors chaque contrat à part.
- Calculer les reconductions tacites successives à partir d'une période : la
  règle de renouvellement est partagée avec les alertes (C-43), elle se change
  là, pas dans un écran.

**Schéma.** `2026_12_08_pilot_ventes.sql`, additif et idempotent : une valeur
de `CrmTypeEchange`, le type `CrmReconduction`, quatre colonnes de
`CrmContrat`.

**Contrôle.** `src/lib/ventes/regles.test.ts` (17 tests) et les bornes de
`validation/contrat.test.ts`. Seed : Alpha a un mois d'essai, une reconduction
tacite et des conditions particulières ; Gamma garde son brouillon, Beta et Nu
leur absence de contrat.

## C-63 — L'apport d'affaires, repris du calculateur des apporteurs

**La source.** Demande du 06/11/2026 : implémenter tout ce que fait le
« Calculateur et suivi LYRAE » des apporteurs (artefact partagé), plus une
fonction d'import. Le calculateur configure chaque groupe de radiologie site par
site et salle par salle, suit le parcours de commande, calcule les commissions
par palier mois par mois et prépare les factures des apporteurs à Neuracorp AI.

**Un groupe apporté est un client de Pilot.** Pas de deuxième fiche :
`CrmApport` (une ligne par client, `organisationId` unique) porte ce que la
fiche de signalement ajoute (dénomination, SIREN, siège, type de groupe et
investisseur, décision, périmètre, codes RIS, besoin, observations, offres
validées pour tout le groupe, parcours de commande). Le nom d'usage, les notes,
l'origine et le RIS du groupe restent ceux du client ; les sites sont les
`CrmCentre`, qui gagnent adresse, RIS et offres ; les interlocuteurs sont les
`CrmContact`, édités par l'API existante. Retirer un groupe de l'apport ne
supprime jamais le client.

**Ce qui est nouveau.** `CrmApporteur` (identité de facturation de chacun, dont
l'apporteur par défaut : les champs « émetteur » du calculateur vivent sur sa
fiche), `CrmParametresApport` (une ligne : grille, paliers, calendrier, client
facturé, types de prestataires), `CrmSalle` (une salle, une modalité),
`CrmPrestataire`, `CrmFactureApport` (une par apporteur et par mois
d'encaissement, figée à l'émission). Codes en texte, libellés dans
`src/lib/apports/referentiel.ts`, comme C-59.

**Le calcul.** `src/lib/apports/calcul.ts`, pur, sert à l'écran, aux documents
et aux tests (`calcul.test.ts`, 23 tests). Mêmes règles que le calculateur :
prix TTC ramenés en HT, taux du palier appliqué à tout le portefeuille de
l'apporteur (autres clients compris pour l'apporteur par défaut), part du
co-apporteur, premier encaissement un mois après l'installation, date prévue
dépassée reportée au mois en cours, socle sécurisé, encaissé saisi à la place
du théorique, facture émise figée, caducité de 12 mois prorogée par le bon de
commande, réponse attendue sous 7 jours, clé de Luhn du SIREN.

**Écarts délibérés au calculateur.**
- L'argent en centimes et les taux en points de base (C-07) : 2,5 % = 250.
  Chaque montant est arrondi au centime une fois. Les écarts possibles avec le
  calculateur se limitent au centime.
- L'encaissé saisi est celui du groupe entier ; la part de l'apporteur
  s'applique ensuite. Le calculateur multipliait par la part une valeur dont
  l'indication était déjà la part.
- Le parcours de commande garde ses propres dates (bon de commande envoyé,
  commande validée, commande installée) : ce sont les faits du contrat
  d'apporteur, distincts de l'étape commerciale. Ils ne la font pas bouger.
- Les offres d'un site (Talk, Konnect, connecteur RIS) disent ce qui est
  commandé ; le rattachement d'un produit à un centre (C-28) dit ce qui est
  déployé. Les deux coexistent sans se recopier.
- Un site déjà suivi ailleurs (produit, devis, contrat, check-list) ne se
  supprime pas depuis l'apport.
- Le PDF : pas de bibliothèque ajoutée. Chaque document est une page HTML
  imprimable servie par Pilot ; « PDF » l'ouvre et lance l'impression, où l'on
  choisit « Enregistrer en PDF ». Pas de logo d'apporteur : son identité est
  écrite en texte.
- Aucune barre horizontale (C-50) : le suivi mensuel se lit en deux tableaux,
  mois par mois (mois en lignes) et par groupe (une fenêtre de six mois, trois
  sur téléphone, qui glisse). Les colonnes secondaires cèdent la place.
- L'enregistrement se fait champ par champ en quittant la saisie, comme dans le
  calculateur, avec un indicateur ; chaque écriture passe par le journal, qui
  ne garde que les noms des champs modifiés (C-27).

**L'import, demandé en plus.** Réglages, « Sauvegarde et import » : coller le
texte du bouton « Copier toutes les données » du calculateur ou choisir son
fichier .json, « Vérifier » (rien n'est écrit, un rapport dit ce qui serait
créé, rattaché ou écarté), puis « Importer » (une transaction). Apporteurs
retrouvés par leur identifiant d'origine puis par leur nom ; groupes retrouvés
par leur identifiant d'origine, puis rattachés à un client de même nom sans
apport, sinon créés ; factures reprises sauf si Pilot en a déjà une émise pour
le mois. Un second import ne duplique rien. L'export produit le même format :
l'aller-retour est testé (`importer.test.ts`). Réservé au super-administrateur,
comme l'export comptable.

**Écarté.**
- Une copie du calculateur à côté de Pilot, avec ses propres groupes : deux
  vérités pour un même client.
- Calculer le parcours de commande depuis les devis, contrats et mises en
  service : les dates du contrat d'apporteur ne coïncident pas toujours avec
  elles, et l'apporteur les saisit souvent avant que Pilot ne les connaisse.
- jsPDF et html2canvas : deux dépendances pour ce que l'impression du
  navigateur fait déjà.
- Un tableau de dix-huit mois en colonnes : illisible sans barre horizontale.

**Schéma.** `2026_12_09_pilot_apports.sql`, additif et idempotent : six tables,
cinq colonnes de `CrmCentre`, cinq valeurs de `CrmTypeEvenement`.

**Contrôle.** `calcul.test.ts`, `documents.test.ts`, `importer.test.ts`. Seed :
Alpha apporté et installé depuis cinq mois, Delta en bon de commande partagé à
30 %, Lambda signalé sans réponse, Nu en vente directe. Mesuré sans barre
horizontale à 375, 1024 et 1366 px, page, onglets et fiche du groupe.

## C-64 — Trois rôles : super-administrateur, gérant, développeur

**La source.** Demande du 06/11/2026 : des utilisateurs développeurs, des
gérants et un super-administrateur. Le super-administrateur crée les comptes et
donne les droits. Les développeurs n'ont pas accès au chiffre d'affaires.

**Le conflit, signalé avant de coder.** C-02 et C-57 écartaient la gestion des
comptes depuis Pilot (« Pilot lit la table User, il ne l'écrit jamais »). Trois
voies ont été soumises ; le demandeur a tranché :
- **Pilot crée les comptes** de l'équipe (retenu), plutôt que de les laisser au
  Dashboard ;
- le développeur perd **la page Chiffre d'affaires seulement** (projection,
  réel, scénarios, export comptable), pas les montants des contrats, devis et
  opportunités, ni les Ventes, ni l'apport d'affaires ;
- le super-administrateur choisit **un rôle, puis coche les droits** compte
  par compte.

**Ce qui reste vrai de C-02.** Pilot n'écrit que des comptes de l'équipe
(rôle ADMIN), jamais un compte client ni un super-administrateur, et ne touche
à aucune autre table du Dashboard. Il n'y a pas de seconde table de comptes :
c'est la même table User, donc pas de double vérité. Toutes les écritures de
User sont dans `src/lib/acces/comptes.ts`, à remplacer à l'intégration
(docs/INTEGRATION-DASHBOARD.md).

**La décision.**
- Super-administrateur : le rôle SUPER_ADMIN du Dashboard. Tous les droits,
  toujours ; lui seul ouvre l'écran Équipe et ses routes (`/api/pilot/equipe`).
- Gérant et développeur : des comptes ADMIN, avec une ligne `CrmAccesPilot`
  (rôle, droits cochés, mot de passe provisoire, accès retiré). Aucune colonne
  ajoutée au miroir User.
- Quatre droits à cocher : voir le chiffre d'affaires, exporter pour la
  comptabilité, modifier les montants, vérifier les étapes automatiques. Par
  défaut, un gérant a les quatre, un développeur la vérification seule.
- **Un développeur ne voit jamais le chiffre d'affaires**, même coché :
  l'écran grise la case et dit pourquoi, la route refuse en 400, et
  `droitsEffectifs` l'ignore s'il est en base. L'export sans la vue n'a pas de
  sens et suit la même règle.
- Un compte ADMIN sans ligne d'accès (créé au Dashboard, ou d'avant C-64) est
  traité en développeur : rien n'ouvre le chiffre d'affaires sans décision.
  L'écran Équipe le signale « Rôle pas encore choisi ».
- Les droits sont relus en base à chaque appel, comme le rôle (C-57) : un droit
  retiré, ou un accès retiré, vaut à la requête suivante, sans reconnexion.
- La page Chiffre d'affaires fermée dit pourquoi (« Un développeur ne voit pas
  le chiffre d'affaires ») et ne lit aucune donnée. Le menu n'affiche que ce
  que le compte peut ouvrir ; la garde reste côté serveur.

**Mots de passe.** À la création, Pilot tire un mot de passe provisoire (trois
groupes de cinq signes sans caractère ambigu, `randomInt`), montré une seule
fois au super-administrateur, jamais journalisé. Tant qu'il est provisoire, un
bandeau invite à le changer ; chacun le change dans Mon compte en donnant
l'actuel (douze signes au moins). En cas d'oubli, le super-administrateur en
donne un nouveau, provisoire : l'ancien cesse de marcher.

**Retirer l'accès.** La connexion est refusée et une session ouverte s'arrête à
l'appel suivant. Les clients, demandes et historique de la personne restent.
L'accès se rend d'un clic. Une demande à un collègue dont l'accès est retiré est
refusée ; il reste visible dans les listes de responsables, pour que ses fiches
s'affichent encore.

**Journal.** Six types ajoutés : `COMPTE_CREE`, `ACCES_MODIFIE`,
`ACCES_RETIRE`, `ACCES_RENDU`, `MOT_DE_PASSE_REINITIALISE`,
`MOT_DE_PASSE_CHANGE`. Le résumé nomme la personne et son rôle, jamais
l'adresse e-mail ni un mot de passe.

**Concurrence (C-26).** Un verrou consultatif par compte ; le changement de
droits écrit sous condition de la version lue (`majLe`), le second reçoit 409.
Le changement de mot de passe écrit sous condition de l'empreinte lue.

**Écarté.**
- Ajouter DEVELOPPEUR et GERANT à l'énumération `Role` du Dashboard : c'est un
  miroir, on ne le fait pas évoluer.
- Une table de comptes propre à Pilot : deux vérités pour une même personne.
- Un mot de passe choisi par le super-administrateur : un mot de passe tiré au
  hasard est plus sûr, et la personne choisit ensuite le sien.
- Forcer le changement du mot de passe provisoire avant tout écran : un bandeau
  suffit en interne, sans bloquer une personne pressée.
- Créer un super-administrateur depuis Pilot : ce rôle reste celui du Dashboard.

**Limite connue.** Réinitialiser un mot de passe ne coupe pas une session déjà
ouverte (jeton de 12 h) : pour couper tout de suite, retirer l'accès.

**Schéma.** `2026_12_10_pilot_acces.sql`, additif et idempotent : une table,
deux énumérations, six valeurs de `CrmTypeEvenement`.

**Contrôle.** `droits.test.ts`, `autorisations.test.ts`, `acces.test.ts`,
`motDePasse.test.ts`, et `scripts/verifier-p.ts` (50 contrôles HTTP, joué en
dernier) : développeur refusé sur la page, les données, l'export et les
scénarios du CA ; gérant admis ; création, doublon d'adresse, développeur avec
le CA refusé, connexion avec le provisoire, changement de mot de passe, droits
changés pendant une session ouverte, retrait et retour de l'accès, nouveau
provisoire, journal sans adresse ni mot de passe. Seed : commercial et chef de
projet gérants, `dev.a@exemple.test` développeur. Écrans Équipe et Mon compte
mesurés sans barre horizontale à 375 px.

---

## C-65 — Prospection : la liste « À prospecter » et la fiche de saisie rapide

**La source.** Demande du 06/11/2026 : remplacer le tableur partagé « Map /
Prospection Neuracorp IA » (648 lignes dans l'onglet CRM ML, quatre autres
onglets) par une saisie propre dans l'écran Prospects. Constat sur le tableur :
six colonnes vides à 100 % (priorité, type d'action, prochaine action et sa date,
prestataire téléphonique, interfaçage), des colonnes détournées (un e-mail dans
« PACS », un médecin dans « DPI »), plusieurs contacts dans une cellule, un
statut qui mélange l'action et le résultat, des doublons marqués à la main.

**Ce qui est nouveau.**
- **Une liste « À prospecter »** (`/pilot/pipeline/prospection`) : les
  organisations à l'étape Prospect, une ligne chacune. Recherche, filtres
  (région, priorité, RIS, prise de RDV, type, commercial, origine) et deux
  pastilles « Jamais contacté » et « À relancer ». Tri : priorité, puis
  prochaine action la plus en retard, puis jamais contacté d'abord. 50 lignes
  par page. Elle prend place en tête de la barre des familles d'étapes.
- **La colonne Prospect du tableau** n'affiche plus que les 12 cartes les plus
  récentes, avec un lien vers la liste pour les autres : des centaines de
  prospects froids la rendaient illisible.
- **Une fiche de saisie rapide** en panneau latéral, à la place de la boîte
  « Nouveau prospect » : établissement, outils en place, contacts (dix au plus,
  le premier principal), premier contact déjà eu (canal, date, compte rendu,
  prochaine action). Obligatoires : nom, type, ville et commercial. Les
  doublons possibles s'affichent pendant la frappe, avec un lien qui ouvre la
  fiche existante dans un nouvel onglet. « Créer et saisir un autre » enchaîne
  les saisies ; Ctrl+Entrée crée.
- **Une création en une transaction** (`POST /api/pilot/prospects`,
  `src/lib/prospection/creer.ts`) : organisation, site, contacts, échange et
  prochaine action recalculée. Le journal garde le découpage d'une saisie pas à
  pas (création, centre, contacts, échange).

**Le schéma** (`2026_12_11_pilot_prospection.sql`, additif et idempotent).
- `CrmOrganisation.priorite`, énumération `CrmPriorite` (`A_PLUS`, `A`, `B`,
  `C`) : les quatre niveaux de l'onglet de prospection de JC, seul endroit du
  tableur où la priorité était remplie. L'ordre de déclaration sert au tri.
- `CrmOrganisation.telephone`, `email`, `siteWeb` : le standard de
  l'établissement. Les personnes restent des `CrmContact`.
- `CrmCentre.codePostal` : l'adresse d'un prospect est celle de son site
  (C-63). Un prospect a un site dès sa création, ce qui satisfait aussi « Ajouter
  un premier centre ». La région se déduit du département
  (`src/lib/prospection/regles.ts`) : elle n'est pas stockée.
- `CrmTypeEchange.LINKEDIN` : 19 lignes du tableur notent un contact LinkedIn.

**Les doublons.** Comparés en JavaScript, sans accents, sur les mots qui
distinguent un nom (« CH », « imagerie », « centre »… ne comptent pas). La ville
seule ne rapproche jamais : une clinique de Saint-Étienne n'est pas le CHU.
Quelques centaines d'organisations : aucune extension PostgreSQL à installer.

**Le texte cherché ne passe jamais par l'URL (C-36).** Un nom de cabinet peut
être un nom de personne. La liste et la vérification des doublons appellent
`POST /api/pilot/prospects/liste` et `POST /api/pilot/prospects/doublons`. Les
filtres, eux, sont dans l'adresse de la page, pour qu'un lien les partage.

**Écarté.**
- Une table de prospection à part : deux vérités pour un même établissement.
- La région en colonne : elle se déduit du code postal, une erreur de plus à
  saisir.
- Les colonnes PACS, DPI, prestataire téléphonique et « interfaçage possible »
  du tableur : vides ou détournées.
- L'annuaire FINESS pour remplir la fiche à partir du nom : nouvelle source de
  données, à décider à part.
- La reprise du tableur lui-même : étape suivante, avec un essai à blanc et une
  liste de cas à valider, comme pour Noota et Gmail.

**Contrôle.** `src/lib/prospection/regles.test.ts` (doublons, région,
département de Corse et d'outre-mer, état de contact) et
`src/lib/validation/prospect.test.ts` (minimum exigé, site web complété, email
du standard, dix contacts au plus, canal LinkedIn).

---

## C-66 — Clients classés par RIS et par outil de prise de RDV en ligne

**La source.** Demande du 06/11/2026 : « classer les clients par type de RIS et
par type de rendez-vous web ».

**Décision.** La page Clients gagne un choix « Classer par » (Étape, RIS, Prise de
RDV) et deux lignes de pastilles, une par axe : chaque famille avec son nombre.
Un clic filtre, un second retire le filtre ; les deux axes se croisent (par
exemple, les clients sous Xplore, classés par outil de RDV). Classés par RIS ou
par RDV, les clients se suivent par groupe, du plus fréquent au plus rare, avec
un titre de groupe. Les réglages sont dans l'adresse de la page : ce ne sont que
des noms d'éditeurs, pas de texte saisi (C-36).

**Les familles** (`src/lib/organisations/familles.ts`). `ris` et `outilRdv` sont en
saisie libre (C-59) : « Xplore », « Xplore (EDL) » et « EDL Explore » désignent le
même éditeur, « Doctolib (hôpital, imagerie à confirmer) » reste Doctolib. Pour
classer, chaque valeur est ramenée à une famille ; la valeur saisie ne change
pas et s'affiche telle quelle. Pour la prise de RDV, l'outil cité en premier
l'emporte ; « Téléphone seul », « Formulaire du site » et « Secrétariat
externalisé » forment leurs propres familles, ce qui sépare d'un coup d'œil les
centres qui ont un RDV en ligne de ceux qui n'en ont pas.

**Écarté.** Transformer `ris` et `outilRdv` en énumérations : les valeurs réelles
sont trop variées, et une énumération ne se renomme jamais. Calculer les familles
en SQL : quelques centaines de clients, la liste est déjà chargée en entier.

**Contrôle.** `src/lib/organisations/familles.test.ts` (écritures d'un même
éditeur, réserves, outil cité en premier, répartition).

---

## C-67 — `npm run demarrer` : tester Pilot sans installer PostgreSQL

**La source.** Retour du 17/11/2026 : un commercial a reçu le kit de test
(bundle git et guide) et n'a pas pu monter le site, même avec Claude Code. On a
simulé la réception du kit dans un dossier vierge. Le blocage vient de la base :
le guide suppose PostgreSQL installé et le mot de passe administrateur connu,
deux choses qu'un non-développeur n'a pas. Le bundle, lui, se clone sans GitHub.

**Décision.** Une commande, `npm run demarrer` (`scripts/demarrer.mjs`), qui
embarque sa propre base grâce au paquet `embedded-postgres` (dépendance de
développement, version figée). Au premier lancement, elle crée la base dans
`.pilot-db/` (port 54329, ignoré par git), un rôle `pilot_app` au mot de passe
aléatoire, le `.env`, le schéma, le SQL manuel et le jeu de démonstration. Le
mot de passe des comptes de démonstration est `demo-pilot`. Ensuite, elle
redémarre la base et le site. Si un `.env` existe déjà sans base embarquée, elle
refuse et renvoie vers `npm run dev` : un poste de développeur garde sa base.

Le script rejoue aussi le script d'installation du paquet natif
(`hydrate-symlinks.js`), que npm récent bloque par défaut et dont Mac et Linux ont
besoin.

**Écarté.** Docker : il faut l'installer, avec les droits administrateur. Une
base hébergée : Pilot reste un atelier local (aucun remote). SQLite : Prisma ne
partage pas le même schéma, et le SQL manuel est écrit pour PostgreSQL.

**Hors production.** Rien de ce script ne part au Dashboard
(docs/INTEGRATION-DASHBOARD.md) : en production, Pilot partage la base du
Dashboard.

---

## C-68 — Recherche fixée dans la barre du haut

**La source.** Retour du directeur commercial, novembre 2026 : « une barre de
recherche fixée en haut de la page ». La recherche existait (Ctrl+K, C-36), mais
dans une boîte au centre de l'écran, qu'on ne trouve pas sans connaître le
raccourci.

**Décision.** La recherche est un champ en capsule dans la barre du haut de la
coquille, déjà fixe au défilement. Les résultats s'affichent en liste déroulante
juste sous le champ. Ctrl+K ou Cmd+K y place le curseur ; les flèches parcourent
la liste, avec bouclage ; Entrée ouvre ; Échap vide le champ et le quitte ; Tab
ou un clic ailleurs ferme la liste. Sous 600 px, une loupe ouvre le champ sur
toute la largeur de la barre, et « Fermer » ou Échap le referme. « Créer le
prospect « x » » devient une ligne de la liste, accessible au clavier. Rôles
`combobox`, `listbox` et `option`.

**Inchangé (C-36).** POST avec `{ q }` dans le corps, début de mot, de deux à
quatre-vingts lettres, rien dans les journaux. Seul le nom à créer passe par
l'adresse de la page de création. Les résultats mènent à une fiche par son
identifiant, jamais par le texte cherché.

**Ajouté.** Une pause de frappe de 200 ms et l'annulation de la requête
précédente, pour ne pas empiler les appels. La logique du clavier est pure
(`src/components/recherche/navigation.ts`, 13 tests).

**Écarté.** Garder la boîte de dialogue : elle masque la page et ne se trouve
pas sans le raccourci. Un second champ dans certaines pages : une seule
recherche, une seule règle de confidentialité.

---

## C-69 — RIS et outil de prise de RDV : les valeurs déjà saisies sont proposées

**La source.** Le directeur commercial demande à « saisir un nouveau RIS
directement à la création du prospect ». Le champ l'acceptait déjà, en texte
libre (C-59), mais ses suggestions ne montraient que la liste du code : rien ne
disait qu'on pouvait taper autre chose, et un RIS saisi une fois n'était jamais
reproposé.

**Décision.** Les suggestions des champs RIS et Prise de RDV (fiche rapide,
création et modification d'un client) réunissent la liste du code
(`EDITEURS_RIS`, `OUTILS_RDV`) et les valeurs déjà saisies sur les organisations
et les centres. Les valeurs apprises sont dédoublonnées par famille
(`familles.ts`, C-66) : une famille déjà présente dans le code n'ajoute rien ;
deux écritures d'une même famille donnent la plus fréquente. Ordre : le code,
puis l'ordre alphabétique sans accents. Sous chaque champ : « Choisissez dans la
liste ou saisissez-le. »

**Comment.** Une fusion pure (`src/lib/organisations/suggestions.ts`, 12 tests)
et une lecture unique au rendu de la page (`lireSuggestions.ts`, trois
regroupements), passée en props. Aucune requête à la frappe. « Créer et saisir
un autre » ajoute aussitôt la valeur créée aux suggestions du panneau resté
ouvert.

**Écarté.** Une table de référence des RIS à tenir à jour : une base de plus,
alors que la saisie reste libre. Une recherche serveur à chaque frappe. Une
énumération : les valeurs réelles sont trop variées, et une énumération ne se
renomme jamais (C-66).

---

## C-70 — Un montant sur le prospect et en négociation

**La source.** Le directeur commercial demande « un montant sur un prospect et
sur une négociation ». Les opportunités chiffrées existaient (C-44), mais
seulement dans l'onglet Argent.

**Pas de deuxième vérité.** Aucune colonne de montant sur l'organisation. Le
montant saisi dans la fiche rapide est une **opportunité**, créée dans la
transaction de création du prospect, à la probabilité de l'étape Prospect, non
forcée, sans mois de démarrage.

**La fiche rapide.** Un champ « Montant estimé par mois », en euros à l'écran et
en centimes entiers à l'envoi. `estimerMontant(salles, offres, grille)`
(`src/lib/tarifs/estimer.ts`, pure, tests écrits d'abord) le préremplit : le
prix de chaque offre cochée par salle, plus le pourcentage du connecteur RIS
appliqué au montant des salles (règle de l'apport, C-63), arrondi une seule fois
au centime, le demi-centime vers le haut. Un prix absent donne « incomplet »,
jamais un prix inventé. Une correction à la main n'est plus écrasée par le
préremplissage. Le produit de l'opportunité est la première offre de salle
cochée, Talk avant Konnect : une opportunité porte un produit. Sans Talk ni
Konnect, un montant est refusé avec un message clair. Le nombre de salles va
dans la colonne existante `nombreSalles`. Le droit « Modifier les montants »
est exigé côté serveur, comme sur la route des opportunités (C-64).

**Un seul accès à la grille.** `lireGrilleEnVigueur()` (`src/lib/tarifs/grille.ts`)
rend un type neutre, `GrilleEnVigueur`. Jusqu'au lot S, il lit les réglages de
l'apport d'affaires (C-63) convertis par `prixHt` ; au lot S, seule sa source
change.

**Ce qu'on voit.** `montantAffiche()` (`src/lib/montants/montantAffiche.ts`)
choisit la source du chiffre, et l'écran la dit. La carte du tableau et
l'en-tête de la fiche appellent la même fonction : ils ne peuvent pas dire deux
choses différentes.
- Un contrat actif l'emporte : la somme de ses lignes, libellée « signé ». C'est
  ce que le client paie.
- Sinon la version qui attend une réponse, selon `propositionEnAttente`
  (`src/lib/propositions/regles.ts`, pure) : la dernière version qui n'est pas
  un brouillon, si elle est envoyée ou en discussion. Son total net mensuel,
  calculé par `totauxProposition`, est libellé « proposition v2 ». Plusieurs
  versions peuvent rester ouvertes (envoyer la v2 ne ferme pas la v1), mais une
  v2 refusée, expirée ou acceptée clôt la négociation, même si la v1 est restée
  envoyée (C-40). Un brouillon que le client n'a jamais vu ne compte pas. La
  garde du passage en Signé, la conversion et le bouton « Convertir en client »
  appliquent la même fonction.
- Sinon la somme des opportunités ouvertes, libellée « estimé ».
- Sinon, si un contrat en brouillon existe : « Contrat en brouillon. Complétez
  ses lignes et activez-le dans l'onglet Argent. » Sans le droit « Modifier les
  montants », la carte dit seulement « Contrat en brouillon. » et la fiche dit
  qui peut le compléter. Les trois textes sont des constantes de
  `montantAffiche.ts`.
- Sinon rien, et la fiche dit comment ajouter une estimation.
L'onglet Négociation montre les opportunités ouvertes en lecture seule, avec un
lien vers l'onglet Argent.

**Sans N+1.** Le chargeur du tableau quitte la page pour
`src/lib/prospection/chargerTableau.ts` et lit tout en un nombre fixe de
requêtes, à une comme à soixante organisations. `npm run mesurer` le contrôle
désormais. La fiche n'a gagné aucune requête dans son chargeur : le montant se
calcule sur ce qu'elle charge déjà.

**Une seule création d'opportunité.** La fiche rapide et l'onglet Argent créent
l'opportunité par la même fonction (`creerOpportuniteDansTransaction`), avec le
même événement et le même plafond. La règle de prix par salle est partagée avec
l'apport d'affaires, au centime près (`recurrentDesSalles`, `appliquerTaux`
devenu exact en entiers). Le formatage des montants de l'apport ne passe plus
par un flottant (`eurosCourts`) ; seul changement visible, « 12,5 € » s'écrit
désormais « 12,50 € ».

**À savoir.** Une opportunité sans mois de démarrage n'entre pas dans la
projection du chiffre d'affaires (C-45) : le montant s'affiche, mais la
prévision attend qu'on renseigne le démarrage dans l'onglet Argent. Un
développeur voit ces montants, comme ceux des devis et des opportunités : C-64
ne lui ferme que la page Chiffre d'affaires.

**Correction en passant.** `npm run mesurer` échouait avant ce lot : il attendait
douze lectures pour la page Alertes, alors que la session relit le compte et sa
ligne d'accès depuis C-64. L'attendu est passé à treize, et l'indépendance à la
taille du parc reste contrôlée.

**Ordre des gardes.** Sur `POST /api/pilot/prospects`, le droit « Modifier les
montants » se vérifie après la validation : il ne s'applique que si le corps
porte un montant.

**Écarté.** Une colonne de montant sur l'organisation : deuxième vérité à côté
des opportunités et des propositions. Un montant sans produit. Deviner un prix
absent de la grille. Enregistrer les offres cochées sur le site : à décider avec
les tarifs (lot S).

---

## C-71 — Convertir en client : une étape à la fois, dans une seule transaction

**La source.** Le directeur commercial demande « un passage clair de prospect à
client, qui garde l'historique ». Prospect et client sont déjà la même fiche,
mais le passage ne se voyait pas : il fallait changer d'étape quatre fois, ou
accepter une proposition qui laissait parfois « l'étape à changer ».

**La règle, tranchée par l'utilisateur le 18/11/2026.** `transitionPermise`
n'autorise qu'un pas à la fois, et elle ne change pas. La conversion franchit
donc chaque étape intermédiaire jusqu'à Signé, dans une seule transaction.
`cheminVersSigne(depuis)` (`src/lib/pipeline.ts`, pure) donne la suite des
étapes : de Prospect, Premiers échanges, Étude technique, Devis envoyé, puis
Signé. Elle refuse depuis Signé et après, et depuis Perdu ou En pause. Chaque
pas passe par `changerEtapeDansTransaction` : vérifié par
`verifierChangementEtape`, écrit sous condition de l'étape lue, journalisé avec
la mention « à la conversion » (`apres.conversion: true`). Une erreur à
n'importe quel pas annule tout. La chronologie montre les étapes franchies le
même jour.

**Conséquence acceptée.** Une fiche convertie compte zéro jour dans les étapes
sautées. Le vieillissement par étape l'accepte sans erreur : une étape franchie
à l'instant compte zéro jour (testé).

**Deux chemins depuis un seul bouton.** « Convertir en client » apparaît sur la
fiche à toutes les étapes avant la signature.
- S'il existe une proposition envoyée ou en discussion, le bouton ouvre son
  acceptation (C-39). L'acceptation franchit désormais, elle aussi, les étapes
  manquantes.
- Sinon, une boîte courte demande la date de signature (aujourd'hui au plus
  tard) et, si on la connaît, le début officiel.
  `POST /api/pilot/organisations/[id]/convertir` crée alors un contrat en
  brouillon daté, par la logique des contrats (`creerContratDansTransaction`,
  extraite pour cela), puis convertit. Le client apparaît dans Ventes, segment
  « À compléter » (C-62). Les opportunités ouvertes restent ouvertes : elles
  passent en gagnées quand le contrat passe de brouillon à actif, pour les
  produits de ses lignes, comme à l'acceptation d'une proposition. Les gagner
  dès la conversion aurait fait disparaître le montant de la carte, du probable
  et de la projection, puisqu'un brouillon ne compte jamais (C-45).
L'écran rappelle que la fiche, les contacts et la chronologie restent les mêmes.

**Un contrat actif gagne les opportunités de ses produits.** Au passage de
brouillon à actif, mais aussi quand une ligne est ajoutée à un contrat déjà
actif, ou change de produit : les opportunités ouvertes de ce produit passent en
gagnées dans la même transaction. Sinon la projection compterait le produit deux
fois. `gagnerOpportunitesOuvertes` fait une seule écriture groupée sous le
verrou de l'organisation, puis un événement « Opportunité gagnée » par
opportunité ; si le compte ne correspond pas, 409. Conséquence : une montée en
gamme d'un produit déjà sous contrat passe par une proposition, pas par une
opportunité laissée ouverte.

**L'activation dit ce qu'elle fait.** L'écran écrit le bilan en phrases
courtes : « Contrat activé. 2 opportunités gagnées. Konnect (70,00 € par mois)
reste ouverte : concluez-la dans Opportunités, plus bas. » Une ligne qui gagne
sur un contrat actif donne le même retour. Gagner ne se défait pas (C-44) : il
fallait le dire.

**Le brouillon laissé par une conversion.** À l'acceptation d'une proposition,
le contrat en brouillon sans ligne le plus récent est repris au lieu d'en créer
un second : il reçoit les lignes nettes, la signature du jour, la proposition,
et devient actif. Le début officiel, l'engagement, le préavis et la référence ne
gardent la valeur du brouillon que si l'acceptation n'en donne pas. Un seul
événement : « Contrat en brouillon activé depuis la version N ». Un brouillon
qui a déjà des lignes n'est pas touché, et la boîte d'acceptation le signale.
Sans cela, activer ce brouillon plus tard aurait compté le signé deux fois.

**Gardes côté serveur.** Les droits de changer l'étape et de modifier les
montants, comme la création d'un contrat. 409 si l'étape a changé depuis
l'affichage (`etapeLue`), si l'étape ne se convertit pas, ou si une proposition
attend une réponse : elle doit être acceptée, pas contournée par un second
contrat. Pour la même raison, un passage manuel en Signé (menu d'étape, glisser
dans le tableau) est refusé tant qu'une proposition est envoyée ou en
discussion. Ce passage restait possible avant ce lot. La garde est dans
`changerEtape`, pas dans `changerEtapeDansTransaction`, que l'acceptation et
la conversion appellent. Elle lit l'étape et les propositions sous le verrou de
l'organisation. Un client déjà signé qui revient d'un cran n'est pas concerné :
ce n'est pas une signature. L'étape se vérifie avant les propositions : un
client déjà signé reçoit « déjà client », pas « une proposition attend une
réponse ».

**C-39 amendé.** C-39 disait : à l'acceptation, passage en Signé « si la
transition est permise, sinon l'écran dit que l'étape reste à changer ».
Désormais, l'acceptation franchit les étapes manquantes. Un client déjà signé,
en mise en service ou en service garde son étape : accepter un avenant ne fait
plus revenir un client en Mise en service à l'étape Signé, ce que l'ancienne
règle permettait (recul d'un cran). Un client perdu ou en pause garde aussi son
étape, et l'écran le dit.

**Écarté.**
- Une transition directe vers Signé : elle contournerait `transitionPermise`.
- Un bouton qui n'agirait qu'à l'étape Devis envoyé : trop de clics pour une
  signature rapide, par exemple une vente de RIS au premier rendez-vous.
- Un passage forcé sans journal : la chronologie perdrait les étapes.
- Gagner les opportunités dès la conversion : le montant disparaissait de la
  carte, du probable et de la projection, et la fiche invitait à estimer un
  client signé.
- Reprendre un brouillon qui a déjà des lignes : il porterait deux contenus.

**Contrôle.** `pipeline.test.ts` (chaque étape de départ, chaque refus, chaque
pas permis), `convertir.test.ts` (panne au troisième pas : rien d'écrit, aucune
ligne d'audit), `conversion.test.ts`, `contrats/gerer.test.ts` (l'activation
gagne les seules opportunités des produits de ses lignes), et `scripts/verifier-q.ts` contre le
serveur, dont une panne provoquée au milieu d'une vraie transaction.

---

## C-72 — Les vérifications tournent sur une base à part

**La source.** `npm run verifier` écrit en base, et `npm run seed`, qu'on lance
ensuite, vide toutes les tables. Or la base de travail `lyrae_pilot` contient
désormais la reprise réelle des prospects (C-65). Les jouer dessus l'aurait
effacée.

**Décision.**
- `scripts/dev-base-test.mjs` lance un serveur de développement sur la base
  `lyrae_pilot_test`, port 3102 (configuration `pilot-base-test` de
  `.claude/launch.json`). Il lit l'adresse de la base dans `.env` et n'en
  change que le nom : aucun mot de passe n'est écrit dans le dépôt. Il compile
  dans un dossier à part (`PILOT_DIST_DIR`, lu par `next.config.js`), pour ne
  pas se disputer `.next` avec `npm run dev` ou `npm run build`.
- `npm run verifier:test` joue la vérification contre ce serveur, avec la même
  base pour les lectures directes du script.
- Garde-fou au début de `scripts/verifier.ts` : il refuse une base dont le nom
  n'est pas celui de la base de vérification, sauf `PILOT_VERIFIER_AUTRE_BASE=1`
  posé exprès. Puis il compare une organisation du jeu de démonstration lue par
  le serveur et lue dans sa propre base. Au moindre écart, il s'arrête avant
  tout contrôle. Sans cela, un
  serveur et un script branchés sur deux bases différentes auraient fait
  porter les nettoyages sur la mauvaise base.
- Le contrôle du nom de base vit dans `scripts/garde-base.ts`, partagé par la
  vérification et par la mesure, qui l'appelle avant toute écriture (`figerMois`
  compris). `npm run mesurer` refuse donc la base de travail, c'est voulu :
  `npm run mesurer:test` vise la base de vérification. `scripts/verifier-test.mjs`
  lance l'un ou l'autre avec la bonne adresse.
- `tsconfig.json` garde `.next-base-test/types` dans `include`, que Next
  réécrirait sinon, mais exclut `.next-base-test` : des types périmés du serveur
  de vérification ne font jamais échouer `tsc` ni `npm run build`.

**Écarté.** Une route de santé qui renverrait le nom de la base : une surface de
plus pour une question de poste de développement. Docker ou une base embarquée
pour la vérification : la base de test existe déjà sur le PostgreSQL local.

---

## C-73 — Concurrents : une fiche, des relevés de prix datés, et qui équipe qui

**La source.** Le directeur commercial veut « préciser quel robot concurrent est
en place, et tenir des fiches concurrents (ce qu'ils proposent, leur grille
tarifaire en vigueur) », puis voir les concurrents sur la carte (lot U).

**Le schéma** (`2026_12_12_pilot_concurrents.sql`, additif et idempotent).
- `CrmConcurrent` : nom unique, type (`CrmTypeConcurrent` : robot vocal, centre
  d'appels, secrétariat externalisé, éditeur de prise de RDV, autre), offre,
  site web, notes, auteur, `majLe` pour l'écriture conditionnelle (C-26).
- `CrmReleveConcurrent` : un prix constaté à une date, par salle et par mois et
  à l'installation, en centimes entiers positifs ou nuls (CHECK), avec ses
  conditions et sa source. Les prix changent : un historique de relevés vaut
  mieux qu'un prix écrasé. Le relevé **en vigueur** est le plus récent par date
  puis par identifiant, calculé à la lecture (C-08), servi par un index
  `(concurrentId, releveLe DESC, id DESC)`. Un relevé ne se date pas dans le
  futur. Un prix absent s'affiche « Prix non relevé », jamais 0 €.
- Sur `CrmOrganisation` : `concurrentId`, le concurrent en place, et
  `concurrentGagnantId`, celui qui a remporté une affaire perdue.

**Règles côté serveur.**
- Le nom est unique tel que saisi en base : le dépôt n'a aucun précédent
  d'unicité insensible à la casse. Le serveur compare donc sans la casse ni les
  espaces en trop, sous verrou consultatif, avant de créer ou de renommer ; une
  course est rattrapée par l'unicité de la base. Les accents comptent.
- `concurrentGagnantId` n'existe qu'en Perdu avec le motif `CONCURRENT`, gardé
  en validation et dans le service. La reconquête, la mise en pause et tout
  autre motif l'effacent. Pas de contrainte CHECK : elle aurait cassé la
  reconquête existante (C-31).
- Supprimer un concurrent encore désigné (en place ou gagnant) est refusé en
  409, avec le nombre d'organisations liées. Sans lien, il part avec ses
  relevés.
- Un relevé a sa version (`majLe`), comme le concurrent. Sa modification
  exige la version lue par l'écran et écrit sous condition : une correction faite
  sur un écran périmé reçoit 409. Une première version comparait aux valeurs
  lues par le serveur dans sa propre transaction : elle ne protégeait que
  quelques millisecondes, et l'écran renvoyait tous les champs, si bien qu'une
  correction de la source effaçait en silence un prix corrigé entre-temps. La
  colonne est dans le même fichier SQL, le schéma du lot n'étant pas encore
  livré. L'écran n'envoie que les champs modifiés ; la date seulement si elle a
  changé, pour ne pas ramener une heure à minuit.
- « En place chez N établissements » ne compte que les établissements qui ne
  sont pas clients de Lyrae. La fiche du concurrent les liste tous, ceux passés
  chez Lyrae à part.

**Journal.** Un événement de concurrent n'a pas d'organisation
(`organisationId` est déjà facultatif, comme pour les apporteurs, C-63) : la
cible va dans `avant` et `apres` (`concurrentId`, `releveId`, champs touchés),
jamais l'offre, les notes, les conditions, la source, ni le nom saisi (C-22,
C-27). Huit types ajoutés en fin d'énumération.

**Les écrans.** Une page Concurrents sous « Plus » : liste, fiche, relevés
datés, établissements équipés, affaires perdues contre lui. Un seul sélecteur
pour « Lequel ? » (fiche rapide, quand l'outil de RDV ou la solution saisie
désigne un concurrent), « Concurrent en place » (bloc Solution actuelle de la
fiche, toujours visible) et « Contre qui ? » (sortie en Perdu, motif
Concurrent). Il lit la liste une fois au rendu et crée à la volée par la route
de création, dans un panneau sous le champ : un formulaire dans un formulaire
enverrait les deux. Un concurrent créé à la volée reste en base si l'on annule
ensuite la saisie : c'est accepté. À la création d'un prospect, le concurrent
s'enregistre dans la même transaction. Un prix absent se dit « Prix non relevé »,
avec ce dont il s'agit ; un relevé de plus d'un an est signalé.

**Droits.** Tout compte de l'équipe lit. Créer, modifier et supprimer un
concurrent ou un relevé suit la règle de modification d'une organisation
(`peutModifierPilot`) : un développeur, qui modifie déjà une fiche, le peut
aussi. Ce n'est pas le droit « Modifier les montants » : ce sont des prix
relevés chez un tiers, pas nos montants. Aucun chiffre d'affaires n'est exposé.

**Écarté.** Un prix en vigueur stocké sur le concurrent : une seconde vérité.
Un index unique sur `lower(nom)` : sans précédent, et Prisma ne le déclare pas.
Une contrainte liant le gagnant au motif de sortie.

**Contrôle.** `concurrents/regles.test.ts`, `validation/concurrent.test.ts`,
`changerEtape.test.ts`, et `scripts/verifier-r.ts` contre le serveur. Seed :
« Robot Alpha Voix » et « Centre d'appels Beta », deux relevés chacun, dont un
sans prix d'installation ; Rho et Sigma équipés ; Eta perdu contre le premier.

---

## C-74 — La température d'un prospect : calculée, forçable, expliquée

**La source.** Le directeur commercial demande « un barème de qualification
objectif (taille du centre, salles, RIS, décideur, budget, calendrier) qui
donne froid, tiède, chaud ». Les cinq cases de qualification donnaient un score
« 3 sur 5 » qui ne disait pas où en était le dossier.

**Décision de l'utilisateur.** La température est **calculée** depuis la fiche
et **forçable** à la main, comme la probabilité d'une opportunité (C-44).
L'écran montre le calcul et le forçage. La priorité A+, A, B, C reste le
jugement du commercial et n'entre pas dans le barème.

**Le moteur.** `temperature(entree, maintenant)`
(`src/lib/organisations/temperature.ts`) est une fonction pure : le jour est un
paramètre, elle ne lit jamais l'horloge. La température n'est jamais stockée
(C-08) : elle dépend du jour, par la date de décision. Seul le forçage humain
l'est (`temperatureForcee`, son auteur, sa date ; CHECK : tout vide, ou la
valeur et sa date ensemble).

**Le barème**, référentiel en tête de fichier (C-05), proposé et en attente de
validation par le directeur commercial :

| Critère | Points |
|---|---|
| Salles : 6 ou plus / 3 à 5 / moins ou inconnu | 2 / 1 / 0 |
| RIS : Xplore (EDL) / autre RIS connu ou plusieurs / aucun ou inconnu | 2 / 1 / 0 |
| Décideur parmi les contacts / prescripteur seulement / aucun | 2 / 1 / 0 |
| Budget évoqué | 2 |
| Décision attendue dans les 3 mois / plus loin / passée ou vide | 2 / 1 / 0 |
| Besoin exprimé | 1 |

Seuils, sur 11 : 0 à 4 froid, 5 à 8 tiède, 9 et plus chaud. Garde-fou : sans
décideur parmi les contacts, jamais chaud, et la raison le dit. La température
n'existe qu'avant la signature ; après, et pour un dossier perdu ou en pause,
elle est sans objet, forçage compris.

**Une seule source par critère.** Les salles : `nombreSalles` s'il est
positif, sinon la somme des équipements déclarés (IRM, scanners, radio,
échographes, mammographes), sinon les salles saisies dans les centres. Un 0
compte comme non renseigné. Le RIS : celui de la fiche, sinon ceux des centres,
ramenés à leur famille (C-66). Si un centre au moins est sous Xplore, le
critère vaut 2, même avec d'autres RIS : Desk se branche là où Xplore est
présent. Sinon plusieurs familles valent « plusieurs RIS ». « On ne sait pas »
n'est pas « il n'y en a pas » : « Inconnu », « À vérifier », « NC », « N/A »,
« ? » comptent comme vides, et l'écran demande de renseigner le RIS ;
« Aucun », « Pas de RIS », « Néant » donnent « Aucun RIS », 0 point, avec son
propre conseil. Dans les deux cas, les centres peuvent préciser. Une négation
l'emporte sur le mot Xplore trouvé dans le texte (« Non Xplore »). Une date de décision
passée vaut 0, et la raison le signale : le plan disait « connue mais plus
lointaine » pour une date à venir. Le
décideur : le rôle des contacts. La date : `decisionAttendueLe`. Les cases
« Décideur rencontré » et « Calendrier connu » restent en base mais ne se
saisissent plus et ne comptent plus : deux vérités pour un même critère.
Besoin et budget restent des cases ; « Solution actuelle connue » aussi, hors
barème.

**Question ouverte.** « Desk vise-t-il d'autres RIS que Xplore ? » Tant qu'elle
reste ouverte, Xplore vaut 2 et tout autre RIS connu 1. Si la réponse est oui,
on change une constante, sans migration.

**Le forçage.** `PUT /api/pilot/organisations/[id]/temperature`, refusé hors
des étapes avant signature ; `DELETE` le retire, à toute étape. Un forçage est
un jugement humain : forcer « chaud » sans décideur est permis, le garde-fou ne
borne que le calcul, et l'écran dit ce que dit le calcul. « Corriger » sans rien
changer n'écrit rien ; avec un forçage en place, choisir le niveau du calcul
revient au calcul plutôt que de figer un forçage qui ne suivrait plus le
barème. Quand le dossier quitte l'avant-signature (signature,
perte, pause), le forçage s'efface dans la même écriture, avec
`TEMPERATURE_LIBEREE` : une reconquête repart du calcul. Vers une étape hors
avant-signature, la condition du changement d'étape porte donc aussi sur la date
du forçage lue ; le perdant d'une course lit « Le dossier vient de changer.
Rechargez la page. » (C-26). La garde de
concurrence porte sur la date du forçage lue par l'écran, pas sur `majLe` de
l'organisation, qui bouge à chaque échange saisi et aurait fait échouer un
forçage légitime (C-26, « champs lus »). Événements `TEMPERATURE_FORCEE` et
`TEMPERATURE_LIBEREE`.

**Les écrans.** La température s'affiche dans l'en-tête et un bloc de la fiche
(points par critère, ce qui a été lu, comment gagner des points, « Corriger »,
« Forcée chaud par X le 18/11, le calcul dit tiède »), sur les cartes du tableau
Prospects, et dans la liste À prospecter, avec un filtre et un tri dans
l'adresse ; centres et contacts y sont lus avec les mêmes filtres, par la
relation, jamais par une liste d'identifiants sans borne. La pastille
« Qualification 3 sur 5 » disparaît : un seul score à
l'écran. Le bloc des cases devient « Ce que vous savez du client ». Filtrée ou
triée par température, la liste lit tous les prospects en mémoire, en un nombre
fixe de requêtes : le barème vit dans le code (C-05), il ne se traduit pas en
SQL. Acceptable à quelques milliers de prospects ; `npm run mesurer:test`
contrôle les trois voies. Le tri finit par l'identifiant, pour qu'une ligne ne
change pas de page d'un appel à l'autre.

**Écarté.** Stocker la température. Faire entrer la priorité dans le barème.
Mettre le barème en base : une table pour six constantes. Interdire le forçage
« chaud » sans décideur. Un tri par température en SQL.

**Dates plus strictes, en passant.** `dateValide`, partagé par tout le dépôt,
exige `AAAA-MM-JJ` ou un ISO complet qui commence ainsi, et un jour qui existe :
il acceptait « 1 » (l'an 2001), « Nov 18 2026 » et faisait du 29 février 2027 un
1er mars sans rien dire. Tous les formats envoyés par les écrans, les scripts et
les imports restent acceptés (vérifié). La convention du jour UTC ne change pas
(C-49).

**Contrôle.** `temperature.test.ts` (55 cas), `qualification.test.ts`,
`verifier-r.ts`. Seed : Rho froid, Sigma tiède, Tau chaud, Upsilon calculé
froid et forcé chaud par le commercial, vérifiés avec le moteur.

---

## C-75 — Une grille tarifaire commune et datée, en HT, que l'apport lit aussi

**La source.** Le directeur commercial veut une proposition préremplie avec la
grille tarifaire en vigueur. La grille existait, mais enfermée dans l'apport
d'affaires (`CrmParametresApport`, C-63), en TTC, et incomplète : Desk et
NoShow n'y ont pas de prix. Décision de l'utilisateur : c'est la grille
officielle, elle devient une page Tarifs commune et datée.

**Tout est en HT.** Propositions, contrats et grilles. Rien ne l'écrivait, et
aucun montant n'a jamais porté de TVA ; seule la grille de l'apport était TTC.

**Le schéma** (`2026_12_13_pilot_tarifs.sql`, additif et idempotent).
- `CrmGrilleTarifaire` : une date d'application unique, à minuit UTC (CHECK),
  des notes, un auteur, une version (`majLe`, C-26). La grille **en vigueur**
  est la plus récente qui ne dépasse pas aujourd'hui ; une grille datée dans le
  futur est la **prochaine grille**. Les deux se calculent à la lecture (C-08).
- `CrmTarif` : un libellé (ce que l'écran affiche), un **code** stable et unique
  dans la grille (`TALK`, `KONNECT`, `DESK`, `NOSHOW`, `CONNECTEUR_RIS`,
  `INSTALLATION_TALK`…) qui retrouve un tarif sans dépendre de son libellé, un
  type de ligne, une base (`CrmBaseTarif` : par salle, par site, par
  organisation, pourcentage), un montant HT en centimes et un ordre. Un montant
  vide se lit **« Prix à renseigner »**, jamais 0 €. Une base pourcentage porte
  un pour-mille et pas de montant (CHECK). Le produit est facultatif : le
  connecteur RIS n'est pas un produit du catalogue.
- `CrmProposition.grilleId`, en RESTRICT : une grille utilisée ne se supprime
  pas. La version garde la grille dont elle tire ses prix.
- Les lignes de proposition et de contrat : `productId` devient facultatif (une
  prestation n'est pas un produit) et le libellé est alors obligatoire, en
  validation et par une CHECK ; `offerte` porte le geste commercial ;
  `CrmTypeLigne` gagne `PRESTATION`, facturée une fois.
- `CrmCaMensuel.productId` devient facultatif : une ligne sans produit a sa
  place dans le réel figé (C-46), avec la clé produit `0`.

**La première grille** est créée une fois par le SQL, à partir des réglages de
l'apport, convertis **exactement** comme `prixHt()` (arrondi au plus proche, le
demi vers le haut, en entiers ; comparé sur 2 400 valeurs et 6 taux sans
écart). Les frais d'installation, rangés dans la grille TTC de l'apport, sont
convertis de même ; leur base vient de `modeInstallation`. Le connecteur RIS
passe des points de base au pour-mille. Desk et NoShow sont posés sans prix.

**L'apport lit la grille commune.** `lireGrilleEnVigueur(client, maintenant)`
reste le seul accès (C-70). `prixDepuisGrille` (`src/lib/apports/prix.ts`,
pure) en tire les prix de l'apport au jour du calcul. Les colonnes de prix de
`CrmParametresApport` (`talkTtcCentimes`, `konnectTtcCentimes`,
`connecteurRisPdm`, `installationTalkCentimes`, `installationKonnectCentimes`,
`modeInstallation`) restent en base, ne sont plus ni lues ni écrites ; la
validation et la route les refusent ; l'import les ignore et le dit ; l'export
garde son format. La TVA reste un réglage de l'apport : elle sert à montrer le
TTC aux apporteurs. L'onglet Paramètres de l'apport renvoie vers la page Tarifs.

**Non-régression.** Les commissions se calculent en HT, et le HT de la grille est
exactement l'ancien `prixHt` pour tout montant. `nonRegressionGrille.test.ts`
fige au centime, avec les valeurs produites par l'ancien moteur, les
commissions mois par mois et le prévisionnel du seed ; la même empreinte,
calculée sur la base de vérification avant et après, est identique (141
lignes). Le TTC affiché aux apporteurs est désormais tiré du HT : exact pour les
prix réels, il peut s'écarter d'un centime pour un TTC qui n'est l'arrondi
d'aucun HT.

**Ce qu'il faut savoir.**
- L'apport recalcule avec la grille du jour : quand une grille à venir entre en
  vigueur, les commissions non figées et le prévisionnel changent, comme
  lorsqu'on modifiait ses réglages. Une grille datée dans le futur ne s'applique
  pas encore aux mois qu'elle couvrira.
- Le TTC montré aux apporteurs est tiré du HT : un TTC qui n'est l'arrondi
  d'aucun HT peut bouger d'un centime (75 003 donne 75 004), et un taux du
  connecteur qui n'est pas un multiple de 10 points de base est arrondi au
  pour-mille. Seul l'affichage est touché : l'installation et le connecteur
  sont hors de l'assiette des commissions.
- Le SQL relie les tarifs aux produits par leur nom dans `Product` (C-09 : seul
  `LyraeTalk` est certain). Un produit introuvable laisse le tarif sans produit,
  le SQL le signale (`RAISE NOTICE`) et la page Tarifs affiche « Produit non
  relié » : sinon les lignes préremplies seraient hors catalogue et
  l'acceptation ne gagnerait pas l'opportunité du produit.

**Écarté.** Un type `DATE` pour la date d'application (sans précédent dans le
dépôt). Le libellé comme clé de recherche. Garder le TTC exact en relisant les
anciennes colonnes : deux vérités. Inventer un prix quand la grille n'en a pas.

---

## C-76 — Préremplir une proposition, gestes commerciaux, prestations

**La source.** Le directeur commercial veut une proposition préremplie avec la
grille en vigueur, en gardant les gestes commerciaux (remise en %, installation
offerte, salle offerte) et la possibilité de sortir de la grille (facturation
spécifique, mission ponctuelle comme une vente de RIS).

**Préremplir.** `preremplir(grille, centres, offres, nombreSalles)`
(`src/lib/tarifs/preremplir.ts`, pure, tests écrits d'abord) rend des lignes et
des remarques. Les offres d'un centre s'ajoutent à celles du groupe en OU
logique, comme l'apport (C-63). Les salles saisies une par une l'emportent dès
qu'un centre en a une ; sinon le nombre de salles de la fiche est réparti en
entiers, le reste sur le premier centre, et l'écran le dit. On ne mêle jamais
les deux. L'abonnement et l'installation suivent la base de leur tarif : par
salle, salles × prix ; par site, une fois par centre ; par organisation, une
ligne sans centre. Le connecteur RIS est le pourcentage du montant des salles
du centre, par la règle partagée de l'apport et de l'estimation
(`recurrentDesSalles`). Un tarif sans prix donne une ligne à 0 « prix à
renseigner » ; un tarif absent ne donne aucune ligne, et une remarque dit
pourquoi. Jamais un prix inventé.

**Gestes commerciaux.** Une ligne offerte a un net de 0 et garde son brut affiché.
La remise en pour-mille porte sur les autres lignes, arrondie par ligne (C-39).
`totauxProposition` donne, pour l'abonnement mensuel, ce qui se facture une fois
et la part à l'usage : le brut, la remise, les gestes et le net ; brut = net +
remise + gestes, au centime. À l'acceptation, chaque ligne est copiée au net
(`ligneAuNet`) : une ligne offerte devient une ligne de contrat à 0, offerte,
avec son libellé. Une ligne de contrat offerte ne peut pas porter de montant.

**Hors grille.** Une ligne peut n'avoir ni produit ni tarif : un libellé, un
montant, un type. La vente de RIS est une `PRESTATION` sans produit.

**Les prestations dans le chiffre d'affaires.** Une `PRESTATION` compte une
seule fois, au début officiel (`debuteLe`, sinon `signeLe`), comme une
installation : dans la projection, dans le réel figé (colonne des montants
facturés une fois) et dans l'export. Hors de son mois, elle n'ouvre pas de clé.
Une ligne sans produit a la clé produit `0` ; l'export l'écrit « Hors
catalogue » (le libellé n'est pas dans le réel figé, et plusieurs lignes d'un
même centre partagent une clé). La projection et le réel du seed sont inchangés
(`nonRegression.test.ts`, instantanés pris avant le changement).

**Écarté.** Une deuxième formule du connecteur RIS. Mêler salles saisies et
salles réparties. Une colonne « prestations » dans le réel figé : même nature
de montant que l'installation. Un libellé stocké dans le réel figé. Supprimer
les lignes à zéro des installations seules sur leur clé : comportement
antérieur, et le changer aurait modifié le réel déjà figé.

---

## C-77 — La page Tarifs et les propositions préremplies : règles d'écriture

**Grilles.** `GET /api/pilot/tarifs` rend les grilles à venir, en vigueur et
passées, chacune avec ses tarifs et le nombre de propositions qui l'utilisent,
calculés à la lecture. Tout compte de l'équipe lit ; écrire demande le droit
« Modifier les montants » (`droitsEffectifs`, C-64), relu à chaque appel. Une
grille se crée vide ou copiée d'une autre : c'est le chemin normal pour changer
un prix.

**Une grille se modifie tant qu'aucune proposition ne l'utilise.** Sinon 409 avec
la raison : « Cette grille sert déjà à 3 propositions. Créez une nouvelle grille
datée pour changer un prix. » La raison passe avant une version périmée. Toute
écriture est conditionnelle sur `majLe` de la grille (C-26). La grille est
verrouillée le temps du compte et de l'écriture, et la création d'une version la
prend en partage : une version fige toujours des tarifs stables. Une grille par
date (409).

**Une grille se date d'aujourd'hui ou d'un jour à venir.** Une date passée
changerait après coup la grille en vigueur qu'une lecture a vue. Seule une grille
à venir et inutilisée change de date. Écarté : autoriser une date passée quand
elle ne change aucune grille de proposition, règle plus fine mais plus difficile
à expliquer et à vérifier.

**Tarifs : un rôle, pas un libellé.** On ajoute un tarif en choisissant son rôle
(abonnement Talk, Konnect, Desk ou NoShow, connecteur RIS, installation Talk ou
Konnect, autre prestation). Le rôle fixe le code que lisent le préremplissage et
l'apport, ainsi que le type, la base et le produit relié attendus, vérifiés
côté serveur (un abonnement Talk ne se relie qu'à Talk). Une
« autre prestation » reçoit un code opaque (`TARIF_<n>`). Une première version
tirait le code du libellé, en silence : « Abonnement Talk » devenait
`ABONNEMENT_TALK`, que rien ne lisait, et le conseil de l'écran (« ajoutez-le »)
ne réparait rien. Le libellé reste libre et n'entre jamais au journal. La part à
l'usage n'a pas de tarif de grille : elle se chiffre sur la proposition.

**Une grille vide n'entre pas en vigueur le jour même.** Elle mettrait à zéro
jusqu'au lendemain l'estimation des prospects, le préremplissage et les
commissions. On ne retire pas non plus le dernier tarif d'une grille en
vigueur ; une grille à venir vide est signalée. Une grille à venir que rien
n'utilise se supprime (`GRILLE_TARIFAIRE_SUPPRIMEE`). Une grille passée ne se
modifie plus, même par l'API : l'historique ne se réécrit pas.

**Journal.** Cinq types, résumés tirés du code, sans organisation ; `avant` et
`apres` portent identifiants, codes, dates, montants et taux, jamais les notes
ni les libellés (C-27).

**Versions préremplies.** Un brouillon se préremplit depuis son dialogue
(« Préremplir avec la grille du JJ/MM/AAAA », après confirmation : ses lignes sont
remplacées), et une nouvelle version peut naître préremplie depuis l'onglet
Négociation. Si rien ne sort de la grille (aucune offre, aucun centre, centres
sans salle), la réponse donne les raisons et rien n'est écrit. Une nouvelle
version peut être préremplie depuis la grille en vigueur : les lignes viennent de `preremplir()` (centres, salles et
offres lus en trois requêtes), la remise, l'engagement et le préavis restent
ceux de la version précédente. `grilleId` est figé sur la version dès qu'une
ligne vient de la grille, et repris par la version suivante. La réponse dit les
remarques et les lignes à renseigner. « Prix à renseigner » n'est pas stocké :
c'est une ligne à 0 non offerte. **Une version ne s'envoie pas tant qu'il en
reste** : le contrat porterait une ligne à 0 qui n'est pas un geste, et le
chiffre d'affaires serait sous-compté sans que personne le voie. Une ligne
volontairement à 0 se coche « Offert ». La part à l'usage échappe à cette garde :
un prix unitaire à 0 avec un volume inclus est un choix.

**Concurrence avec le dialogue.** Modifier les lignes d'une version exige la
version lue par l'écran : un dialogue resté ouvert pendant qu'un autre onglet
préremplissait reçoit 409 au lieu d'écraser les lignes de la grille.

**Lignes.** Une ligne de proposition offerte garde son brut, pour montrer ce qu'on
offre ; elle peut aussi valoir 0, pour un geste sans valeur affichée
(« Formation incluse »). Une ligne de contrat, au net (C-39), offerte vaut 0.
Une prestation hors grille a un libellé.

**Seed.** Il relie les tarifs aux produits par leur code (le seed recrée les
produits) ou crée sa grille si aucune n'existe (base vierge de
`npm run demarrer`). Il pose une grille à venir (Talk à 285,00 € HT), une
version préremplie avec une salle offerte (Lambda) et une vente de RIS hors
grille (Sigma).

**Écarté.** Une colonne « prix à renseigner ». Choisir la grille d'une version :
c'est toujours celle en vigueur. Supprimer une grille : une grille créée par
erreur et jamais utilisée reste en base ; à décider si le besoin apparaît.

---

## C-78 — Commentaires avec alerte et départements : le schéma

**La source.** Le directeur commercial veut des commentaires sur un compte, avec le
choix de qui est prévenu : tout le monde, un département ou une personne.
Décisions de l'utilisateur : l'alerte vit dans Pilot seulement, comme une demande
(C-58 : bloc « Pour vous », pastille), sans e-mail ; un département sur chaque
compte de l'équipe.

**Le schéma** (`2026_12_14_pilot_commentaires.sql`, additif et idempotent).
- `CrmDepartement` : Commercial, Projet, Technique, Direction, proposés et en
  attente de validation. On ajoute des valeurs, on n'en renomme aucune.
- `CrmDepartementCompte` : un département par compte de l'équipe, super-
  administrateur compris, avec une version (`majLe`). Pas de ligne :
  « Département pas encore choisi ».
- `CrmCommentaire` : une fiche, un auteur, un texte de 1 à 2 000 signes qui n'est
  pas fait que d'espaces (CHECK), une cible (`CrmCibleCommentaire` : personne,
  tout le monde, un département, une personne ; « personne » par défaut) et son
  complément. On ne se vise pas soi-même (CHECK).
- `CrmDestinataireCommentaire` : qui a été prévenu, et quand il a lu.

**Le département dans une table à part.** Le super-administrateur n'a pas de ligne
d'accès (C-64). Lui en donner une pour porter un département aurait demandé un
rôle factice, une deuxième vérité sur le rôle ; et ses champs « accès retiré »
et « mot de passe provisoire », lus sans regarder le rôle, seraient devenus des
leviers sur un compte qui a tous les droits.

**Les destinataires sont figés à l'écriture** : ce sont les membres du département
à ce moment-là. Quelqu'un qui change ensuite de département ne reçoit pas les
alertes passées et garde les siennes. L'auteur n'en fait jamais partie (garde du
service : une CHECK ne voit pas l'autre table).

**La personne visée est exigée par le service**, pas par une CHECK : si son compte
disparaît au Dashboard, la case se vide (comme `temperatureForceeParId`), au lieu
de bloquer la suppression du compte. Ses alertes partent avec lui.

**Supprimer un commentaire le supprime vraiment**, avec ses destinataires : son
texte ne survit nulle part (C-27). Le journal garde `COMMENTAIRE_SUPPRIME`, sans
texte.

**Écarté.** Une colonne `departement` sur `CrmAccesPilot`. Une suppression douce
qui efface le texte (il aurait fallu affaiblir sa CHECK). Des destinataires
recalculés à la lecture : la liste changerait avec les départements. Un
déclencheur pour exclure l'auteur : le dépôt n'en a aucun.

---

## C-79 — Commentaires avec alerte : qui est prévenu, qui supprime, ce qu'on voit

**Qui est prévenu.** Une fonction pure (`src/lib/commentaires/destinataires.ts`)
calcule les destinataires sur l'équipe lue dans la transaction d'écriture : toute
l'équipe active, un département ou une personne, jamais l'auteur, jamais un
compte client ni un compte dont l'accès est retiré (C-64). Refusés, avec une
phrase qui dit quoi faire : un département où personne d'autre que l'auteur
n'est actif, une équipe réduite à l'auteur, une personne inconnue, cliente ou à
l'accès retiré, et soi-même (« Pour vous-même, gardez le commentaire sans
prévenir personne »). Écarté : accepter avec zéro destinataire, l'écran dirait
« prévenu » sans que personne le soit.

**Le texte, premier champ libre de ce lot à pouvoir porter une donnée patient
par erreur.**
- De 1 à 2 000 signes, nettoyé côté serveur (espaces insécables, caractères de
  largeur nulle et invisibles), avec au moins un caractère visible. Les
  caractères de contrôle, les directionnels de surcharge (qui maquilleraient un
  montant ou un nom) et les surrogates isolés sont refusés. L'écran compte comme
  le serveur, après le même nettoyage.
- La chaîne brute est bornée avant tout calcul, et la route refuse un corps de
  plus de 64 Kio (413) : un compte interne ne peut pas saturer la mémoire du
  serveur avec un texte démesuré.
- Un texte qui ressemble à un numéro de sécurité sociale est refusé, avec la
  raison. La phrase « Jamais de donnée patient » reste sous la zone d'écriture.
- Une erreur de la base pendant l'écriture est traduite en refus lisible, sans
  recopier ses valeurs : un message de contrainte PostgreSQL peut contenir la
  ligne entière.
- Le texte ne passe jamais par une URL, et s'affiche isolé (`dir="auto"`). Il n'entre jamais dans le
journal ni dans les logs : `COMMENTAIRE_ECRIT` porte la cible, le département ou
l'identifiant de la personne, et le nombre de prévenus ; son résumé ne nomme
personne. Un commentaire ne se modifie pas.

**Qui supprime.** L'auteur, et le super-administrateur, comme une demande (C-58).
La suppression est conditionnelle à l'auteur dans la même requête. Le journal
garde l'auteur, la cible et le nombre de prévenus, pas le texte. Le texte ne
survit plus dans Pilot ; il reste, comme toute donnée supprimée, dans les
journaux de transactions et les sauvegardes de PostgreSQL jusqu'à leur
rotation.

**Lu.** Marquer lu est idempotent, réservé à qui a été prévenu, et non journalisé :
une ligne par lecture serait du bruit. Retirer l'accès n'efface pas l'alerte ;
elle attend si l'accès est rendu.

**Les départements.** Le super-administrateur seul choisit le département de chaque
compte, le sien compris, dans l'écran Équipe : écriture conditionnelle sur la
version lue (C-26), journal `DEPARTEMENT_MODIFIE` sans organisation. Un
département se change, il ne s'efface pas.

**Ce qu'on voit.** Sur la fiche, onglet Résumé, le fil des commentaires et la zone
d'écriture, avec « Prévenir : personne, tout le monde, un département, une
personne ». Sur Aujourd'hui, « Pour vous » réunit les demandes et les
commentaires non lus, du plus récent au plus ancien ; ouvrir un commentaire le
marque lu. Les demandes en retard restent en tête, puis le reste du plus récent
au plus ancien. Une pastille dans le menu compte demandes et commentaires non
lus ; un petit composant la relit à chaque changement d'écran et après chaque
action, sinon elle restait fausse après avoir ouvert un commentaire depuis
« Pour vous ». Un commentaire non lu se marque lu quand il reste un instant à
l'écran, avec un bouton de secours. La chronologie de la fiche
ne répète pas un commentaire écrit, que le fil montre déjà, mais garde la trace
d'une suppression.

**L'origine des requêtes qui modifient.** Une requête d'API qui écrit et qui
porte un en-tête `Origin` différent de Pilot est refusée (403), pour toutes les
routes : sans cela, une page d'un autre sous-domaine du même domaine pouvait
faire écrire un commentaire au nom de la personne connectée. Sans en-tête
`Origin` (scripts, outils), la requête passe : la session reste exigée.

**Écarté pour l'instant.** Une limite de débit sur l'écriture des commentaires
avec alerte : Pilot n'en a nulle part, c'est un CRM interne, et un abus se voit
dans le journal (auteur, cible, nombre de prévenus). À reprendre si le besoin
apparaît. Un verrou du compte à l'écriture : un retrait d'accès au même instant
peut laisser une alerte, invisible tant que l'accès n'est pas rendu. Un
département qu'on retire : on le change, on ne l'efface pas.

**Contrôle.** Tests de la fonction des destinataires (tout le monde, département
vide, personne, auteur exclu dans chaque cas, accès retiré) et
`scripts/verifier-t.ts` contre le serveur, dont l'absence du texte dans tout
événement du journal. Seed : quatre commentaires sur Alpha, dont un à la
Direction lu par un compte et pas par l'autre.

---

## C-80 — La carte : Leaflet, les tuiles OpenStreetMap et le géocodage national

**La source.** Le directeur commercial veut une carte des prospects et des clients,
combinée à la cartographie des concurrents. Décision de l'utilisateur : une carte
interactive, Leaflet sur un fond OpenStreetMap, géocodage par le service national
d'adresses.

**Une seule bibliothèque ajoutée : `leaflet` 1.9.4** (licence BSD-2), avec
`@types/leaflet` 1.9.22 en développement. Versions figées, publiées depuis plus de
deux semaines. Pilot pilote Leaflet directement, depuis un composant client
chargé côté navigateur seulement (`next/dynamic`, `ssr: false`), car Leaflet lit
`window`. Le CSS de Leaflet vient du paquet, jamais d'un CDN.

**`react-leaflet` écarté pour sa licence.** Le plan prévoyait `react-leaflet`
4.2.1, la dernière version pour React 18. Il a été installé puis retiré pendant
la revue de sécurité : `react-leaflet` et `@react-leaflet/core` sont sous licence
**Hippocratic 2.1**, une licence que l'OSI ne reconnaît pas et qui pose des
conditions d'usage. L'accepter demandait un avis juridique ; un seul composant
s'en servait, et l'écrire avec Leaflet seul coûtait peu. `react-leaflet` 5
exige de toute façon React 19.

**Le service de géocodage.** `https://data.geopf.fr/geocodage/search`, le service de
la Géoplateforme de l'IGN qui reprend l'ancienne API Adresse
(`api-adresse.data.gouv.fr`, transférée à l'IGN). Sans clé, 50 requêtes par seconde
par adresse IP, réponse GeoJSON. Données de la Base Adresse Nationale sous
licence Etalab 2.0. Un seul hôte, en constante, redirections refusées, réponse
lue avec un plafond de taille.

**Ce qui part vers l'extérieur, à porter au registre des traitements.**
- Vers l'IGN, depuis le serveur : la rue, le code postal et la ville d'un
  établissement, avec un User-Agent constant (« LyraePilot »). Jamais de donnée
  patient, jamais un nom de contact, jamais l'identifiant d'une fiche. Le champ
  d'adresse étant libre, l'écran rappelle « Pas de nom de personne ».
- Vers OpenStreetMap, depuis le navigateur des salariés : l'adresse IP, l'origine
  de Pilot (Referer) et les tuiles regardées. Les tuiles dessinent donc la
  géographie des prospects et des clients affichés : une information commerciale,
  pas une donnée patient.
- Les logs portent l'identifiant du centre et le statut du géocodage, jamais
  l'adresse.

**Le Referer des tuiles.** La politique d'usage des tuiles d'OpenStreetMap exige un
Referer et interdit de le supprimer, sous peine de blocage. Or Pilot impose
`Referrer-Policy: same-origin` (`next.config.js`) : aucun Referer ne partirait vers
`tile.openstreetmap.org`. La couche de tuiles pose donc
`referrerPolicy="strict-origin-when-cross-origin"` sur ses images : seule
l'origine part, jamais le chemin ni les filtres, et seulement vers les tuiles.
La politique du reste de Pilot ne change pas. L'attribution OpenStreetMap reste
visible sur la carte. Pilot n'a pas de politique de sécurité de contenu (CSP) ;
le jour où il en aura une, elle devra ouvrir `img-src` à
`https://tile.openstreetmap.org` et à rien de plus large.

**Écarté.**
- Une carte par département, sans dépendance : elle ne situe pas un centre, ne se
  zoome pas, et ne montre pas où un concurrent est implanté.
- Google Maps : une clé, un compte de facturation, des conditions d'usage plus
  restrictives, et l'envoi des adresses à un tiers commercial.
- Les tuiles « Plan IGN » de la Géoplateforme (un seul tiers, public, sans
  contrainte de Referer) : écartées pour suivre la décision de l'utilisateur, qui
  a choisi OpenStreetMap ; c'est l'alternative la plus simple si l'on veut un jour
  réduire les tiers à un seul.
- Héberger nos propres tuiles : un serveur et une mise à jour pour un usage
  interne modeste.
- Relâcher `Referrer-Policy` pour tout le site : le Referer partirait aussi vers
  les autres liens externes.

---

## C-81 — La position des centres : un géocodage après le commit, jamais bloquant

**Le schéma** (`2026_12_15_pilot_carte.sql`, additif et idempotent). Sur
`CrmCentre` : `latitude` et `longitude` en `DECIMAL(9,6)` (le millionième de
degré), `geocodageScore` en millièmes entiers (aucun flottant stocké),
`geocodageStatut` (`CrmGeocodageStatut` : à faire, localisé, ambigu,
introuvable, adresse incomplète) et `geocodeLe`. CHECK : les deux coordonnées
ensemble ou aucune, dans leurs bornes ; un centre localisé a toujours une
position ; à faire, introuvable et adresse incomplète n'en ont jamais ; un
centre ambigu garde la position la plus probable. Les centres existants passent
« à faire ». « Adresse incomplète » se distingue d'« introuvable » pour que
l'écran dise quoi compléter ; rien ne part vers le service pour une adresse sans
rue.

**Après le commit, jamais pendant** (même principe que C-22). La transaction qui
crée un centre ou change sa rue, son code postal ou sa ville le laisse « à
faire » et efface sa position. Ensuite, une file le géocode sans être attendue,
à 10 requêtes par seconde au plus (le service en accepte 50). Une seule file par
processus (posée sur `globalThis`), bornée à 500 centres en attente ; après un
refus pour débit, elle attend ce que le service demande (60 s au plus) ; après
cinq échecs d'affilée, elle se vide. Les tâches en attente sont perdues à l'arrêt
du processus : le rattrapage planifié les reprend. Le
résultat ne s'écrit que si le statut et l'adresse lus n'ont pas changé
entre-temps. Tous les chemins passent par une seule fonction : l'API des
centres, la fiche rapide, l'apport d'affaires, l'import du calculateur, la
reprise du parc. Une erreur réseau, un refus pour débit ou une réponse illisible
laissent le centre « à faire », sans erreur pour l'utilisateur.

**L'analyse** (pure, testée sur des réponses enregistrées, dont une vraie réponse
du service). La réponse n'est lue que si c'est du JSON, et jusqu'à 256 Kio. Un
meilleur résultat hors du département du code postal saisi est introuvable, pas
placé : « 12 rue Pasteur, Lyon » ne finit pas à Paris. Une adresse sans code
postal mais avec une ville après une virgule (le champ unique d'un site de
l'apport) part quand même, et le score décide. Localisé à 700 millièmes ou plus ; ambigu pour un score plus
faible, deux lieux éloignés de plus d'environ 500 m à moins de 50 millièmes
d'écart, ou une commune seule ; introuvable sans résultat ou sous 300. Une
réponse malformée ne conclut rien. Les seuils sont des constantes, à éprouver
sur le parc réel.

**Pas journalisé.** Une position calculée par un service n'est pas un fait saisi.
Les logs portent l'identifiant du centre et le statut, jamais l'adresse.

**Coupé** pendant `npm test` et avec `PILOT_GEOCODAGE=0` : le seed et le serveur
de vérification le posent, et aucune vérification n'appelle le vrai service.

**`npm run geocoder`** rattrape les centres « à faire » (et, avec `-- --tous`,
les ambigus et introuvables), à débit limité, rejouable, avec un bilan ; il
s'arrête après cinq échecs d'affilée. **Il est planifié toutes les quinze
minutes**, comme l'évaluation de la check-list (crontab dans
`docs/INTEGRATION-DASHBOARD.md`). Il peut tourner sur la base de travail : il
n'écrit que des positions. Il reste à le lancer une première fois sur le parc
réel. Un centre « à faire » depuis plus de 30 minutes ne dit plus « Localisation
en cours » mais « Localisation pas encore faite. Elle sera retentée
automatiquement. »

**Le seed** place des centres hors ligne (coordonnées écrites, aucun appel) :
des clients, des prospects de chaque température, les centres équipés par les
deux concurrents, et un centre de chaque statut non localisé. Il ne garde plus
qu'une grille tarifaire, datée du jour où on le joue : les vérifications
supposaient une grille du jour, et échouaient après minuit.

**Écarté.** Géocoder dans la transaction : l'utilisateur attendrait le service.
Journaliser la position. Stocker des flottants. Envoyer le nom de
l'établissement pour aider le service. Situer un centre sans rue au centre de
sa commune.

**À l'intégration.** Le géocodage sans attente suppose un serveur Node qui reste en
vie (`next start`). Si le Dashboard tourne autrement, `npm run geocoder` en
tâche planifiée prend le relais.

---

## C-82 — L'écran Carte : ce qu'il montre, ce qu'il ne dit pas

**L'écran.** La carte vit sous « Plus », pour tout compte de l'équipe, développeur
compris : le montant est celui du dossier, comme sur le tableau Prospects (C-64,
C-70), rien de la page Chiffre d'affaires. La page serveur lit tout en un nombre
fixe de requêtes : le chargeur du tableau Prospects (montant, température,
étape, concurrent), plus les centres. Les filtres (prospects ou clients,
température, concurrent, commercial, famille de RIS, couleurs) s'appliquent dans
le navigateur et vivent dans l'adresse : des codes et des identifiants (C-36).
Une valeur inconnue est ignorée.

**Formes et couleurs.** Rond pour un prospect, carré pour un client, losange pour
une affaire perdue. La couleur suit la température, ou en mode concurrents le
concurrent (son identifiant modulo 8 : la teinte ne change pas quand un autre
concurrent est supprimé ; au-delà de huit, deux teintes se répètent et le nom
les distingue). Un contour en pointillé signale une position à vérifier. Jamais
la couleur seule : la légende, le nom accessible du marqueur et la bulle disent
la même chose. Les marqueurs se prennent au clavier ; Entrée ouvre la bulle,
Échap la ferme.

**Qui équipe qui : une seule règle.** `concurrentEffectif`
(`src/lib/concurrents/effectif.ts`) : le gagnant d'une affaire perdue l'emporte
sur le concurrent en place, et un client de Lyrae n'est plus équipé par personne.
La carte en mode concurrents et la page Concurrents (C-73) comptent avec elle :
une affaire perdue n'est comptée qu'en « affaires perdues », un établissement
gagné par un autre n'est plus listé chez l'ancien. Le mode concurrents montre ces
établissements et les affaires perdues contre un concurrent (« Perdu contre X »,
date de sortie, sans montant) ; jamais un client. Hors de ce mode, les dossiers
perdus ne sont pas sur la carte.

**Ce qui part vers le navigateur.** Le nom du centre, sa commune, sa position,
l'étape, la température, le montant du dossier, le concurrent, le commercial,
la famille de RIS. Jamais la rue ni le code postal. La bulle dit « Montant du
dossier » : un groupe à plusieurs sites montre le montant de tout le dossier sur
chaque bulle. Sa largeur suit celle de la carte.

**Pas encore localisés.** Une liste sous la carte dit pour chaque centre pourquoi
il n'a pas de marqueur (adresse incomplète, introuvable, localisation en attente
ou en retard) et mène à la fiche pour compléter l'adresse. Les positions à
vérifier ont leur propre liste.

**Téléphone.** La carte remplit l'écran utile au-dessus de la barre d'onglets ;
filtres et légende sont des panneaux repliables ; l'attribution reste visible.

**Écarté.** Un regroupement des marqueurs proches : une bibliothèque de plus pour
quelques centaines de centres. Des icônes d'image (cassées par l'assembleur).
Lire les organisations une seconde fois. Montrer les clients en mode
concurrents. Une teinte au rang du concurrent.

**Contrôle.** `affichage.test.ts`, `effectif.test.ts`, `scripts/verifier-u.ts`
(page servie à chaque rôle, filtres inconnus ignorés, rue jamais dans la page),
`npm run mesurer:test` (carte à 1 puis 60 organisations, rien de l'adresse vers
le navigateur).

---

## C-83 — Revue finale du chantier : des règles alignées d'un lot à l'autre

**La source.** Une revue de l'ensemble des lots Q à U, après leurs revues une à
une, a cherché ce que ces revues ne pouvaient pas voir : une règle posée par un
lot et pas appliquée par un autre. Rien ne touchait aux données patient ni à la
sécurité ; quatre écarts pouvaient fausser le chiffre d'affaires ou les comptes
sans que personne le voie.

**Seule la version qui attend une réponse s'accepte (amende C-39, C-71).** Une
ancienne version restée « Envoyée », dépassée par une version plus récente, ne
s'accepte, ne se refuse ni ne passe en discussion : 409, « Une version plus
récente a remplacé celle-ci. » L'accepter aurait créé un second contrat actif
sur des conditions que le client n'a plus sous les yeux, et compté le signé deux
fois. La garde lit les versions sous le verrou de l'organisation, par la même
fonction que le montant affiché et la conversion (`propositionEnAttente`).
L'onglet Négociation ne propose ces gestes que sur la version en attente ; les
anciennes disent « Remplacée par la version N ». L'expiration reste permise.

**Pas de contrat actif avec une ligne à chiffrer (amende C-71, C-77).** La règle de
l'envoi d'une proposition vaut aussi pour un contrat : il ne devient pas actif,
et on n'y ajoute ni n'y modifie une ligne, si elle est à 0 € sans être offerte
(hors part à l'usage). Sinon l'activation aurait gagné l'opportunité du produit
avec un signé nul, et le montant aurait disparu partout. Une ligne modifiée ne
gagne les opportunités que si son produit change.

**Qui équipe qui : une règle pour la carte et la page Concurrents (amende C-73,
C-82).** Un dossier perdu sans gagnant connu, ou un contrat terminé, n'est équipé
par personne : on ne sait pas qui l'équipe aujourd'hui. Le concurrent d'avant
reste sur la fiche, il ne compte plus. La règle vit dans
`src/lib/concurrents/effectif.ts` seulement, et un test croisé tient la liste et
la carte ensemble : « En place chez N » égale les marqueurs du mode concurrents
filtré sur ce concurrent.

**Les salles d'un dossier : une fonction, un ordre (amende C-74, C-76).**
`sallesDuDossier` (`src/lib/organisations/salles.ts`) sert au barème de
température et au préremplissage : d'abord les salles saisies dans les centres,
dès qu'un centre en a une ; sinon le nombre de salles de la fiche ; sinon la
somme des équipements déclarés. L'ancien ordre du barème (fiche, équipements,
centres) est abandonné : une salle comptée vaut mieux qu'un nombre déclaré, et le
préremplissage lisait déjà les centres d'abord. Les équipements comptent pour la
température mais ne se facturent pas : un équipement n'est pas une salle. La
valeur lue dit la source (« 2 salles saisies dans les centres »).

**Les mêmes lectures partout.** La carte lit le RIS comme le barème : la fiche,
puis les centres, avec les mêmes cas « inconnu » et « aucun ». Forcer la
température au niveau du calcul retire le forçage, côté serveur. La limite de
64 Kio du corps d'une requête (C-79) s'applique à toutes les routes qui reçoivent
un texte libre (concurrents, relevés, grilles, tarifs, propositions,
organisations, prospects, centres) ; la traduction des erreurs de base, qui ne
recopie jamais un message Prisma, sert aux concurrents, aux tarifs et aux
propositions. La conversion HT vers TTC de l'apport est en arithmétique entière,
sans changer un centime. Le connecteur RIS s'arrondit par centre dans une
proposition et une fois dans l'estimation : un centime d'écart par centre au
plus, accepté.

**Laissé tel quel, à savoir.** Une acceptation avec une remise de 100 % crée des
lignes de contrat à 0 non offertes : cas limite accepté. Demander à un dossier
sans forçage le niveau que donne déjà le calcul écrit un forçage si l'on passe
par l'API ; l'écran ne le permet pas.

## C-84 — Export CSV des prospects : tous les dossiers, ouvert à qui lit Pilot

**Décision.** Un bouton « Exporter en CSV » sur les deux écrans Prospects
télécharge `/api/pilot/prospects/export.csv` : une ligne par dossier, toutes
étapes, toute l'équipe, avec le contact principal, les autres contacts résumés,
les sites, la qualification et les montants estimés des opportunités ouvertes.
Même format que l'export comptable (C-21) : UTF-8 avec BOM, `;`, virgule
décimale, CRLF, formules neutralisées (`texteCsv`). Une lecture, sans journal.

**Qui l'obtient.** Tout compte qui lit Pilot (`peutLirePilot`), et pas le seul
super-administrateur comme l'export de l'apport d'affaires (C-63) : le fichier ne
contient rien que le tableau Prospects et les fiches ne montrent déjà. Aucun
montant de la page Chiffre d'affaires (C-64), aucune donnée patient.

**Écarté.** Une ligne par contact (l'organisation répétée) : moins lisible pour
un suivi de prospection. Suivre les filtres de l'écran : l'export dit « tout »,
le tableur filtre.

## C-85 — Lot V : la check-list suit le déroulé réel d'un déploiement

**Écart assumé.** La check-list reprenait le dossier produit du 19/10/2026. La
checklist de déploiement Talk / Konnect du 06/11/2026, tenue par l'équipe
déploiement, va plus loin : passation, cadrage, go / no-go, PV, facturation et
suivi. Elle est prise comme référence terrain, comme le retour client du
05/11/2026 l'avait été (C-52). Le dossier produit n'est pas contredit : ses
lignes restent, d'autres s'ajoutent.

**Ce qui change.**
- 17 valeurs ajoutées à `CrmCleEtape` (SQL `2026_12_16_pilot_checklist_deploiement.sql`),
  aucune renommée. Le référentiel range désormais chaque étape dans une des six
  phases de la checklist ; l'écran Mises en service les affiche dans cet ordre.
- Deux étapes automatiques constatées par Pilot seul, sans le Dashboard :
  « Contacts facturation récupérés » (un contact du compte porte la nouvelle
  mention `CrmContact.facturation`) et « Responsable du déploiement désigné »
  (`chefDeProjetId`). Une seule vérité : la fiche du compte. Le geste sur la
  fiche relance l'évaluation de ce compte après le commit, comme C-22.
- `FORMATION_SECRETAIRES` s'applique aussi à Konnect. `REGLAGES_ROBOT` perd
  « SMS », repris par `MESSAGES_PATIENTS`. `VISIO_TECHNIQUE` parle d'agenda et
  d'opérateur, plus de réseau ni de VPN.
- Quatre libellés propres à Konnect (`libelleKonnect`) : un RIS d'éditeur, un
  agenda, des créneaux en ligne, un premier RDV pris via ordonnance.
- Pas d'étape « bon de commande » : le passage à Signé et `CrmContrat.signeLe`
  le disent déjà. Une case de plus serait une deuxième vérité.

**Gardes côté serveur** (`src/lib/checklist/gardes.ts`, appelées par `cocher.ts`).
Décocher reste toujours possible.
1. « Date de démarrage confirmée » exige une date promise sur le centre et toutes
   les étapes bloquantes des phases précédentes faites. Le refus les nomme.
2. « Top départ envoyé à la facturation » exige le PV de recette coché.
3. Le top facturation et les quatre étapes de suivi exigent la mise en service
   cochée. Leur délai part de la mise en service (`depart: "MISE_EN_SERVICE"`) :
   J+1, S+1, M+1, et 2 jours pour le top facturation. Avant, rien n'est en retard.

Le PV de recette est bloquant (il compte dans « prêt pour la mise en service »)
mais n'interdit pas de cocher la mise en service : le comportement de
`PASSAGE_PRODUCTION` ne change pas. Le top facturation rappelle de reporter la
date de mise en service comme début du contrat ; Pilot ne modifie pas le
contrat seul, le chef de projet le fait dans l'onglet Argent.

**Les déploiements déjà avancés.** Sans précaution, un centre en service depuis
des mois aurait reçu quinze cases vides et autant d'alertes. L'évaluateur ne
crée donc une étape du lot V (`lotV: true`) que si la case PASSAGE_PRODUCTION
n'est pas cochée ; le top facturation et le suivi arrivent encore si la mise en
service date de moins de 30 jours. Une fois créée, la case reste. Les lecteurs
(écran, fiche, estimation) ne comptent une étape du lot V que si sa case existe
(`etapesSuivies`).

**Hors lot.** Les sources automatiques de Konnect : la checklist rappelle qu'il
n'y a pas d'écran Dashboard pour Konnect. Il faut vérifier avec l'équipe
technique que le jeton et le mapping des examens se constatent bien pour un
centre Konnect. Les chiffres du bilan M+1 (ordonnances rejetées, appels évités,
renvois vers un humain) n'existent pas encore au Dashboard : le bilan reste
manuel, les chiffres en commentaire. Pilot n'y garde que des compteurs, jamais
le contenu d'une ordonnance.

**Écarté.** Une table de « jalons » à part : deux référentiels pour un seul
déroulé. Des étapes optionnelles par centre : la check-list est la même pour
tous les centres d'un produit, c'est ce qui la rend comparable.

## C-86 — Revue d'usage : sortir des impasses sans passer par la base

**La source.** Audit du 20/11/2026 sur la démo, rôle par rôle : sept cas où une
personne de l'équipe restait bloquée, ou voyait ce qu'elle ne devait plus voir.

**Les décisions.**
- **Page Clients.** Elle relit le compte en base comme toutes les autres pages
  (`utilisateurCourant`). Un accès retiré la ferme à l'appel suivant (C-64).
- **Reprise après une sortie.** Un dossier Perdu ou En pause revient d'un geste
  à l'étape d'où il est sorti, lue dans le journal (`etapeAvantSortie`), en plus
  du retour en Prospect. Un client signé repris ne signe pas une seconde fois :
  la garde de la proposition en attente ne s'applique pas à cette reprise.
- **Sortie et contrats.** Vers Perdu ou Contrat terminé, le dialogue propose,
  cochée par défaut, de terminer les contrats actifs à la date du jour. Elle
  n'apparaît qu'avec le droit « Modifier les montants », que la route exige
  aussi. Les centres d'un dossier perdu, en pause ou au contrat terminé ne
  lèvent plus d'alerte de mise en service (`suitLaMiseEnService`).
- **Corriger une saisie.** Un produit se retire d'un centre tant qu'aucune de
  ses étapes n'est faite et qu'il n'est pas en service. Un centre se supprime
  s'il est vide, qu'aucune ligne de devis ou de contrat ne le cite, et qu'il
  n'est pas le dernier du client. Le journal garde « Produit retiré » ou
  « Centre supprimé », sans nouveau type d'événement.
- **Fiche en double.** « Nouveau client » prévient des doublons comme
  « Nouveau prospect ». Le super-administrateur seul supprime une fiche, et
  jamais si un contrat a été activé, une proposition envoyée, l'apport suivi ou
  un mois de chiffre d'affaires figé. Une ligne de journal sans organisation
  dit qui l'a supprimée.
- **Compte rendu.** Le compte rendu et la prochaine action refusent ce qui
  ressemble à un numéro de sécurité sociale, comme les commentaires. Son auteur
  ou le super-administrateur corrige le texte d'un échange déjà noté ; le
  journal dit qui et quand, jamais le texte.
- **Attente sur une étape automatique.** On déclare, relance et lève une
  attente sur une étape automatique pas encore faite : c'est là qu'on attend
  EDL. L'attente ne coche rien ; l'évaluateur l'efface quand il coche l'étape.
  La règle « une étape automatique ne se coche jamais à la main » est intacte.

**Écarté.** Une suppression douce (fiche « archivée ») : un champ de plus à
filtrer dans chaque requête, pour des fiches qui n'auraient jamais dû exister.
Un nouveau type d'événement pour les retraits : une valeur d'énumération de plus
pour une phrase que `ORGANISATION_MODIFIEE` porte déjà. La reprise vers
n'importe quelle étape : elle contournerait le chemin de la conversion.

---

## C-87 — Retour du directeur projet : prospects et clients rangés à part, et des gestes plus courts

**La source.** Essai de l'outil par le directeur projet, 20/11/2026. Quatre
gênes d'usage : modifier un prospect le fait « tomber dans Clients » ;
« Attribuer » un chef de projet ouvre tout le formulaire de l'organisation ; la
date de début officiel se recopie à la main après un essai ; la page Clients
mélange prospects et clients.

**Les décisions.**
- **Une rubrique par étape.** `rubriqueDe(etape)` (`src/lib/pipeline.ts`) : un
  client dès la signature, contrat terminé compris ; un prospect sinon, perdu et
  en pause compris, puisqu'il n'a jamais signé. Le fil d'Ariane de la fiche dit
  « Prospects » ou « Clients » et y mène.
- **Le menu suit la fiche.** La fiche vit sous `/pilot/organisations/…`, mais un
  prospect allume « Prospects ». La page le dit au menu par un contexte
  (`useRubrique`, `src/components/rubrique.tsx`), le temps de son affichage.
  Écarté : déplacer la fiche des prospects sous `/pilot/pipeline/…`, qui
  aurait cassé tous les liens existants.
- **La page Clients.** Elle montre les clients par défaut, avec un choix
  Clients, Prospects, Tous. Le classement par RIS et par outil de RDV (C-66)
  reste disponible pour chacun.
- **Désigner sans tout ouvrir.** « Attribuer » ouvre une petite fenêtre avec la
  seule liste des chefs de projet ; même geste pour le commercial (« Changer »).
  La route est celle de la modification de l'organisation, partielle : mêmes
  gardes, même journal, même évaluation de « Responsable du déploiement
  désigné » (C-85).
- **Début officiel après l'essai.** `debutApresEssai` (`src/lib/ventes/regles.ts`)
  propose le lendemain du dernier jour d'essai : 30 jours à partir du 3, début
  le 3 du mois suivant. Le champ le suit tant qu'on ne l'a pas saisi autrement ;
  une date corrigée reste, et l'écran propose de reprendre la date calculée.

**Écarté.** Calculer le début officiel côté serveur à l'enregistrement : il
écraserait une date volontairement différente (un client qui démarre plus tard).

## C-88 — Le métier d'un contact, à côté de son rôle dans la décision

**La source.** Même retour : savoir si l'interlocuteur est le gérant, le
responsable de gestion, un radiologue, un manipulateur, une secrétaire, ou un
prestataire (informatique, téléphonie, réseau).

**La décision.** Une colonne `CrmContact.metier`, texte libre de 100
caractères. La liste proposée vit dans le code (`METIERS_CONTACT`,
`referentielClient.ts`), suivie des métiers déjà saisis, dédoublonnés à la casse
et aux espaces près (`suggestionsMetier`, même mécanique que le RIS, C-69). Le
champ est proposé dans la fiche contact, « Nouveau client » et la saisie rapide
d'un prospect. La fiche affiche « métier · fonction · rôle ».

**Pourquoi pas le rôle.** `roleDecision` dit le poids dans la décision (décideur,
prescripteur) : un gérant peut être prescripteur, un radiologue décideur. Les
deux ne se remplacent pas, et une énumération ne se renomme pas.

**Écarté.** Une énumération fermée : chaque nouveau métier demanderait une
migration, pour une information qui ne sert à aucun calcul. Décision de
l'utilisateur : liste proposée et saisie libre.

## C-89 — L'annuaire des entreprises, depuis le serveur, en un clic

**La source.** Même retour : préremplir dénomination, SIREN et siège depuis
Pappers ou SIRENE, « comme le calculateur ». Le chef de projet ajoutait que dans
le calculateur il fallait deux actions et un copier-coller.

**Pourquoi le copier-coller disparaît.** Le calculateur est une page autonome :
le navigateur lui interdit d'appeler l'annuaire, d'où le détour par un autre
onglet et le collage de la réponse. Pilot a un serveur : il appelle lui-même le
service public, et la recherche tient en un clic.

**La source de données.** Le service public Recherche d'entreprises
(`recherche-entreprises.api.gouv.fr`, INSEE Sirene et Registre national des
entreprises), gratuit et sans clé : les mêmes données que Pappers. Décision de
l'utilisateur. Seuls le nom ou le SIREN saisis partent vers le service ; aucune
donnée patient, aucune donnée de contact.

**Ce qui est repris du calculateur.** La recherche par nom, SIREN ou SIRET ; le
repli sur les mots porteurs dans le secteur santé quand le nom exact ne donne
rien, dit à l'écran ; la liste des établissements ouverts, ceux de santé
(NAF 86) cochés d'office ; le rapprochement avec un centre déjà saisi (même code
postal, même numéro, deux mots communs : `memeLieu`) qu'on complète de son SIRET
au lieu de le recréer ; les dirigeants ajoutés aux contacts s'ils n'y sont pas.
Une recherche par SIREN ne liste pas les établissements : l'entreprise est
alors relue par son nom (`lireEntreprise`), comme le calculateur.

**Le schéma** (`2026_12_17_pilot_retour_directeur.sql`, additif). Sur
`CrmOrganisation` : `siren`, `denominationLegale`, `siretSiege`, `siegeAdresse`,
`siegeCodePostal`, `siegeVille`, `codeNaf`, `formeJuridique`, `annuaireLuLe`.
Sur `CrmCentre` : `siret`, `finess`. CHECK : 9 et 14 chiffres. Le nom affiché
(`raisonSocialeNom`) reste celui de l'équipe ; l'annuaire ne le remplace que si
on le demande.

**Trois routes.** `POST /api/pilot/annuaire` cherche (POST et non GET : le nom
cherché ne finit dans aucun journal d'accès, C-36). `POST
/api/pilot/annuaire/entreprise` relit une entreprise et propose les
rapprochements. `POST /api/pilot/organisations/[id]/annuaire` applique, en une
transaction : le navigateur n'envoie que ses choix, l'entreprise est relue par
le serveur, jamais reçue. Les centres créés sont localisés après le commit
(C-81). Le journal garde les champs touchés, jamais le nom d'un dirigeant (C-27).
`PILOT_ANNUAIRE=0` coupe tout appel, comme `PILOT_GEOCODAGE` ; les tests ne
partent jamais sur le réseau. `ErreurMetier` gagne 429, 502 et 503 pour dire
qu'un service externe limite, échoue ou est coupé.

**Où.** Sur la fiche, bouton « Annuaire » du bloc Identité. Dans « Nouveau
client » et la saisie rapide d'un prospect, « Chercher dans l'annuaire » remplit
le nom, l'identité légale et l'adresse du site choisi ; rien n'est enregistré
avant « Créer ». L'identité légale se corrige aussi à la main dans « Modifier ».

**Au passage, l'import du calculateur.** L'inventaire du calculateur a montré
que sa version récente range les adresses en champs séparés (`hqAdr`, `hqCp`,
`hqVille` ; `adr`, `cp`, `ville` par site) et laisse vides les anciens champs que
l'import lisait seuls : les adresses étaient perdues. L'import lit désormais les
deux formes, plus le SIRET et le FINESS des sites.

**Écarté.** Pappers : payant, une clé à gérer, mêmes données. Plusieurs SIREN
par organisation (les entités d'un groupe, que le calculateur garde) : une table
de plus pour un cas rare ; le SIRET de chaque centre dit déjà à quelle entité il
appartient. La catégorie d'entreprise et la date de création : rien ne s'en sert.

## C-90 — La salle, clé de facturation : quantité × prix unitaire − remise, et des produits rattachés à la signature

**La source.** Même retour, le cœur : « je ne vois pas de notion de salle alors
que c'est la clé de facturation ». Il attend, par produit : nombre de salles ×
prix d'une salle = abonnement public, moins une remise éventuelle, égale le prix
net ; et de même pour les frais : nombre de sites × tarif. Il signale aussi
qu'après une négociation, l'onglet Centres n'a aucun produit rattaché.

**Ce qui existait sans se voir.** Les salles (`CrmSalle`) ne se saisissaient que
dans l'Apport d'affaires ; la grille avait des tarifs par salle et par site, et
le préremplissage calculait déjà salles × prix (C-76). Mais une ligne ne gardait
que son total, et rien ne liait la signature aux centres.

**Les décisions.**
- **Une ligne montre son calcul.** Quatre colonnes facultatives sur les lignes
  de proposition et de contrat : `quantite`, `prixUnitaireCentimes`,
  `baseQuantite` (le type existant `CrmBaseTarif` : par salle, par site, pour
  l'organisation) et `remisePourMille`. Quantité et prix vont ensemble (CHECK).
  Le montant en découle : sur une proposition, le brut = quantité × prix ; sur un
  contrat, le net, remise comprise (C-39). L'écran le calcule, le serveur le
  vérifie et refuse un montant qui ne correspond pas. Sans quantité, une ligne
  garde son montant saisi : une prestation ou un forfait restent possibles.
- **Le préremplissage remplit le calcul.** Par salle : le nombre de salles du
  centre × le prix ; par site ou pour l'organisation : 1 × le prix. Un tarif sans
  prix donne un prix unitaire à 0 : le saisir suffit à chiffrer la ligne. Le
  connecteur RIS, un pourcentage, n'a pas de quantité.
- **Une remise par ligne, en pourcentage.** Décision de l'utilisateur. Elle
  remplace la remise de la version pour cette ligne, elle ne s'y ajoute pas :
  une remise qui se cumule ne se relit pas d'un coup d'œil. Vide, la ligne suit
  la version. À l'acceptation, la ligne de contrat garde la remise reçue.
- **Un seul prix par salle.** Décision de l'utilisateur : le même prix quelle
  que soit la modalité. La modalité reste sur la salle pour le suivi des
  équipements.
- **Les salles dans la fiche.** L'onglet Centres affiche, par centre, le nombre
  de salles par modalité, et « Gérer les salles » les ajoute ou les retire. Les
  mêmes salles que l'apport et le préremplissage, par les mêmes routes : une
  seule saisie, lue partout.
- **La lecture.** Partout où une ligne se décrit (contrat, négociation, Ventes),
  `detailCalcul` ajoute « 3 salles × 290,00 € − 10 % ».
- **Les produits rejoignent les centres à la signature.** L'acceptation d'une
  proposition et l'activation d'un contrat rattachent chaque produit au centre
  de sa ligne (`rattacherProduitsDuContrat`), dans la même transaction, puis la
  check-list s'évalue après le commit, comme un rattachement à la main. Une
  ligne pour toute l'organisation va au centre unique ; avec plusieurs centres,
  on ne devine pas, et l'écran dit d'ajouter le produit au bon centre. Un
  rattachement existant ne bouge pas.

**Non-régression.** Les montants stockés gardent leur sens (brut sur la
proposition, net sur le contrat) : la projection, le réel figé, l'apport et les
totaux d'une ligne sans quantité ni remise propre sont inchangés, et les tests
d'instantanés existants passent sans retouche.

**Écarté.** Une remise en euros par ligne (le directeur citait € ou %) : le
pourcentage suffit, et deux unités de remise doubleraient les cas à vérifier.
Un prix par modalité. Regrouper les sites d'un produit en une seule ligne
« 3 sites × 500 € » : une ligne porte un centre, c'est ce qui permet le
rattachement et le chiffre d'affaires par centre.

## C-91 — Qui fait quoi : toute alerte va au directeur général, qui la confie, et une alerte par cause

**La source.** Retour du président, 20/11/2026 (« analyse fonctionnelle » et
« analyse poussée »), cadré avec l'utilisateur dans
[`docs/CADRAGE-RETOUR-PRESIDENT.md`](docs/CADRAGE-RETOUR-PRESIDENT.md). Le point
qu'il dit le plus important : chaque alerte doit indiquer le poste et la
personne qui doit agir, sinon « personne ne sait qui doit y aller ». Il relève
aussi des alertes trop bruyantes : une fiche neuve en déclenche deux dès la
première seconde, un client en cumule trois pour une seule cause. Et « Santé des
centres » ne lui dit pas quoi faire.

**Écart assumé avec l'existant.** Jusqu'ici, une alerte allait au commercial
(famille commerciale) ou au chef de projet du dossier (famille intégration,
repli sur le commercial), sans que l'écran le dise. Décision de cadrage D-3 :
**toute alerte va d'office au directeur général**, qui la confie si besoin.
Le filtre « À moi » des alertes suit désormais la personne à qui l'alerte va.
Les autres blocs d'Aujourd'hui (actions, rendez-vous, promesses) suivent
toujours le commercial et le chef de projet du dossier : ce sont des tâches du
dossier, pas des alertes.

**Le directeur général.** Une table d'une ligne, `CrmDirecteurGeneral` (id = 1,
CHECK). Le super-administrateur le désigne dans l'écran Équipe, bloc « Qui
reçoit les alertes » (`PUT /api/pilot/equipe/directeur-general`, version lue
comme C-26). Sans directeur, ou si son accès est retiré, les alertes vont au
premier super-administrateur, et la page Alertes le dit : aucune alerte ne
reste sans personne. Écarté : une colonne sur `CrmDepartementCompte`, qui
aurait obligé à choisir un département avant de désigner le directeur, et une
unicité qu'aucun modèle Prisma n'exprime.

**Confier une alerte.** `CrmAttributionAlerte`, une ligne par dossier et par
groupe d'alerte. Seule cette décision humaine est stockée : l'alerte reste
calculée à la lecture (C-08, C-35). `POST /api/pilot/alertes/attribuer` : le
directeur général ou le super-administrateur, revérifié dans la transaction,
le dossier verrouillé ; la personne choisie doit être un compte de l'équipe qui
a accès. Le bouton « Confier » n'apparaît que pour eux. Le journal
(`ALERTE_ATTRIBUEE`) porte le département de la personne et son identifiant,
jamais son nom (C-22).

**Une attribution tient au dossier et à la cause, pas à l'alerte du jour.** La
clé est celle du groupe (`suivi-12`) : si la même cause revient plus tard sur
le même dossier, elle retrouve la même personne. Le cadrage disait « tant que
l'alerte existe » ; garder la personne est plus simple (rien à purger) et suit
la logique « la même cause, la même personne ». Le directeur général la
reconfie d'un geste s'il le faut.

**Qui agit, à l'écran.** Chaque ligne d'alerte dit « Qui agit : Projet ·
Julie », plus « confiée par … » quand elle l'a été à la main. Le poste est le
département de la personne (C-78) ; d'office, « Direction générale », ou
« Super-administrateur » faute de directeur. Sur la page Alertes, sur
Aujourd'hui et sur la fiche.

**Une alerte par cause.** Chaque alerte porte un `groupe`. Trois causes
regroupent plusieurs signaux d'un même dossier :
- `suivi-<dossier>` : sans contact, sans prochaine action, action en retard ;
- `proposition-<dossier>` : décision attendue dépassée, proposition expirée ;
- `mise-en-service-<rattachement>` : étapes en retard, à reprendre, date
  promise en danger, en service mais incomplet.
Les autres alertes sont seules dans leur groupe. `regrouper` replie, dans
l'ordre du tri, les signaux d'un groupe sous le premier : la ligne affiche les
autres dessous (« Même cause »). Le repli se fait séparément dans les actives et
les reportées : un signal reporté ne se cache pas sous une alerte active.
Reporter une alerte reporte tous ses signaux (un acquittement par clé, une
seule ligne de journal) ; la réactiver les réactive tous. Les clés des
acquittements ne changent pas : les décisions déjà prises restent valables.

**Pourquoi par cause et pas par client.** Le président écrit « une alerte
regroupée par client », mais une proposition expirée et une étape en retard
appellent deux personnes différentes. Par cause, chaque alerte reste confiable
à la bonne personne, et un client ne cumule plus trois alertes pour une seule
cause. Écarté aussi : confier chaque étape en retard séparément ; elles suivent
leur mise en service.

**Une fiche neuve ne sonne pas tout de suite.** « Prospect sans contact » compte
depuis la création quand aucun échange n'est noté : 30 jours, comme pour un
dernier échange (`JOURS_SANS_CONTACT`). « Sans prochaine action » attend 3 jours
après la création (`JOURS_GRACE_PROCHAINE_ACTION`). Les seuils sont dans le
code, comme C-20.

**« Santé des centres » devient « Centres à surveiller ».** Décision de
l'utilisateur. Le nom dit ce qu'on doit faire : repérer les centres en service
qui décrochent et les appeler. Sous-titre : « Les centres en service qui
décrochent, en haut. Appelez ceux en rouge. » L'adresse `/pilot/parc` ne change
pas.

**Le schéma.** `2026_12_18_pilot_qui_fait_quoi.sql`, additif et idempotent : deux
valeurs de `CrmTypeEvenement` (`ALERTE_ATTRIBUEE`, `DIRECTEUR_GENERAL_DESIGNE`),
deux tables. Seed : Direction est le directeur général.

**Mesure.** Le chargement des alertes passe de 11 à 13 lectures (les alertes
confiées, le destinataire par défaut), toujours indépendant du nombre de
dossiers et de centres ; un compte qui n'est pas super-administrateur en ajoute
une sur les pages qui proposent « Confier » (est-il directeur général ?).

**Contrôle.** `calculer.test.ts` (délais, repli, attribution, « À moi »),
`scripts/verifier-x.ts` (gardes par compte, journal sans nom, rejeu sans
écriture, version périmée), `verifier-e.ts` mis à jour pour « À moi » et le
repli. 2 634 tests, 1 808 contrôles HTTP sans échec, `npm run mesurer:test`.

## C-92 — Des chiffres fiables : l'estimé d'un client sans contrat, trois montants nommés, pas d'« En service » contradictoire, une règle pour les sites, des saisies contrôlées

**La source.** Retour du président, 20/11/2026, cadré dans
[`docs/CADRAGE-RETOUR-PRESIDENT.md`](docs/CADRAGE-RETOUR-PRESIDENT.md), lot 2
(D-4, D-5). Ses défauts 1, 2 et 5, sa question sur le nombre de sites, et trois
tests de saisie marqués « À corriger ».

**Un client sans contrat actif compte un estimé, à part (D-4).** Signé, en mise
en service ou en service, mais aucun contrat actif : jusqu'ici il comptait zéro.
`estimeSansContrat` (`src/lib/montants/montantAffiche.ts`, pure) l'estime, dans
cet ordre :
1. le contrat en brouillon, s'il porte déjà des lignes d'abonnement ;
2. la dernière proposition acceptée ;
3. sinon la dernière proposition envoyée, quelle que soit sa réponse ;
4. sinon les opportunités ouvertes.

**Écart avec le cadrage.** D-4 reprenait l'ordre de C-70 (proposition acceptée,
dernière proposition, opportunités). Le brouillon rempli passe devant : c'est le
contrat en train d'être saisi, plus précis que tout le reste. Une acceptation
active déjà le contrat (C-71), si bien que le cas 2 ne sert qu'à un client dont
le contrat a été terminé ou jamais créé. Sans aucune source, le montant vaut 0 et
l'écran dit « Contrat à saisir », sans inventer de chiffre.

**Où il apparaît.** `montantDuDossier` sert la carte du tableau Prospects et
l'en-tête de la fiche : « 750,00 € / mois · estimé, contrat à saisir ».
L'onglet Argent ajoute une ligne « Estimé, contrat à saisir » sous
« Abonnements signés : Aucun contrat actif », avec sa source, et précise qu'il
devient signé dès que le contrat est actif. La page Chiffre d'affaires ajoute un
indicateur « Estimé, contrat à saisir » et un bloc « Contrats à saisir », un
client par ligne, le plus gros d'abord, avec un lien vers son onglet Argent.

**C-45 change sur ce seul point.** Un brouillon ne compte toujours jamais comme
signé. L'estimé n'entre ni dans la courbe, ni dans le réel figé (C-46), ni dans
l'export comptable : ils ne lisent que les contrats actifs ou terminés, et rien
n'y a changé. La règle vaut aussi pour les clients déjà signés avant ce lot.

**Limite connue.** Les opportunités ouvertes d'un client signé restent dans le
« probable » de la projection (C-71), à 100 % selon l'étape. L'estimé les
montre aussi, à part. Les deux chiffres ne s'additionnent pas : l'écran les
présente côte à côte, jamais en total.

**L'alerte « Contrat à saisir ».** `contrat-a-saisir`, famille commerciale, vers
l'onglet Argent. Elle va d'office au directeur général, comme toute alerte
(C-91). Un client tout juste signé a trois jours (`JOURS_GRACE_CONTRAT`) : la
conversion crée un brouillon qu'on complète dans la foulée. L'alerte ne porte
aucun montant : un développeur peut la voir, il ne voit jamais le chiffre
d'affaires (C-64). Le chargement des alertes lit la présence d'un contrat actif
dans la même requête que les dossiers (`_count` filtré) : toujours 13 lectures.

**Trois montants mensuels, trois noms.** Le président voyait trois « récurrents »
différents. Ce sont trois chiffres justes, qui ne comptent pas la même chose :
- « Abonnements signés » (chiffre d'affaires, fiche) : les lignes d'abonnement
  des contrats actifs ;
- « Facturé, mois figé » (« Réel et prévision », qui s'appelait « Réel figé ») :
  ce qui a été facturé un mois clos, part à l'usage et installations comprises ;
- « À la grille » (apport d'affaires et documents des apporteurs, qui disaient
  « Récurrent ») : salles × prix de la grille, la base des commissions (C-63).
Aucun écran ne dit plus « récurrent » tout court. Écarté : une seule définition
pour les trois, comme le proposait le président. Le plan des apporteurs calcule
la commission sur la grille, et le réel doit dire ce qui a été facturé.
Docs/VOCABULAIRE.md les définit.

**Pas d'« En service » avec une étape bloquante ouverte.** Deux gardes serveur.
- **Le centre.** La case « Mise en service déclarée » est refusée tant qu'une
  étape bloquante reste ouverte (`refusCochage`, `src/lib/checklist/gardes.ts`),
  automatique comprise. Le refus nomme les étapes : « Avant de déclarer la mise
  en service, il reste … ». Ce qui suit la mise en service (top facturation,
  suivi) n'en fait pas partie. Une étape du lot V absente reste hors du compte
  (C-85).
- **Le dossier.** Il ne passe en « En service » que si l'un de ses centres suivis
  est déclaré en service (`refusEnService`, `changerEtape`), ce qui exige ses
  étapes bloquantes faites. Un dossier sans centre suivi dans Pilot n'a pas de
  check-list : rien ne le contredit, il passe. Écarté : bloquer aussi ce cas,
  qui aurait obligé à créer des centres pour les 108 dossiers repris sans centre.
Ce qui existait avant reste en place : un centre déjà déclaré avec des réserves
le reste, et l'alerte « En service, mais incomplet » continue de le signaler. La
reprise du parc (C-60) déclare des centres déjà en service au Dashboard : elle
ne passe pas par cette garde. Le seed reconstitue Nu, déclaré avant la garde,
par une option `sansGardes` de `cocherEtape`, réservée au seed et à la mesure
comme `maintenant` : la route ne la transmet jamais, zod la retire.

**Une seule règle pour le nombre de sites.** Le tableau Prospects comptait les
centres créés, la fiche affichait le nombre saisi : « 1 site » d'un côté,
« 2 sites » de l'autre. Les données réelles tranchent : 108 dossiers sur 114
n'ont aucun centre, et le nombre saisi porte l'information (jusqu'à 110 sites
pour un groupe). `nombreDeSites` (`src/lib/organisations/sites.ts`) : le nombre
saisi, jamais moins que les centres créés, puisqu'un centre est un site ; sans
nombre saisi, les centres ; sans l'un ni l'autre, inconnu. La carte, la liste
À prospecter, la liste des clients et la fiche l'appellent. La modification
refuse moins de sites que de centres : « Ce client a déjà 2 centres dans Pilot.
Indiquez au moins 2 sites. » L'export CSV des prospects (C-84, pas encore
commité) lit encore le nombre saisi : à aligner quand il sera repris.

**Des saisies contrôlées, refusées avec un message qui dit quoi faire.**
- **Code postal** : cinq chiffres, espaces retirés (`codePostal`,
  `src/lib/validation/commun.ts`), sur le site d'un prospect, un centre et le
  siège. « ABCDE » ne place plus une fiche hors de la carte. Aucune donnée
  existante ne contredit la règle (contrôlé sur la base de travail).
- **Salles** : à la création d'un prospect, « -3 » était ignoré en silence ;
  le champ le signale et la création est refusée. Le serveur refusait déjà un
  nombre négatif.
- **Prochaine action** : un texte sans date, ou une date sans texte, est refusé
  (`verifierProchaineAction`) sur un échange, sa suite, sa réalisation et le
  premier contact d'un prospect. L'outil ne peut plus accepter une action puis
  alerter « sans prochaine action ».
Ces trois messages passent tels quels (`MESSAGES_PARLANTS`,
`src/lib/validation/messages.ts`) ; les routes des centres et des organisations
les renvoient au lieu de « Corps de requête invalide. ».

**Mesure.** Le chiffre d'affaires passe de 8 à 10 lectures : les clients sans
contrat actif avec leurs sommes, puis leurs propositions avec leurs lignes, en
SQL. Un `findMany` imbriqué aurait sauté des lectures quand il n'y a rien à lire,
et le compte aurait dépendu des données. Alertes et tableau Prospects : même
nombre de lectures qu'avant.

**Contrôle.** `montantAffiche.test.ts` (ordre des sources, cas sans source),
`sites.test.ts`, `gardes.test.ts` (la mise en service et ses exceptions),
`echange.test.ts` (prochaine action datée), `calculer.test.ts` (contrat à
saisir, délai). `scripts/verifier-y.ts` : refus sans écriture, sites, alerte
sans montant, estimé égal à la somme des contrats à saisir, noms des montants.
`verifier-k.ts` vérifie le refus du passage puis remet Nu en l'état. 2 651 tests,
1 835 contrôles HTTP sans échec, `npm run mesurer:test`.

## C-93 — POC et Déploiement : le test avant signature, une décision à sa fin, les dossiers à préparer

**La source.** Retour du président du 20/11/2026, décisions D-1, D-2, D-3 et
D-5 de [docs/CADRAGE-RETOUR-PRESIDENT.md](docs/CADRAGE-RETOUR-PRESIDENT.md),
lot 3. Les lots C-91 et C-92 restent la base. La formation à 750 €, les mois
facturés et les prévisions du lot 4 ne sont pas implémentés ici.

**Le parcours.** Deux valeurs ajoutées à CrmEtapeCommerciale : EN_POC et
POC_NON_TRANSFORME. Devis envoyé peut passer en POC puis en Signé, ou signer
directement. La conversion rapide saute toujours le POC facultatif. Depuis un
POC, « Valider le POC et convertir en client » emprunte C-71 : acceptation de
la proposition en attente, sinon contrat en brouillon et passage en Signé dans
la même transaction. Un passage manuel en Signé depuis un POC est refusé avec
le geste à utiliser. La garde « En service » de C-92 est conservée.

POC_NON_TRANSFORME est une sortie avec le motif et la précision de Perdu, sans
date de réveil obligatoire. Reconquête vers Prospect et reprise depuis la
sortie restent possibles. Les dates du test restent sur le dossier. Le nouveau
journal des sorties ne copie plus leur précision libre : seulement les codes,
les dates, les identifiants et les noms de champs corrigés.

**Toujours prospect.** EN_POC ne fait partie ni des clients de estClient et
rubriqueDe, ni des ETAPES_VENDUES. Il n'entre pas dans l'estimé C-92. La
probabilité par défaut est **80 %**, entre le devis à 65 % et la signature à
100 % : le cabinet teste concrètement la solution, mais n'a pas encore accepté
la vente. La correction humaine d'une opportunité garde la priorité. Un POC
non transformé vaut 0 %. Les deux valeurs ont leurs libellés, anciens libellés,
sous-titres et seuils ; pas de vieillissement générique du POC, couvert par son
alerte datée, ni de vieillissement d'une sortie.

Un client signé ne recule pas en POC. Un dossier avec un contrat actif ne peut
pas entrer en POC. Réciproquement, l'activation manuelle d'un contrat pendant
le POC est refusée sous le verrou de l'organisation : il faut valider le POC
avant. L'acceptation d'une proposition conserve son fonctionnement atomique
C-71. Ainsi, le test avant vente ne peut pas porter de chiffre signé.

**Les dates, sans fusionner deux essais.** CrmOrganisation.pocDebuteLe porte
le début du POC et pocProlongeLe la date de son unique prolongation. Le début
est obligatoire côté serveur lors de l'entrée en POC. Une fois enregistré, il
est conservé : revenir en Prospect n'efface ni le test ni la prolongation.
Une deuxième prolongation est refusée, y compris par deux requêtes concurrentes
(verrou et écriture conditionnelle), avec la raison « Une seule prolongation
est possible ».

La fin est calculée, jamais stockée : ajouter un mois calendaire UTC au début,
deux si prolongé, puis retirer un jour. ajouterMois réutilise le calcul du
contrat, sans débordement de fin de mois ; le jour compris suit C-62. Du
3 novembre au 2 décembre inclus ; prolongé, jusqu'au 2 janvier inclus. Du
31 janvier au 27 février inclus pour une année non bissextile. Le choix des
mois calendaires précise le « un mois » du cadrage, qui ne donnait pas de
règle pour la fin du mois.

L'essai signé reste sur CrmContrat.essaiDebuteLe et essaiJours. ESSAI_VALIDE
reste une case de suivi après mise en service. Rien n'est fusionné ou supprimé.
La fiche nomme le « POC avant signature », ses dates, et rappelle où retrouver
l'essai signé. Ventes, le formulaire du contrat et la case de suivi disent
« essai du contrat signé ». Les dates du POC restent disponibles pour le lot 4.
Décision métier du 22/11/2026 : chaque POC forme un cycle distinct, dont les
cycles clos sont conservés. Réalisation et lecture pour le lot 4 : voir C-94.

**L'alerte.** fin-poc, famille commerciale, s'ouvre au jour J-7 de la fin prévue
et reste ouverte après celle-ci tant que l'étape reste EN_POC. Son détail
nomme les trois issues, signale la prolongation déjà utilisée, et mène à la
fiche. Une prolongation repousse la fenêtre à la nouvelle fin. Aucune somme
n'est chargée pour cette alerte. Calcul à la lecture, acquittements et
attribution C-91 inchangés : elle va d'office à la Direction générale.

**Prospects et clients à leur place.** La famille « Après la signature » sort
du tableau Prospects, de À prospecter et des compteurs d'Aujourd'hui. Le POC
est la cinquième étape avant signature, sur une nouvelle ligne quand quatre
colonnes tiennent à l'écran. La sortie rejoint Perdu et En pause. Les clients
se suivent dans Clients, Ventes et Déploiement. Les boutons d'export en cours
de travail sont conservés ; seule la ligne de la famille est retirée dans la
page À prospecter.

**Déploiement garde son URL.** /pilot/integrations s'appelle désormais
Déploiement dans le menu et les renvois. Les centres en POC sont suivis par
l'évaluateur et par suitLaMiseEnService ; les dossiers sortis sont écartés du
chargement et de l'évaluation. Deux sections dans cet ordre : **À venir**,
puis **En cours**. Un rattachement commence quand il a un compte Dashboard ou
une case de travail faite. Le chef de projet, le contact de facturation et la
commande EDL seuls ne démarrent pas une installation. Un dossier en POC,
Signé ou en mise en service sans centre rattaché à un produit figure aussi
À venir, avec l'explication pour créer ses centres. La check-list détaillée,
les filtres, les attentes EDL et l'URL restent les outils existants.

**Les cinq prérequis, rattachés avant d'ajouter.**

| Prérequis | Source retenue | Ajout |
|---|---|---|
| Téléphonie | INTERFACAGE_TELEPHONIQUE, mixte : numéro constaté, essais manuels | Aucun |
| RIS | CrmCentre.ris, sinon CrmOrganisation.ris, interprété par lireRis | Aucun |
| Bon de commande EDL reçu | Nouvelle case manuelle BON_COMMANDE_EDL, avec les attentes CrmTiers.EDL existantes | Une clé de check-list, non bloquante |
| Commercial EDL identifié | CrmApport.risCommercial déjà saisi, ou CrmContact.metier = Commercial EDL | Une suggestion de métier, aucun champ ni case supplémentaire |
| API reçue et testée | JETON_XPLORE, automatique, jeton configuré et testé | Aucun |

**C-85 précisé.** Son bon de commande écarté était celui du **client**, dont
la signature du contrat dit déjà la réception. La commande **EDL** est passée
à l'éditeur du RIS Xplore : c'est un autre document, qui n'était représenté
par aucune case. Le bon de commande de l'apport (bcEnvoyeLe) reste lui aussi
celui du client : il n'est pas repris comme commande EDL. Une simple case
« reçu » suffit. Décision métier du 22/11/2026 : la case seule est conservée,
sans fichier ni lien ; un emplacement documentaire commun sera choisi plus tard
(voir C-94).

Le commercial RIS existait sur l'apport : une nouvelle case manuelle ou un
nouveau champ commercial EDL aurait fait double saisie. Un dossier sans apport
utilise ses contacts professionnels ordinaires. Seul un indicateur de présence
est lu par Déploiement, aucun nom ajouté au journal.

La téléphonie est sans objet pour Konnect et NoShow. Les deux prérequis EDL
sont sans objet pour un autre RIS connu ; un RIS inconnu ne les dispense pas.
La commande EDL ne rend pas rétroactivement incomplets les centres déjà en
service : sa création suit la règle de reprise du lot V. Les cinq prérequis
ne s'affichent que dans « À venir », car un centre déjà en service n'a plus
à préparer sa commande EDL. La garde automatique de cocherEtape est inchangée.

**Schéma.** 2026_12_19_pilot_poc_deploiement.sql et schema.prisma : deux étapes
commerciales, une clé de check-list, deux dates sur l'organisation. SQL additif
et idempotent ; aucune nouvelle valeur d'énumération utilisée dans le fichier
qui l'ajoute. Aucun modèle miroir Dashboard touché. Seed : Cabinet Phi,
prospect en POC, avec son site et Talk.

**Écarts et choix écartés.** Le cadrage ne précisait ni la probabilité, ni le
critère de démarrage de Déploiement, ni les fins de mois : règles ci-dessus.
La fin stockée en plus du début a été écartée (deux vérités). Un deuxième essai
sur le contrat, une nouvelle case API et une case de présence du commercial
ont été écartés (sources déjà existantes). Une tâche d'alerte en cron ou une
nouvelle attribution ont été écartées (C-08, C-35, C-91). La facturation reste
entièrement au lot 4.

**Mesure.** La fiche et les alertes ne gagnent aucune lecture : les dates
rejoignent l'organisation déjà lue. Déploiement passe de 8 à **9 lectures
avec la session**, attendu dans scripts/mesurer-fiche.ts : une requête SQL
fixe pour les dossiers sans centre suivi. RIS et présence du commercial se
lisent par jointure et EXISTS, sans lecture par dossier. La commande SQL
reste exécutée même sans ligne ; pas de relation imbriquée Prisma dont le
nombre de requêtes varierait selon les données. npm run mesurer:test a été
lancé hors du bac à sable de Codex, sur lyrae_pilot_test : **9 requêtes à
1 centre puis à 20 centres**, nombre identique. La mesure complète passe.

**Contrôle du 22/11/2026.** **2 729 tests unitaires, 114 fichiers, sans échec**.
Transitions et classement du POC, fin inclusive et fins de mois, prolongation
unique, fenêtres de l'alerte et décision prise, attribution DG sans montant,
rattachement des cinq prérequis, activation de contrat refusée sans écriture
pendant le POC. Tests existants de destinations, familles et types d'alerte
mis à jour. **Lint sans avertissement ni erreur, TypeScript et build réussis.**
Les trois requêtes SQL de Déploiement passent EXPLAIN sur lyrae_pilot_test.
La migration manuelle s'applique sur cette seule base.

scripts/verifier-z.ts est appelé après verifierY : entrée sans date refusée
sans écriture, POC daté, prolongation puis refus de la seconde, alerte à la
Direction générale sans montant, contacts et évaluation du POC, Déploiement,
absence des clients et de l'estimé C-92, sortie avec motif puis reconquête,
validation avec contrat en brouillon, Prospects sans l'ancienne famille.
Il restaure le dossier, ses cases, ses contacts et son journal en finally.

**Recette hors du bac à sable de Codex.** Migration manuelle, db:generate et
seed exécutés par l'utilisateur sur lyrae_pilot_test uniquement : réussis,
Cabinet Phi en POC présent. Après correction du contrôle C du journal de sortie,
npm run verifier:test donne **1 877 vérifications, 0 échec, dont 42 du lot Z**,
résultat confirmé par l'utilisateur hors du bac à sable de Codex. npm run
mesurer:test passe, avec **9 requêtes** de Déploiement à 1 puis 20 centres,
nombre identique. L'utilisateur a aussi contrôlé les écrans à 375 px : aucun
défilement horizontal sur Déploiement, Prospects, À prospecter, Aujourd'hui
et la fiche de Phi.

## C-94 — Un cycle par POC, un historique à la décision, et la commande EDL sans document

**La source.** Décisions métier du 22/11/2026 après la réalisation du lot 3
(C-93, commit 51d5f2d). Un cabinet peut refaire un POC après reconquête : le
POC de juin doit avoir ses propres dates et sa propre prolongation, sans
perdre le test de décembre que le lot 4 pourra facturer. Deuxième décision :
la case « Bon de commande EDL reçu » suffit, sans fichier ni lien.

**Le courant et les cycles clos.** CrmOrganisation garde pocDebuteLe et
pocProlongeLe pour le cycle courant, ou le dernier s'il est clos. Elle gagne
pocCycleId, un UUID produit par Pilot à chaque ouverture. Cet identifiant
reste le même pendant le test, ses interruptions et sa prolongation, puis
devient la clé de la ligne historique à la clôture. Ce n'est pas une clé
étrangère vers l'historique : un cycle ouvert n'y figure pas encore.

CrmCyclePoc ne contient que les cycles clos : id (l'UUID du cycle),
organisationId, debuteLe, prolongeLe facultatif, issue, decideLe (instant de la
décision). La ligne est insérée au moment de la décision, dans la même
transaction que le changement d'étape, jamais au démarrage du POC suivant.
Aucun formulaire ne modifie un cycle clos. CrmIssueCyclePoc a quatre valeurs
stables : VALIDE, NON_TRANSFORME, RETOUR_PROPOSITION, RETOUR_PROSPECTION.

**Les chemins réels vers EN_POC, sans changer le parcours.** transitionPermise
et le retour à l'étape d'avant la sortie (C-86) restent inchangés.

| Chemin permis | Cycle |
|---|---|
| PROPOSITION → EN_POC, première entrée ou après reconquête | Nouveau, date de début obligatoire |
| EN_POC → EN_POC, second clic ou requête identique | Même cycle, aucune nouvelle ouverture |
| EN_SOMMEIL → EN_POC, avantSortie = EN_POC, cycle non clos | Même cycle, dates et prolongation conservées |
| PERDU → EN_POC, avantSortie = EN_POC, cycle non clos | Même cycle, dates et prolongation conservées |
| POC_NON_TRANSFORME → EN_POC, reprise C-86 | Nouveau, car la décision a clos le précédent ; date obligatoire |
| EN_SOMMEIL ou PERDU → EN_POC après passage par une décision qui a déjà clos le POC | Nouveau, même si le journal permet le retour direct |

Une chaîne Perdu / En pause se lit avec etapeAvantSortie, comme C-86. Sans
avantSortie = EN_POC, ces sorties n'ont pas de chemin direct vers EN_POC : il
faut la reconquête vers Prospect et le parcours commercial jusqu'au devis.
SIGNE → EN_POC reste interdit, ainsi que les sauts depuis Prospect, Premiers
échanges, Étude technique, Mise en service, En service et Contrat terminé.
L'acceptation d'une proposition et la conversion C-71 ne passent pas par un
POC facultatif : elles ne créent pas de cycle supplémentaire.

**Les décisions qui clôturent.**

| Décision sur un cycle ouvert | Issue historique |
|---|---|
| Passage en Signé par conversion ou acceptation | VALIDE |
| Passage en POC non transformé | NON_TRANSFORME |
| Retour de En POC à Devis envoyé | RETOUR_PROPOSITION |
| Reconquête vers Prospect depuis Perdu ou En pause pendant le POC | RETOUR_PROSPECTION |

Perdu et En pause sont des sorties génériques reprenables dans le parcours
C-86. Elles suspendent le cycle : les reprendre directement conserve le même
POC, conformément à la décision métier. La décision définitive sur le test se
note en POC non transformé, ou à la reconquête si l'équipe repart en Prospect.
Corriger un motif de sortie, ou passer d'une sortie générique à l'autre, ne
clôt pas une seconde fois un cycle. Les autres chemins qui n'ont jamais eu de
cycle ouvert ne créent aucune ligne historique.

**Une date obligatoire pour chaque nouveau test.** Le serveur distingue le
nouveau cycle d'une reprise, sous le verrou de l'organisation. Un nouveau
cycle sans date est refusé sans écriture, même si les anciennes dates sont
encore sur la fiche. Le message explique qu'un nouveau cycle démarre et que
le précédent est conservé. À l'ouverture, les deux champs existants reçoivent
le nouveau début et une prolongation vide. Une prolongation redevient donc
possible, une seule fois. La fin inclusive et les mois calendaires de C-93 ne
changent pas. Une reprise du même cycle ne peut pas changer sa date de début.

Tous les changements d'étape prennent désormais le même verrou que la
prolongation, y compris les sorties et la clôture par conversion. L'UUID
unique du cycle empêche une deuxième insertion historique. Un second clic
après ouverture retrouve le cycle ouvert et n'en crée pas un autre. Toute
erreur annule l'étape, l'archive et le journal dans la même transaction.

**Une alerte propre au cycle.** La fenêtre de fin se calcule sur les dates du
cycle courant de l'organisation. La clé du signal comprend son UUID : reporter
une alerte de décembre ne reporte pas celle du POC de juin. La cause du groupe
reste fin-poc-<organisation> ; les attributions et la Direction générale de
C-91 ne changent pas. La lecture des alertes ne gagne aucune requête.
Les clés restent au format type-nombre ; seule fin-poc accepte aussi fin-poc-<nombre>-<uuid>, afin qu'un report d'un ancien cycle ne masque pas le nouveau.

**La fiche.** Le bloc courant reste celui de C-93. Si un cycle a précédé celui
affiché, une seule ligne donne le dernier cycle précédent, sa fin calculée et
son issue : « POC précédent : du 01/12/2026 au 31/12/2026, non transformé. »
La ligne ne duplique pas le dernier cycle déjà affiché quand celui-ci est clos.
Pas de tableau ni de nouvel onglet. Le menu de changement d'étape demande une
date pour un nouveau cycle ; la reprise d'un cycle suspendu conserve les dates.

**Ce que le lot 4 devra lire.** Le cycle courant ou dernier : pocCycleId,
pocDebuteLe et pocProlongeLe sur CrmOrganisation. Tous les cycles passés :
CrmCyclePoc, avec leur issue et decideLe. Le dernier clos peut être présent
aux deux endroits : il s'agit du même UUID, à dédupliquer pour facturer. Quand
un nouveau cycle démarre, celui d'avant reste exclusivement dans l'historique.
Un même UUID désigne toujours le même POC, ouvert ou clos.

**Journal.** CYCLE_POC_OUVERT et CYCLE_POC_CLOS ajoutés à CrmTypeEvenement,
sans renommage. Résumés fixes, identifiants, dates et code d'issue seulement.
Aucun nom de personne ni motif libre du dossier dans ces événements.

**Commande EDL, décision du 22/11/2026.** La case seule est conservée. Aucun
champ, lien, fichier ou dépôt ajouté. Le choix d'un emplacement documentaire
commun reste un travail ultérieur ; il ne conditionne pas la case « reçu ».
La distinction avec la commande du client rappelée en C-93 reste inchangée.

**Schéma et reprise.** 2026_12_20_pilot_cycles_poc.sql et schema.prisma :
CrmCyclePoc, CrmIssueCyclePoc, pocCycleId et deux types d'événement. Migration
additive et idempotente. Les valeurs d'événement ajoutées par ALTER TYPE ne
sont pas utilisées dans ce fichier. Aucun modèle miroir Dashboard touché.
Aucune reprise de données : la base de travail n'a pas encore de POC. Le seed
garde Phi en POC ouvert et lui ajoute un cycle passé non transformé.

**Écarts et choix écartés.** Deux issues supplémentaires sont nécessaires aux
sorties réelles trouvées dans le parcours : retour au devis et retour en
prospection. Les sorties génériques reprenables gardent le même cycle ; on ne
réécrit pas C-86. Une nouvelle table pour les seuls cycles clos évite une
seconde vérité mutable sur le courant. Créer une ligne seulement au POC
suivant a été écarté : la décision et son issue doivent déjà être conservées.
Effacer les anciennes dates ou fusionner les essais du contrat a été écarté.
Les UUID, plutôt que les dates comme clé, permettent deux tests dont les dates
se ressemblent et donnent au lot 4 un identifiant stable avant la clôture.

**Mesure.** La fiche gagne **une lecture SQL fixe**, même sans historique :
état ouvert ou clos du courant et dernier POC précédent lus ensemble par EXISTS
et LEFT JOIN LATERAL. Le script mesurer-fiche.ts attend explicitement **une
requête de lecture des cycles** et continue de comparer le total à 1 puis
20 centres. Pas de relation Prisma conditionnelle dont le nombre de lectures
varierait avec les données. Les chargeurs d'alertes et de Déploiement gardent
leur nombre de requêtes ; Déploiement reste à neuf avec la session.

**Contrôle.** Vitest : chemins permis et refusés, nouveau cycle ou reprise,
date exigée malgré les anciennes dates, prolongation à nouveau disponible et
refus de la seconde, alerte du seul courant, report d'alerte isolé par cycle,
issues à la décision et ligne du précédent. scripts/verifier-z.ts remplace la
reprise après reconquête par un nouveau POC daté et vérifie les deux archives
(non transformé puis validé), la prolongation et l'absence d'alerte prématurée.
Le nettoyage restaure aussi l'historique initial du seed.

La migration C-94 a été appliquée puis rejouée sur lyrae_pilot_test uniquement ;
la requête fixe de lecture de la fiche passe EXPLAIN. Génération Prisma réussie.
**npm test : 2 758 tests, 114 fichiers, zéro échec.**
**npm run lint : aucun avertissement ni erreur.** TypeScript sans erreur.
Recette lancée hors du bac à sable de Codex, sur lyrae_pilot_test seulement :
seed, **1 889 vérifications HTTP, zéro échec, dont 54 du lot Z** ; mesure
passée, nombre de requêtes identique à 1 puis 20 centres ; fiche de Phi à
375 px avec la ligne « POC précédent », sans défilement horizontal ; build
réussi. Aucune écriture sur lyrae_pilot : la migration reste à y appliquer.

## C-95 — Facturation : calendrier du dossier et formation unique du premier POC

**Sources.** D-2, D-3, D-4 et lot 4 de D-5 du cadrage du retour du président,
avec les réponses du 22/11/2026 dans docs/QUESTIONS-LOT-4.md. C-94 reste le
choix des cycles de POC. Les décisions de cette section ne changent pas C-84.

**Une formation pendant toute la vie du dossier.** CrmFormationPoc a pour clé
primaire organisationId, et conserve l'UUID C-94 du premier POC, sa date de
début, la grille retenue et son montant en centimes, nullable si inconnu. Le
cycle peut être encore ouvert : aucune clé étrangère vers les seules archives
closes. La formation se crée dans la transaction d'ouverture du POC, sous le
verrou du dossier. Une reprise, une prolongation et un nouveau cycle conservent
la même formation. Le SQL reprend le premier début connu dans l'historique ou
sur l'organisation, sans doublonner leur UUID. Il ne touche aucun réel figé.

**Le prix et le manque de prix.** Le rôle FORMATION_POC ajoute à la page Tarifs
une PRESTATION par organisation. Le prix métier est une donnée de la grille du
seed, jamais un repli dans le moteur. À l'ouverture, la grille applicable au
jour du début du premier POC est lue sous verrou partagé et le prix est copié
sur la formation. Les lectures suivantes ne le recalculent pas. Une nouvelle
grille ne change donc aucune dette existante.

Point tranché à la réalisation : une grille passée n'étant plus modifiable
(src/lib/tarifs/gerer.ts, C-75), un prix manquant se complète **sur la formation
du dossier** dans Argent. Il faut VOIR_CA et MODIFIER_MONTANTS. Le serveur
accepte seulement un entier de centimes positif ou nul, et seulement si le prix
était inconnu. Le verrou du dossier départage deux saisies concurrentes. Le
journal conserve identifiants et montant, avec un résumé fixe, sans texte libre.
Modifier une grille passée, recalculer au tarif actuel et inventer un prix ont
été écartés : ils changeraient rétroactivement les données de référence ou la
dette. Pour les prochains POC, créer ou copier une grille datée sur Tarifs et
y ajouter ce rôle ; la migration ne réécrit pas les grilles passées.

**Le calendrier.** calendrierFacturation est pur, testé avant son intégration.
Les mois sont des premiers de mois UTC, comme C-45. Il déduplique les cycles,
montre la formation au début du premier POC, le mois gratuit et sa prolongation
gratuite, puis les contrats actifs ou terminés. Les périodes exactes sont
visibles : une fin de POC et le début officiel d'un contrat peuvent appartenir
au même mois, payé entier sans prorata. Les contrats en brouillon ne comptent
pas. Aucun essai payant supplémentaire ; essaiDebuteLe et essaiJours restent
du suivi C-62. La formation s'ajoute aux installations, sans déduction.
Un cycle suivant indique la formation déjà due, ou déjà facturée si l'émission
a été déclarée. La part à l'usage est annoncée comme dépendant des compteurs,
sans lui inventer un montant dans ce calendrier.

L'onglet Argent montre l'historique et les douze mois à partir du mois courant.
Ventes l'ouvre à la demande sur chaque carte, sans requête par carte au chargement.
Les cases sans période indiquent comment dater le POC ou activer le contrat.
La grille de cartes passe à une colonne sur téléphone, sans zone horizontale.

**Prévision, réel, export.** La formation connue compte dans le signé, le
pondéré et l'optimiste au seul mois du début du premier POC, hors du moteur
de l'estimé C-92. Un prix inconnu vaut techniquement zéro et reste signalé
incomplet ; il ne crée aucune clé vide dans le réel. reelDuMois l'agrège dans
miseEnServiceCentimes, sous AAAA-MM|organisation|0|0, avec les éventuelles
autres prestations hors catalogue. L'export actuel lit toujours uniquement
CrmCaMensuel ; aucun nouveau format ni export parallèle.

Après l'arrêté du mois précédent, le passage mensuel de scripts/figer-ca.ts
rattrape les seules formations au prix connu, non comptabilisées, d'un mois
terminé, même ancien. La sélection est pure et testée. Si la clé est absente,
elle est insérée au mois d'origine, sans relire les contrats ni refiger les
autres clés des vieux mois. Seules les lignes réellement retournées par INSERT
autorisent le marqueur comptabiliseeLe et un événement CA_MENSUEL_FIGE au résumé
fixe. Un rejeu n'écrit ni ligne, ni marqueur, ni événement. Le passage sur un
mois demandé explicitement conserve son périmètre antérieur.

Entre-temps, le calendrier et une alerte annoncent « sera ajoutée au réel de
[mois] au prochain arrêté mensuel ». Une clé préexistante ne se réécrit jamais et n'attribue pas ce marqueur
à une formation arrivée ensuite. Le calendrier signale alors « non comptée
dans le réel de [mois], déjà arrêté » et une alerte demande une régularisation
humaine. Aucun déplacement automatique vers un mois ultérieur, aucun complément
comptable implicite. Les tests de figer vérifient insertion, marqueur et rejeu
sans écriture ; les instantanés existants de nonRegression.test.ts sont intacts.

**Facture émise.** Une déclaration manuelle datée, par les mêmes droits que
la complétion du prix, ferme l'alerte de facture. Le prix doit être connu et
la date comprise entre le début du POC et aujourd'hui. Prix et déclaration
enregistrés ne se réécrivent pas par ce formulaire. Ce n'est ni une preuve
d'encaissement, ni une condition du calcul de la dette, ni un top facturation.
Les trois événements ajoutés ont un résumé fixe et des données structurées.

**Alertes calculées à la lecture.** Facture de formation à émettre, prix de
formation à renseigner, top facturation incohérent et régularisation du réel
arrêté sont des causes distinctes. Une formation ancienne en attente d'insertion
utilise la même cause que la régularisation, avec le titre « Formation à ajouter
au réel » et l'annonce du prochain arrêté ; la présence d'une clé la fait
demander une régularisation humaine. La formation reste due après abandon.
Un top coché avec une formation due absente explique quoi corriger. Le manque
de contrat est porté uniquement par contrat-a-saisir, jamais doublé par le top.
Le mois payant sans contrat renforce uniquement contrat-a-saisir :
la date officielle du brouillon est une date fiable, et l'alerte est immédiate
dès son mois ; sans cette date, C-92 reste applicable. Aucune date payante
déduite de la seule fin du POC. Les nouvelles causes vont par C-91 à la
Direction générale, puis à la personne choisie. Aucun montant dans leurs faits
chargés ou leurs détails. Une formation étant unique, les clés sont stables
par dossier, sans nouvelle alerte lors d'un second cycle.

**Confidentialité.** chargerFacturation vérifie VOIR_CA avant toute lecture.
L'API refuse lecture et écriture sans ce droit. utilisateurCourant relit les
droitsEffectifs : même un droit stocké coché n'ouvre rien à un développeur.
La fiche lui transmet facturation = null et Ventes n'ouvre aucun nouveau
calendrier. La nouvelle ligne FORMATION_POC est également retirée côté serveur
des grilles de la page Tarifs et de toutes leurs réponses API, écritures
comprises ; sa création et sa modification demandent VOIR_CA en plus du droit
de modifier. Les anciens tarifs restent accessibles comme en C-64. Le périmètre
antérieur de C-64, pour contrats et devis, ne change pas. verifierS attend huit
tarifs pour la Direction et toujours les sept anciens pour le développeur.

**Schéma et seed.** 2026_12_21_pilot_facturation.sql, additif et idempotent,
et schema.prisma : table, contraintes, relations et trois valeurs d'événement.
Aucun modèle miroir modifié, aucune nouvelle valeur d'énumération utilisée
dans le SQL qui l'ajoute. Le seed ajoute le rôle tarifaire et une formation
unique sur **le premier POC historique de Phi, à J-180**. Ce POC précède la
grille du seed, datée du jour : son prix est inconnu et à compléter, sa facture
reste à émettre. Variation de projection du seed : **zéro centime** tant que
ce prix n'est pas complété. Le second POC de Phi ne refacture rien. Aucun
changement des trois mois de réel figé de démonstration.

**Mesure.** Le pilote confirme CA à onze requêtes, figerMois à onze, alertes
du parc à quatorze et page Alertes à seize, identiques à 1 puis 60 dossiers.
Trois lectures SQL fixes pour le calendrier,
zéro sans VOIR_CA. La fiche mesurée gagne ces trois lectures et celle des
faits de facturation des alertes : quatre au total. Le chargeur CA passe de
dix à onze lectures. Le chargeur des alertes passe de treize à quatorze sur
le parc provisionné, la page Alertes de quinze à seize avec la session de
Direction. Déploiement reste à neuf. Les entrées de réel gagnent une lecture
groupée des formations du mois, sans N+1 ; le marqueur est une écriture
groupée lorsque des formations sont effectivement incluses. mesurer-fiche.ts
mesure aussi le rattrapage à deux lectures SQL fixes, plus BEGIN et COMMIT
quand rien n'est à insérer. L'arrêté et le rattrapage partagent un verrou commun,
qui remplace le verrou par mois sans ajouter de requête à figerMois : les onze
requêtes confirmées par le pilote restent attendues. Le rattrapage ajoute
uniquement les écritures groupées des formations réellement insérées. Le script
vérifie ces attentes, dont l'absence de lecture sans VOIR_CA, à 1 puis 20 centres
et à 1 puis 60 dossiers pour les chargeurs déjà mesurés.

**Contrôle local du 22/11/2026.** db:generate réussi. npm test : **2 804 tests,
119 fichiers, zéro échec**, dont les trois tests de nonRegression.test.ts,
sans retoucher les instantanés. Lint sans avertissement ni erreur, TypeScript
sans erreur, build réussi. Aucun accès PostgreSQL tenté et aucune écriture sur
lyrae_pilot. Migration, seed, HTTP et mesure ne sont pas exécutés dans ce bac
à sable. La recette visuelle réelle à 375 px et grand écran reste au pilote.
verifierAA est appelé après verifierZ : calendrier, tarif, prolongation,
second cycle, abandon, déclaration, prix historique, réel immuable, export,
prévision, alertes DG, refus sans écriture et développeur même avec droit
stocké. Les fixtures, droits, marqueurs, réel et événements sont restaurés
dans finally. La validation sur lyrae_pilot_test reste à confirmer avant commit.

**Retour de recette et correction.** Le pilote a appliqué deux fois la migration,
généré Prisma, rejoué le seed et lancé HTTP et mesure sur lyrae_pilot_test.
Mesure réussie ; HTTP : 1 945 vérifications, quatre échecs, les 56 contrôles AA
réussis. Les échecs portent sur le doublon contrat/top et trois attentes de
copie ou journal encore à sept tarifs dans S. La correction garde N inchangé,
met ces trois attentes à huit et conserve le développeur et les devis à sept.
Le cas de prix tardif a aussi conduit au rattrapage mensuel décrit ci-dessus.
Les nouveaux contrôles AA vérifient un mois déjà arrêté sans clé de formation,
sa complétion tardive, l'annonce avant arrêté, l'insertion de la seule formation,
le rejeu sans événement et une collision jamais réécrite, avec nettoyage.
Contrôle local après corrections : **2 817 tests, 121 fichiers, zéro échec** ;
lint sans avertissement ni erreur, TypeScript et build réussis.

**Recette finale du pilote, 23/11/2026, lyrae_pilot_test seulement.** Seed,
puis npm run verifier:test : **1 961 vérifications, zéro échec, dont 72 du lot
AA**. npm run mesurer:test réussi juste après, puis seed rejoué pour rendre la
base de démonstration. Aucune écriture sur lyrae_pilot.

Un défaut ancien de mesurer-fiche.ts est apparu à cette occasion et a été
corrigé : le responsable des organisations de mesure était lu sans tri, alors
que la session de développement prend le premier compte interne par
identifiant. Après les mises à jour de comptes des contrôles HTTP, PostgreSQL
rendait un autre compte, et le Parc « À moi » de la mesure L se vidait. Le
responsable est désormais lu par identifiant croissant, comme la session.
