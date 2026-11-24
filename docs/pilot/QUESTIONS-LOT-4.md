# Questions du lot 4 : Facturation

Lecture du 22/11/2026. Étapes 0 et 1 seulement. Les recommandations ci-dessous sont des propositions, aucune réponse métier n'est présumée.

## Vérification préalable et sources

- `git log --oneline -5` confirme `51d5f2d` (« lot Z, POC et Déploiement »), puis `fdd2e63` (« un cycle par POC »), qui est HEAD. Les blocs correspondants sont C-93 et C-94 (`CHOIX.md:3374`, `CHOIX.md:3541`), également présents dans la version commitée. Le futur bloc du lot 4 sera **C-95**.
- `git status --short` montre des travaux préexistants : `CHOIX.md`, les pages Pipeline et Prospection, `src/middleware.ts`, les fichiers de l'export des prospects, `docs/CODEX-LOT-3.md` et `docs/PROMPT-LOT-4.md`. Ils restent intacts. Seul le présent document est créé.
- Lus en entier : `CLAUDE.md`, `docs/CADRAGE-RETOUR-PRESIDENT.md`, `docs/VOCABULAIRE.md` ; les blocs C-43, C-45, C-46, C-62, C-64, C-70, C-71, C-75, C-76, C-85, C-90, C-91, C-92, C-93 et C-94 de `CHOIX.md`. Les constats ci-dessous sont vérifiés dans les fichiers cités, sans accès à la base.
- Déjà fixé par D-2 : un mois de POC gratuit, une seule prolongation gratuite, formation à 750 € HT dans la grille datée et due dès le début, même sans transformation (`docs/CADRAGE-RETOUR-PRESIDENT.md:28`, `docs/CADRAGE-RETOUR-PRESIDENT.md:38`). Ces règles ne sont pas remises au vote.

### Ce que lit réellement le code aujourd'hui

| Sujet | Comportement constaté et preuve |
|---|---|
| Essai du contrat signé | `CrmContrat.essaiDebuteLe` et `essaiJours` sont facultatifs (`prisma/schema.prisma:1041`). La validation borne la durée à 1–365 jours, sans imposer une relation chronologique avec `debuteLe` (`src/lib/validation/contrat.ts:20`). `essaiContrat` calcule la fin inclusive, les jours restants et les états absent, incomplet, à venir, en cours ou terminé (`src/lib/ventes/regles.ts:70`). Le formulaire propose le lendemain de l'essai comme début officiel, mais permet de le corriger (`src/lib/ventes/regles.ts:89`, `src/app/pilot/organisations/[id]/DialoguesContrat.tsx:40`). Ces champs n'expriment ni un prix d'essai ni une facturation d'essai. |
| Projection | Le chargeur lit les contrats non brouillons et leurs lignes, les opportunités ouvertes, les scénarios et les montants figés (`src/lib/ca/donnees.ts:23`). Le moteur compte les contrats actifs ou terminés depuis `debuteLe`, sinon `signeLe`, jusqu'au mois de fin compris ; tout est ramené au premier du mois UTC (`src/lib/ca/projeter.ts:27`, `src/lib/ca/projeter.ts:38`, `src/lib/ca/projeter.ts:47`). Les abonnements comptent chaque mois, les prestations et installations une fois au mois du début ; aucune date d'essai ou de POC n'intervient (`src/lib/ca/projeter.ts:60`). Les opportunités datées alimentent aussi le probable et l'optimiste (`src/lib/ca/projeter.ts:71`) : dire que toute la projection ne lit que les contrats serait inexact. |
| Réel calculé puis figé | Le chargeur sélectionne les contrats actifs ou terminés qui couvrent le mois, leurs lignes et les compteurs utiles (`src/lib/ca/entreesReel.ts:17`). `reelDuMois` partage la règle des contrats avec la projection ; une `PRESTATION` entre dans `miseEnServiceCentimes`, au mois du début officiel ou de la signature de repli (`src/lib/ca/reel.ts:78`). `figerMois` refuse le mois non terminé, puis insère seulement les clés absentes, sans mettre à jour les clés existantes (`src/lib/ca/figer.ts:21`, `src/lib/ca/figer.ts:32`). |
| Clé et export comptable | La clé est `AAAA-MM|organisation|produit ou 0|centre ou 0`, sans identifiant de contrat, de ligne ou de cycle (`src/lib/ca/reel.ts:42`). Plusieurs prestations peuvent donc partager une clé. L'export lit exclusivement `CrmCaMensuel`, avec des jointures pour les noms ; il ne relit ni les contrats, ni les opportunités, ni les POC (`src/lib/ca/exporter.ts:14`). Une prestation sans produit s'affiche « Hors catalogue » et rejoint la colonne des montants facturés une fois (`src/lib/ca/export.ts:59`, `src/lib/ca/export.ts:70`). |
| Estimé C-92 | Le chargeur réserve l'estimé aux étapes Signé, Mise en service et En service sans contrat actif ; le POC n'en fait pas partie (`src/lib/ca/donnees.ts:44`). L'ordre effectif est brouillon avec abonnement chiffré, proposition acceptée, dernière proposition envoyée, opportunités ; il reste séparé des entrées du moteur (`src/lib/montants/montantAffiche.ts:99`, `src/lib/ca/donnees.ts:103`). |
| POC après C-94 | `CrmOrganisation.pocCycleId`, `pocDebuteLe`, `pocProlongeLe` portent le courant ou le dernier cycle (`prisma/schema.prisma:427`). `CrmCyclePoc` conserve les cycles clos : UUID, organisation, début, prolongation, issue et instant de décision (`prisma/schema.prisma:405`). La clôture insère l'archive à la décision (`src/lib/organisations/cyclesPoc.ts:17`) ; l'ouverture suivante produit un nouvel UUID et remet la prolongation à vide (`src/lib/organisations/changerEtape.ts:198`, `src/lib/organisations/poc.ts:32`). Le dernier clos peut rester sur l'organisation et dans l'historique : il faut dédupliquer par UUID, comme le prescrit `CHOIX.md:3629`. La fin prévue est calculée, non stockée : début + un ou deux mois calendaires UTC, moins un jour (`src/lib/organisations/poc.ts:51`). |
| Lecture de l'historique | La fiche actuelle ne charge que l'état clos du courant et le dernier précédent, avec `LIMIT 1` ; ce n'est pas la liste de tous les cycles nécessaire à un calendrier historique (`src/lib/organisations/chargerFiche.ts:49`). Une reprise directe d'un cycle suspendu le conserve ; les décisions Valide, Non transformé, Retour au devis et Retour à la prospection peuvent le clore (`src/lib/organisations/poc.ts:13`, `src/lib/organisations/poc.ts:21`). |

## Bloque maintenant

### 1. Les mois d'essai payants viennent-ils après la validation du POC ?

**Constat.** D-2 laisse cette question ouverte (`docs/CADRAGE-RETOUR-PRESIDENT.md:44`). L'essai existant sait dater le suivi mais ne couvre pas une période payante distincte avant le début officiel : le moteur ignore `essaiDebuteLe` et `essaiJours` (`src/lib/ventes/regles.ts:71`, `src/lib/ca/projeter.ts:38`). Déplacer `debuteLe` déplace aussi l'origine de la durée d'engagement et du préavis (`src/lib/contrats/regles.ts:26`). Un commentaire « conditions particulières » n'est pas une règle de calcul (`prisma/schema.prisma:1046`).

**Exemple.** Le cabinet Aurore fait son POC du 1er au 31 décembre 2026 et le valide, avec un abonnement négocié de 900 € HT par mois.

- **A →** janvier est déjà le contrat à 900 € ; début officiel au 1er janvier, sans période payante supplémentaire.
- **B →** janvier est un essai payant à 900 € ; le contrat officiel commence en février, avec une durée d'essai payant à préciser.
- **C →** janvier est un essai payant à prix réduit ; il faut préciser sa durée, le tarif applicable et le début officiel de février ou d'une autre date.

**Options.** A : contrat directement après le POC ; B : essai payant au plein tarif ; C : essai payant à tarif distinct. Pour B ou C, préciser si la durée d'engagement commence pendant cet essai ou après.

**Recommandation.** A, car elle utilise le contrat et ses lignes existants sans inventer une seconde période tarifaire ; B ou C demandent une décision explicite sur le prix, la durée et l'engagement.

### 2. Où rattacher la formation due par un prospect sans contrat ?

**Constat.** Une ligne de prestation actuelle appartient obligatoirement à un contrat (`prisma/schema.prisma:1065`). Un brouillon ne produit aucun montant signé ou figé (`src/lib/ca/projeter.ts:47`). L'activation manuelle est refusée pendant le POC, et un dossier avec contrat actif ne peut pas entrer en POC (`src/lib/contrats/gerer.ts:45`, `src/lib/organisations/changerEtape.ts:183`). « Créer un contrat de POC » ne fonctionne donc pas sans adapter ces gardes. De plus, le test « possède un contrat actif » sert aujourd'hui à exclure un client de l'estimé et à fermer l'alerte contrat à saisir (`src/lib/ca/donnees.ts:51`, `src/lib/alertes/charger.ts:23`).

**Exemple.** Le cabinet Aurore démarre le 1er décembre, doit 750 € de formation et abandonne le POC le 31 décembre sans signer d'abonnement.

- **A →** un contrat réservé à la formation porte une `PRESTATION` de 75 000 centimes datée du début du POC ; il doit être comptable malgré le statut prospect. Il faudra le distinguer du contrat d'abonnement pour les gardes, l'estimé et l'alerte.
- **B →** une prestation rattachée à l'organisation et à l'UUID du cycle porte la dette de 75 000 centimes ; le prospect reste sans contrat d'abonnement. Le courant n'étant pas encore archivé, ce lien ne peut pas exiger une ligne déjà présente dans `CrmCyclePoc` (`src/lib/organisations/cyclesPoc.ts:5`).

**Options.** A : contrat dédié au POC, avec une distinction explicite et des gardes adaptées ; B : prestation sur l'organisation, identifiée par cycle, indépendante de l'abonnement.

**Effet sur le réel et l'export.** A peut réutiliser le calcul des prestations contractuelles au mois du début, mais doit empêcher une recopie facturée dans l'abonnement. B demande d'ajouter les prestations dues confirmées aux entrées de projection et de réel, sans les confondre avec l'estimé C-92. Pour les deux options, une nouvelle clé peut être insérée dans un mois clos ; une clé déjà figée reste inchangée (`src/lib/ca/figer.ts:32`). L'export ne verra la formation que lorsqu'une ligne figée la portera, jamais par une lecture directe de son support (`src/lib/ca/exporter.ts:16`). Le conflit éventuel avec une clé existante est traité en question 7.

**Recommandation.** B, car la formation reste due sans abonnement et cette séparation évite qu'un contrat de formation fasse croire que le contrat d'abonnement est saisi.

### 3. Les 750 € sont-ils dus une fois par cycle de POC pour tout le dossier ?

**Constat.** C-94 donne un identifiant distinct à chaque nouveau POC et conserve le précédent pour le lot 4 (`src/lib/organisations/changerEtape.ts:198`, `src/lib/organisations/cyclesPoc.ts:9`). Cela permet de distinguer les créances, sans décider si chaque nouveau test doit être refacturé. Les bases de prix existantes distinguent organisation, site et salle (`src/lib/tarifs/roles.ts:36`).

**Exemple.** Le cabinet Aurore a trois sites, échoue à un POC en décembre, puis refait un POC en juin après reconquête.

- **A →** 750 € en décembre et 750 € en juin pour le dossier entier ; une pause, une reprise du même UUID ou une prolongation ne crée pas de nouvelle formation.
- **B →** 750 € en décembre seulement ; la formation est unique pour toute la vie du dossier.
- **C →** 750 € par site et par nouveau cycle, soit 2 250 € à chaque test si les trois sites participent.

**Options.** A : par dossier et par nouveau cycle ; B : par dossier une seule fois ; C : par site et par cycle.

**Recommandation.** A, car l'UUID C-94 donne une unité stable pour facturer chaque nouveau test sans refacturer une reprise ou une prolongation.

### 4. La formation du POC s'ajoute-t-elle aux frais d'installation déjà négociés ?

**Constat.** Les tarifs d'installation Talk et Konnect portent déjà les libellés par défaut « Installation et formation Talk/Konnect » (`src/lib/tarifs/roles.ts:46`). Le préremplissage ajoute ces installations pour les offres cochées (`src/lib/tarifs/preremplir.ts:188`), et le réel les compte séparément des abonnements (`src/lib/ca/reel.ts:89`). Le libellé seul ne prouve pas que les 750 € en sont une composante.

**Exemple.** Le cabinet Aurore doit 750 € au début du POC et son devis prévoit 2 500 € de frais d'installation au début du contrat.

- **A →** il doit 750 € puis 2 500 €, soit 3 250 € de frais ponctuels, car ce sont deux prestations distinctes.
- **B →** les 750 € constituent une partie des 2 500 € ; il reste 1 750 € à prévoir au début du contrat, avec un lien explicite pour éviter un deuxième comptage.

**Options.** A : prestations cumulatives ; B : formation comprise dans les frais négociés, avec imputation explicite sur les nouvelles ventes.

**Recommandation.** A sauf accord commercial explicite contraire, car le montant net d'une ligne négociée ne peut pas être diminué sur la seule présence du mot « formation ».

### 5. Quel est le premier mois payant quand le POC se termine en cours de mois ?

**Constat.** Un POC commencé le 3 novembre finit le 2 décembre inclus, ou le 2 janvier s'il est prolongé (`src/lib/organisations/poc.ts:52`). En revanche, un contrat qui débute le 3 décembre compte tout décembre, sans prorata (`src/lib/ca/projeter.ts:47`). La date de décision de validation est un instant conservé dans l'historique, pas une date de début de facturation (`src/lib/organisations/cyclesPoc.ts:9`).

**Exemple.** Le cabinet Aurore teste du 3 novembre au 2 décembre, valide le 2 décembre et doit ensuite 900 € mensuels.

- **A →** début officiel le 3 décembre : décembre contient la fin du POC gratuit et 900 € pour le mois entier, selon C-45.
- **B →** début officiel le 1er janvier : décembre reste gratuit pour l'abonnement et janvier porte les premiers 900 €.

**Options.** A : mois entier du début officiel, même si le POC occupe ses premiers jours ; B : premier mois civil entier après la fin du POC. Dans les deux cas, saisir le début officiel ; une validation anticipée ne doit pas déplacer cette date implicitement.

**Recommandation.** A avec les deux périodes datées visibles dans la case du mois, car elle conserve C-45 sans prorata ; choisir B suppose d'accorder et de dater explicitement la gratuité supplémentaire.

### 6. Faut-il conserver le prix de formation applicable au jour du début du POC ?

**Constat.** `lireGrilleEnVigueur` accepte un instant et sélectionne la dernière grille applicable à cet instant (`src/lib/tarifs/grille.ts:78`). Une grille utilisée par une proposition ou devenue passée ne se modifie plus (`src/lib/tarifs/gerer.ts:20`, `src/lib/tarifs/gerer.ts:36`). Les cycles de POC n'ont aujourd'hui ni prix ni référence de grille (`prisma/schema.prisma:405`, `prisma/schema.prisma:427`). Un tarif sans prix est représenté par un montant technique de 0 accompagné de `prixARenseigner`, distinct d'une gratuité (`src/lib/tarifs/preremplir.ts:146`).

**Exemple.** Le cabinet Aurore commence le 20 décembre avec une grille à 750 € ; une nouvelle grille passe à 800 € le 1er janvier.

- **A →** la formation de décembre reste à 750 € dans le calendrier ; la prestation conserve le prix et la grille utilisés au début.
- **B →** tant qu'aucun montant n'est figé, la lecture de janvier recalcule cette formation à 800 € ; après clôture, le réel conserve l'ancien chiffre et peut diverger du calendrier.

**Options.** A : grille au jour du début du cycle et montant conservé sur la prestation ; B : grille au jour de consultation pour les éléments non figés. Avec A, un prix manquant reste « prix à renseigner » et devra être complété explicitement, sans inventer 750 € dans le moteur.

**Recommandation.** A, car une nouvelle grille ne doit pas changer silencieusement une formation déjà due.

### 7. Comment ajouter une formation tardive si sa clé de décembre est déjà figée ?

**Constat.** Deux prestations sans produit ni centre d'un même dossier partagent `AAAA-MM|organisation|0|0` (`src/lib/ca/reel.ts:42`, `src/lib/ca/reel.ts:84`). Si cette clé existe, `figerMois` ignore le nouveau cumul, même si une formation vient d'y être ajoutée (`src/lib/ca/figer.ts:32`). Changer seulement le contrat ou ajouter un UUID au support métier ne résout pas ce conflit. Les instantanés de `nonRegression.test.ts` vérifient les sorties des moteurs, pas à eux seuls l'absence de mise à jour d'une ligne persistée (`src/lib/ca/nonRegression.test.ts:6`, `src/lib/ca/nonRegression.test.ts:170`).

**Exemple.** En février, le cabinet Aurore fait saisir son POC de décembre ; une prestation hors catalogue de 200 € est déjà figée sur la clé de décembre.

- **A →** les 200 € existants restent intacts ; un complément immuable de 750 €, identifié séparément, reste rattaché à décembre et entre dans l'export. Le total exporté de décembre augmente, sans réécriture de l'ancienne ligne.
- **B →** les 200 € restent seuls dans le réel et l'export de décembre ; le calendrier montre la formation manquante et une alerte demande une régularisation humaine, sans la déplacer automatiquement sur février.

**Options.** A : mécanisme additif de compléments, avec identité et lecture d'export explicites ; B : signaler le conflit et laisser la régularisation hors du calcul automatique. A étend le stockage et l'export ; B laisse le montant du mois incomplet jusqu'à une décision. Aucune option ne réécrit une clé figée.

**Recommandation.** A si les saisies tardives doivent être traitées dans le lot 4, car elle conserve le mois demandé et l'intégrité des anciennes lignes ; les tests futurs devront distinguer ancien contenu inchangé et nouveau total enrichi.

### 8. Quel fait permet de dire que la formation a été facturée ?

**Constat.** Les modèles de contrat, de ligne et de cycle ne portent pas de statut de facture émise (`prisma/schema.prisma:1027`, `prisma/schema.prisma:1065`, `prisma/schema.prisma:405`). Le réel actuel est calculé depuis les lignes et les dates, sans preuve d'émission de facture (`src/lib/ca/entreesReel.ts:17`). Le top facturation est un envoi manuel après mise en service, pas une preuve de facture de formation au début du POC (`src/lib/checklist/definition.ts:404`).

**Exemple.** Le cabinet Aurore a une formation due le 1er décembre, mais l'équipe n'émet la facture que le 4 décembre.

- **A →** dès que la prestation existe, Pilot considère la formation comme prévue et prête à facturer ; il peut détecter une prestation absente, mais ne sait pas que la facture manque du 1er au 3.
- **B →** une déclaration datée « facture émise », faite par un compte autorisé à modifier les montants, ferme l'alerte le 4 ; le calendrier garde la formation due au mois de décembre même avant cette déclaration.

**Options.** A : contrôler seulement la préparation de la facturation, avec un libellé qui le dit ; B : conserver une déclaration explicite d'émission, distincte du calendrier, du réel figé et d'un encaissement. Aucun envoi de facture ni raccordement comptable n'est présumé.

**Recommandation.** B, car l'alerte « formation non facturée » exige un fait d'émission ; la seule existence d'une ligne ne le prouve pas.

### 9. Quelles alertes de facturation faut-il activer dès le lot 4 ?

**Constat.** L'alerte fin de POC existe dès J-7 et garde une clé propre au cycle (`src/lib/organisations/poc.ts:69`, `src/lib/alertes/calculer.ts:113`). « Contrat à saisir » existe déjà, après trois jours en Signé sans contrat actif (`src/lib/alertes/calculer.ts:22`, `src/lib/alertes/calculer.ts:133`). Le top exige la mise en service et, lorsque le PV est suivi, un PV fait, mais ne contrôle pas un calendrier (`src/lib/checklist/gardes.ts:24`, `src/lib/checklist/gardes.ts:39`).

**Options.** A : activer les trois contrôles proposés ci-dessous ; B : garder les alertes existantes et n'ajouter que les contrôles sélectionnés explicitement parmi les trois.

| Contrôle proposé | Exemple concret, réponse A et réponse B | Destinataire et fermeture proposés |
|---|---|---|
| Formation à traiter dès le début du POC | Aurore commence le 1er décembre sans prestation confirmée, ou sans déclaration d'émission si la question 8 retient B. A → alerte dès le 1er, sans délai, qui reste après un POC non transformé si la dette subsiste. B sans ce contrôle → aucune nouvelle alerte de formation. | Directeur général, puis personne à qui il la confie ; fermeture lorsque le fait retenu en question 8 est renseigné. Une cause par cycle, sans montant dans le détail. |
| Début payant sans contrat d'abonnement actif | Aurore est client, avec un début payant prévu le 1er janvier et un brouillon. A → la cause « contrat à saisir » devient immédiatement visible au début payant, même si les trois jours de grâce ne sont pas écoulés ; pas une deuxième alerte pour la même absence. B sans ce renforcement → délai actuel de trois jours en Signé. Sans date payante fiable, conserver la règle actuelle. | Directeur général, puis personne à qui il la confie ; fermeture à l'activation du contrat d'abonnement pertinent, pas d'un simple support de formation. |
| Top facturation incohérent | Aurore a un top coché, mais aucun début payant renseigné, une période gratuite qui chevauche le début officiel selon la règle retenue, ou une formation attendue absente. A → alerte dès la lecture de l'incohérence. B sans ce contrôle → les seules gardes actuelles du top restent appliquées. | Directeur général, puis personne à qui il la confie ; fermeture à la correction du calendrier ou du top. Une cause par dossier, avec les centres concernés, sans montant dans le détail. |

Pour chaque ligne, le mécanisme existant choisit l'attribution humaine du groupe, sinon le directeur général ; sans directeur disponible, il cherche le premier super-administrateur disponible (`src/lib/alertes/calculer.ts:76`, `src/lib/alertes/charger.ts:57`). Aucun destinataire supplémentaire ni courriel n'est proposé. Les futures alertes restent calculées à la lecture, comme `calculerAlertes` (`src/lib/alertes/calculer.ts:90`). Le signal de formation devra distinguer les cycles, à l'image de fin-poc, pour qu'un report du précédent ne masque pas le suivant (`src/lib/alertes/calculer.ts:113`).

**Recommandation.** A, avec le destinataire C-91 pour les trois contrôles et le renforcement de la cause existante pour le contrat, car chaque alerte correspond à une action distincte sans doublonner le même manque.

### 10. L'interdiction de montrer des montants aux développeurs s'étend-elle aux écrans existants ?

**Constat.** La demande du lot 4 impose l'absence de tout montant pour le développeur. C-64 avait expressément limité l'interdiction à la page Chiffre d'affaires et à son export, en gardant les montants des dossiers (`CHOIX.md:1561`). Dans le code, les droits toujours interdits au développeur sont `VOIR_CA` et `EXPORTER_CA` ; `droitsEffectifs` les retire côté serveur (`src/lib/acces/droits.ts:31`, `src/lib/acces/droits.ts:74`). Ventes reste accessible avec le droit de lecture de Pilot et reçoit des montants (`src/app/pilot/ventes/page.tsx:11`). Il y a donc une différence de périmètre à préciser, pas une garde générale déjà présente.

**Exemple.** Un développeur ouvre le dossier Aurore avec son abonnement de 900 € et sa formation de 750 €.

- **A →** le nouveau calendrier ne lui transmet aucun montant, y compris via les réponses serveur ; les montants préexistants des contrats, devis et Ventes restent soumis à l'ancienne règle C-64.
- **B →** aucun montant ne lui est transmis dans les écrans et routes existants non plus ; le lot doit élargir les gardes au-delà du nouveau calendrier, notamment aux montants déjà servis par Ventes.

**Options.** A : confidentialité du nouveau calendrier et des nouvelles données du lot ; B : interdiction générale des montants dans Pilot pour ce profil, qui amende C-64.

**Recommandation.** B si « aucun montant » vise tout le produit, car masquer le seul calendrier laisserait les mêmes chiffres accessibles ailleurs ; cette portée doit être écrite en C-95 avant l'implémentation.

## Peut attendre

### 11. Faut-il distinguer le libellé de formation dans l'export comptable ?

**Constat.** Le réel actuel agrège les montants par organisation, produit et centre, sans libellé de prestation ni UUID de cycle (`prisma/schema.prisma:1187`). L'export traduit une absence de produit par « Hors catalogue » (`src/lib/ca/export.ts:70`). Le choix du support et des compléments reste bloquant en questions 2 et 7 ; le détail éditorial de l'export peut attendre si ces montants y entrent correctement.

**Exemple.** Le cabinet Aurore a 750 € de formation et 200 € d'une autre prestation hors catalogue dans le même mois.

- **A →** l'export garde son format actuel et peut présenter 950 € de prestations hors catalogue sur la même clé ; la fiche donne le détail.
- **B →** un export détaillé supplémentaire distingue « Formation du POC » et l'autre prestation, avec leurs identités propres ; ce détail demande une source conservée, il ne se déduit pas du total figé.

**Options.** A : format agrégé actuel ; B : export détaillé supplémentaire, à cadrer après le choix du stockage.

**Recommandation.** A pour le format comptable actuel, car il reste compatible avec l'agrégation C-46 ; le détail par prestation pourra être ajouté sans prétendre le reconstituer depuis des totaux anciens.

### 12. Peut-on nommer le prochain contrôle HTTP `scripts/verifier-aa.ts` ?

**Constat.** Le dernier contrôle de lot importé et exécuté est `verifierZ`, depuis `scripts/verifier-z.ts`, après Y (`scripts/verifier.ts:37`, `scripts/verifier.ts:330`). Il couvre aussi C-94 (`CHOIX.md:3673`). Le prompt ne définit pas de convention après Z.

**Exemple.** La recette future vérifie le calendrier du cabinet Aurore après les contrôles de ses cycles de POC.

- **A →** ces vérifications vivent dans `verifier-aa.ts`, avec `verifierAA` appelé après `verifierZ`.
- **B →** elles vivent dans `verifier-facturation.ts`, avec `verifierFacturation` appelé au même endroit ; la suite abandonne la convention par lettres.

**Options.** A : continuer en AA ; B : passer à un nom fonctionnel.

**Recommandation.** A, car elle prolonge la convention des lots sans renommer aucun script existant.

## Point d'arrêt

Questions 1 et 2 laissées ouvertes, ainsi que les autres arbitrages ci-dessus. Aucun code applicatif écrit. Aucune migration, seed, serveur, contrôle HTTP, mesure, test, lint ou build lancé dans cette lecture. Aucune écriture en base et aucun commit. La prochaine réalisation documentera le lot en C-95, une fois les réponses données.

## Réponses du 22/11/2026

Décisions de l'utilisateur, recueillies par Claude, qui pilote. Elles font foi pour la réalisation (C-95).

1. **Pas de mois d'essai payant après le POC.** Un POC validé mène directement au contrat : les mois payants sont ceux du contrat, à partir de son début officiel (C-45). `essaiDebuteLe` et `essaiJours` restent un suivi daté, sans effet sur les montants.
2. **La formation est notée sur le dossier**, rattachée au POC qui l'a déclenchée, à part de tout contrat. Elle compte dans le chiffre d'affaires, le réel figé et l'export du mois de début de ce POC, même sans contrat. Le contrat d'abonnement reste à saisir à part.
3. **Une seule formation par dossier, pour toute sa vie.** Elle est due au début du premier POC du dossier. Un nouveau POC plus tard (nouveau cycle C-94), une prolongation ou une reprise ne refacturent rien. Le calendrier d'un POC suivant montre « formation déjà facturée au POC du … ».
4. **La formation s'ajoute aux frais d'installation.** Deux prestations distinctes ; aucune déduction automatique. Une déduction éventuelle passe par une remise du commercial sur la ligne d'installation.
5. **Alertes retenues, toutes les quatre**, attribuées par C-91 (Direction générale, puis la personne à qui elle est confiée), calculées à la lecture, sans montant dans le détail :
   - **facture de formation à émettre** : ouverte dès le début du POC qui déclenche la formation, fermée par une déclaration datée « facture de formation émise », faite par un compte qui peut modifier les montants. Nouvelle donnée manuelle, distincte du calendrier, du réel figé et d'un encaissement ;
   - **prix de formation à renseigner** : aucun prix de formation dans la grille en vigueur au début du POC ;
   - **mois payant sans contrat actif** : renforce la cause existante « contrat à saisir » (pas de deuxième alerte) : elle s'ouvre dès le premier mois payant attendu, sans attendre les 3 jours de grâce, si une date payante fiable existe ; sinon la règle actuelle s'applique ;
   - **top facturation incohérent** : top coché alors que le calendrier ne tient pas (pas de contrat actif, ou formation due absente). L'alerte dit quoi corriger.

Défauts retenus par le pilote, sans objection de l'utilisateur :

- question 5 (premier mois payant) : **A**, le mois entier du début officiel du contrat, sans prorata (C-45) ; la case du mois montre les deux périodes datées ;
- question 6 (prix) : **A**, le prix de la grille en vigueur le jour du début du POC, conservé. Un prix absent reste « prix à renseigner », jamais 750 € inventés ;
- question 7 (mois déjà figé) : **B**, on ne réécrit jamais une clé figée. Le calendrier signale « non comptée dans le réel de <mois>, déjà arrêté » et une alerte demande une régularisation humaine. Si la clé du mois n'existe pas encore, le mécanisme actuel l'insère au prochain passage de `figer` sur ce mois ;
- question 10 (développeur) : **A**, aucun montant du nouveau calendrier ni des nouvelles données du lot n'est transmis à un développeur, garde côté serveur via `droitsEffectifs` (`VOIR_CA`). Les montants déjà visibles ailleurs (contrats, devis, Ventes) restent régis par C-64, décision de l'utilisateur ;
- question 11 (export) : **A**, format agrégé actuel ;
- question 12 : **A**, `scripts/verifier-aa.ts`, `verifierAA` appelé après `verifierZ`.
