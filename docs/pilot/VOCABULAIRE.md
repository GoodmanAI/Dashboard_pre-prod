# Vocabulaire de l'interface

Les mots que Pilot affiche, choisis pour qu'une personne qui découvre l'outil
comprenne sans formation (CHOIX.md, C-54). Une règle par ligne : un mot ne
désigne qu'une chose, et une chose n'a qu'un mot.

Ce fichier ne touche que les **textes affichés**. Les codes (`EN_PRODUCTION`,
`JETON_XPLORE`…) et les énumérations ne changent jamais (CLAUDE.md).

## Principes

- On nomme ce que l'utilisateur fait ou voit, pas la mécanique interne.
- Les vrais systèmes gardent leur nom : Xplore, EDL, RIS, Dashboard, Talk,
  Konnect, Desk. Un nouveau venu les rencontrera sous ce nom ailleurs.
- « Mise en service » désigne le déploiement d'un centre. Les frais facturés une
  fois s'appellent « frais d'installation ».
- Un bouton dit ce qu'il fait. Un message dit ce qui bloque et comment avancer.
- Phrases courtes, aucun tiret cadratin, aucun emoji (CLAUDE.md).

## Menu

| Avant | Maintenant | Ce que c'est |
|---|---|---|
| Pipeline | Prospects | Les clients potentiels, du premier contact à la signature (C-62 ; « Ventes » avant) |
| (nouveau) | Ventes | Ce qui a été vendu : dates clés, produits et tarifs des clients signés (C-62) |
| Intégrations, Mises en service | Déploiement | Les dossiers à préparer, puis les installations en cours, centres en POC compris. URL conservée : `/pilot/integrations` |
| Chez les tiers | Relances | Ce qu'on attend d'EDL, d'un opérateur, du client… |
| Organisations | Clients | Prospects et clients, toutes étapes confondues |
| Parc | Centres à surveiller | Les centres en service qui décrochent, à appeler en premier |
| Direction (groupe) | Pilotage | Chiffre d'affaires et centres à surveiller |
| (nouveau) | Demandes | Ce qu'on demande à un collègue de faire sur un client (C-58) |
| (nouveau) | Mon compte | Qui je suis, mon rôle, mes demandes (C-57) |
| (nouveau) | Comptes à relier | Les comptes du Dashboard que Pilot ne suit pas encore, et les clients signés sans contrat (C-60) |
| (nouveau) | Apport d'affaires | Les groupes apportés par un apporteur, leurs commissions et les factures des apporteurs (C-63) |
| (nouveau) | Équipe | Les comptes de l'équipe et leurs droits, pour le super-administrateur seul (C-64) |
| (nouveau) | Concurrents | Les solutions concurrentes, leurs prix relevés, où elles sont en place (C-73) |
| (nouveau) | Tarifs | La grille de prix de Lyrae, hors taxe : en vigueur, à venir, passées (C-75, C-77) |
| (nouveau) | Carte | Les prospects, les clients et les concurrents en place, sur la carte de France (C-80 à C-82) |

## Étapes d'un client

| Code | Avant | Maintenant |
|---|---|---|
| PROSPECT | Prospect | Prospect |
| POURPARLERS | Pourparlers | Premiers échanges |
| VISIO_TECHNIQUE | Visio technique | Étude technique |
| PROPOSITION | Proposition | Devis envoyé |
| EN_POC | (nouveau) | En POC |
| POC_NON_TRANSFORME | (nouveau) | POC non transformé |
| SIGNE | Signé | Signé |
| EN_INTEGRATION | En intégration | Mise en service |
| EN_PRODUCTION | En production | En service |
| ARRETE | Arrêté | Contrat terminé |
| PERDU | Perdu | Perdu |
| EN_SOMMEIL | En sommeil | En pause |

Groupes d'étapes du tableau des prospects : **Avant la signature** (POC compris),
**Perdus et en pause** (POC non transformés compris). Les clients se suivent dans
Clients, Ventes et Déploiement. En tête de la même barre, **À prospecter** :
la liste filtrable des établissements à l'étape Prospect (C-65).

## Mise en service d'un centre

| Code | Maintenant |
|---|---|
| PREMIERE_VISIO | Première visio avec le client |
| VISIO_TECHNIQUE | Visio technique : accès au RIS, agenda, opérateur téléphonique |
| ACCES_DASHBOARD_ENTRAINEMENT | Accès au Dashboard d'entraînement envoyé |
| FORMATION_DASHBOARD | Client formé au paramétrage du Dashboard |
| JETON_XPLORE | Jeton d'accès Xplore reçu d'EDL et testé |
| CODE_CENTRE | Centre relié à son compte Dashboard |
| MAPPING_EXAMENS | Examens associés entre Xplore et Lyrae |
| TEST_CRENEAUX | Créneaux testés : le robot voit le vrai planning |
| REGLAGES_ROBOT | Robot paramétré : consignes, FAQ, questions |
| INTERFACAGE_TELEPHONIQUE | Ligne téléphonique branchée et testée |
| INTEGRATION_SITE_WEB | Prise de rendez-vous ajoutée au site web |
| FORMATION_SECRETAIRES | Secrétaires formées |
| PREMIER_APPEL_REEL | Premier vrai appel, premier rendez-vous pris |
| PASSAGE_PRODUCTION | Mise en service déclarée |
| PASSATION | Mail de passation reçu |
| PRECADRAGE_INTERNE | Pré-cadrage interne fait |
| PARCOURS_PATIENT | Parcours patient validé par le client |
| CONTACTS_FACTURATION | Contacts facturation récupérés |
| RESPONSABLE_DESIGNE | Responsable du déploiement désigné |
| LISTE_ELEMENTS | Liste des éléments à fournir envoyée au client |
| REGLES_EXAMENS | Règles par examen : préparation, contre-indications, ordonnance obligatoire |
| LECTURE_ORDONNANCE | Lecture d'ordonnance testée sur des ordonnances du centre |
| MESSAGES_PATIENTS | Messages patients paramétrés : confirmation, rappels SMS et mail |
| FORMATION_CONFIRMEE | Formation confirmée par le client |
| DATE_DEMARRAGE_CONFIRMEE | Date de démarrage confirmée au client |
| PV_RECETTE | PV de recette signé par le client |
| TOP_FACTURATION | Top départ envoyé à la facturation |
| SUIVI_J1 | J+1 : point avec le secrétariat, corrections urgentes |
| SUIVI_S1 | S+1 : point client, réglages ajustés |
| BILAN_M1 | M+1 : bilan du premier mois |
| ESSAI_VALIDE | M+1 : essai du contrat signé validé par le client |

Pour Konnect, quatre libellés changent : « Jeton d'accès au RIS reçu de l'éditeur
et testé », « Examens associés entre l'agenda et Konnect », « Créneaux en ligne
testés : Konnect voit le vrai planning », « Premier rendez-vous pris en ligne via
ordonnance ». « Secrétaires formées » devient « Secrétaires formées au Dashboard ».

Les étapes sont rangées en six phases (C-85) : **Passation**, **Cadrage**,
**Mise en place technique**, **Paramétrage et formation**, **Go / no-go et
démarrage**, **Suivi**. Une case qui part de la mise en service dit « après la
mise en service » tant qu'elle n'a pas eu lieu, puis « prévue le … ».

Sur un contact, la case **Reçoit les factures** coche seule « Contacts
facturation récupérés ».

| Avant | Maintenant |
|---|---|
| Date réaliste | Date estimée |
| Régressions récentes | Étapes revenues en arrière |
| Évaluer maintenant | Vérifier maintenant |
| En production avec réserves | En service, étapes à finir |
| Prêt pour la production | Prêt pour la mise en service |
| Pas encore prêt | Pas encore prêt |
| Passage en production | Mise en service |
| Rattacher un produit | Ajouter un produit |
| Compte Dashboard | Compte client sur le Dashboard |
| Vague | Vague de mise en service |
| Levée (attente) | Réponse reçue |

## Argent

Facturation du dossier (C-95) :

| Terme | Sens |
|---|---|
| Calendrier de facturation | Mois de formation, périodes de POC gratuites et mois payants des contrats |
| Formation du premier POC | Prestation unique pendant toute la vie du dossier, due au début de son premier POC, même sans contrat |
| Formation déjà due au POC du… | Un nouveau POC reprend le dossier sans nouvelle formation ; « déjà facturée » si la facture a été déclarée émise |
| Prix à renseigner | Tarif absent au début du premier POC ; un compte autorisé complète le prix sur la formation du dossier |
| Facture de formation déclarée émise | Déclaration datée qui ferme l'alerte de facture, distincte d'un encaissement |
| Formation à régulariser | Formation non comptée dans un réel déjà arrêté ; régularisation humaine, sans réécriture de la clé figée |
| Formation à ajouter au réel | Prix connu d'un mois terminé, sans clé comptable ; sera ajoutée au mois d'origine au prochain arrêté mensuel |
| Top facturation incohérent | Le top est coché mais la formation due manque ; le contrat manquant relève uniquement de « Contrat à saisir » |

Les mois payants commencent au début officiel du contrat. Aucun essai payant
supplémentaire après le POC. La formation s'ajoute aux frais d'installation.

| Avant | Maintenant |
|---|---|
| Récurrent signé | Abonnements signés |
| Récurrent estimé | Abonnement estimé |
| Pondéré en cours | Ventes probables |
| Pondéré | Probable |
| Mise en service (frais) | Frais d'installation |
| Part variable | Part à l'usage |
| Réel figé | Chiffre clôturé |
| Réel et projection | Réel et prévision |
| Catégorie de prévision | Niveau de confiance |
| Jalon | Étape clé |
| Plan de signature | Étapes jusqu'à la signature |
| Date de début (contrat) | Début officiel du contrat |
| Engagement en mois | Durée du contrat en mois |
| (nouveau) | Essai : durée en jours, avant le début officiel |
| (nouveau) | Reconduction : tacite, sur accord écrit, sans reconduction |
| (nouveau) | Conditions particulières : ce qui est négocié en plus des lignes de tarif |

« Fin d'engagement » reste le mot de la fin de la durée du contrat, comme dans
les alertes. « Interfaçage » est aussi un type de rendez-vous du journal, à côté
de « Formation » (C-62).

## Alertes et centres à surveiller

| Avant | Maintenant |
|---|---|
| Mettre en sommeil | Reporter |
| Réactiver | Réafficher |
| En sommeil (alertes) | Reportées |
| Feux | Indicateurs |
| Usage | Volume d'appels |
| Silence | Dernier appel |
| Suivi renforcé | Suivi renforcé (14 premiers jours) |

| Terme | Sens |
|---|---|
| Qui agit | Le poste et la personne qui doivent traiter l'alerte (C-91) |
| Confier | Le directeur général, ou le super-administrateur, donne l'alerte à une autre personne |
| Directeur général | Reçoit d'office toutes les alertes, désigné dans l'écran Équipe |
| Même cause | Les autres signaux repliés sous une alerte : une alerte par cause et par dossier |
| Contrat à saisir | Un client signé sans contrat actif : l'alerte va au directeur général (C-92) |

## Trois montants mensuels, trois noms (C-92)

Ce sont trois chiffres justes, qui ne comptent pas la même chose. Aucun écran ne
les appelle « récurrent » tout court.

| Terme | Où | Ce qu'il compte |
|---|---|---|
| Abonnements signés | Chiffre d'affaires, fiche | Les lignes d'abonnement des contrats actifs |
| Estimé, contrat à saisir | Chiffre d'affaires, fiche, carte | Un client signé sans contrat actif : brouillon, proposition ou opportunités. Jamais mêlé au signé |
| Facturé, mois figé | Chiffre d'affaires, « Réel et prévision » | Ce qui a été facturé un mois clos : abonnements, part à l'usage et installations |
| À la grille | Apport d'affaires | Salles × prix de la grille : la base des commissions des apporteurs |

| Terme | Sens |
|---|---|
| Sites | Le nombre saisi sur la fiche, jamais moins que les centres créés dans Pilot (C-92) |

## Comptes et demandes

| Terme | Sens |
|---|---|
| Super-administrateur | Rôle SUPER_ADMIN : tous les droits |
| Équipe Lyrae | Rôle ADMIN |
| Demander à… | Créer une demande pour un collègue |
| Fait / Annuler | Le destinataire marque faite ; le demandeur annule |
| Prise de RDV aujourd'hui | L'outil du centre avant Lyrae (Doctolib, EasyDoct…) |
| Ce qui bloque le déploiement | Les causes relevées sur le terrain (C-59) |

## Apport d'affaires (C-63)

Les mots du calculateur des apporteurs, gardés tels quels : c'est le vocabulaire
du contrat d'apporteur et de son annexe 2.

| Terme | Sens |
|---|---|
| Apporteur d'affaires | La personne ou la structure qui signale un groupe à Neuracorp AI |
| Co-apporteur | Le second apporteur d'un apport partagé (art. 3.5), avec sa part en % |
| Groupe | Un client apporté : c'est un client de Pilot, rien d'autre |
| Fiche de signalement | L'annexe 2 : la fiche envoyée à Neuracorp AI avant toute démarche |
| Décision | Validé, refusé ou en attente ; sans réponse sous 7 jours, le prospect est réputé refusé |
| Caducité | Fin de validité de la validation : 12 mois, prorogés par un bon de commande |
| Parcours de commande | Prospect, bon de commande envoyé, commande validée, commande installée |
| Validé pour tout le groupe | Une offre cochée au groupe vaut pour tous ses sites |
| Connecteur RIS | L'option facturée en pourcentage du montant des salles |
| Palier | Tranche du portefeuille qui fixe le taux de commission |
| Socle sécurisé | La commission sans aucune nouvelle installation |
| Encaissé | Ce que Neuracorp AI a réellement perçu du groupe ce mois-là |
| Vente directe | Un apporteur non commissionné, pour les groupes sans apport |

## Comptes et droits (C-64)

| Terme | Sens |
|---|---|
| Super-administrateur | Crée les comptes de l'équipe et donne les droits. A tous les droits, toujours |
| Gérant | Voit et pilote tout, chiffre d'affaires compris |
| Développeur | Suit les clients et les mises en service. Ne voit pas le chiffre d'affaires |
| Équipe Lyrae | (ancien libellé du rôle ADMIN) remplacé par Gérant ou Développeur |
| Droits | Ce qu'un compte peut faire en plus du suivi des clients, coché un à un |
| Mot de passe provisoire | Tiré au hasard à la création, montré une fois au super-administrateur, à changer dans Mon compte |
| Retirer l'accès | La personne ne se connecte plus ; ses clients et son historique restent |
| Rôle pas encore choisi | Un compte de l'équipe que le super-administrateur n'a pas encore réglé : traité en développeur |

## Prospection (C-65)

| Terme | Sens |
|---|---|
| À prospecter | La liste des établissements à l'étape Prospect, à filtrer et à trier |
| Priorité | A+, A, B ou C : l'ordre dans lequel les contacter. A+ en premier |
| Jamais contacté | Aucun échange noté, et aucune action en retard |
| À relancer | La prochaine action est passée |
| Contacté | Au moins un échange noté, et aucune action en retard |
| Standard | Le téléphone de l'établissement. Les personnes sont des contacts |
| Email du standard | L'adresse générique de l'établissement (accueil, secrétariat) |
| Solution concurrente | Ce que l'établissement utilise déjà à la place de Lyrae : robot vocal, centre d'appels… |
| Peut-être déjà dans Pilot | Un établissement au nom proche, signalé pendant la saisie |
| Créer et saisir un autre | Enregistre le prospect et vide la fiche pour le suivant |

## Classer les clients (C-66)

| Terme | Sens |
|---|---|
| Classer par | Étape, RIS ou Prise de RDV : l'ordre et les groupes de la liste des clients |
| Famille | Les écritures d'un même outil réunies : « Xplore » et « Xplore (EDL) » sont la famille Xplore (EDL) |
| Non renseigné | Le RIS ou l'outil de RDV n'est pas encore connu |

## Montant et conversion (C-68 à C-71)

| Terme | Sens |
|---|---|
| Client, contact ou centre | Le champ de recherche, toujours en haut de l'écran. Ctrl+K y place le curseur |
| Choisissez dans la liste ou saisissez-le | Le RIS ou l'outil de RDV : la liste propose aussi ce qui a déjà été saisi |
| Montant estimé par mois | Ce que le prospect pourrait payer chaque mois, hors taxe. Il devient une opportunité |
| Montant par mois | La case d'en-tête de la fiche. Elle dit d'où vient le chiffre |
| signé | Le montant vient des contrats actifs : ce que le client paie |
| proposition v2 | Le montant vient de la version 2 de la proposition envoyée, remise déduite |
| estimé | Le montant vient des opportunités ouvertes, pas encore d'une proposition |
| Contrat en brouillon | Le client est signé, mais son contrat n'est pas encore actif. Complétez ses lignes et activez-le dans l'onglet Argent |
| Contrat activé | Le contrat en brouillon devient actif : ses lignes comptent dans les abonnements signés |
| Opportunité gagnée | Conclue par un contrat actif qui porte son produit : à l'activation, à l'acceptation ou à l'ajout d'une ligne |
| reste ouverte | Une opportunité dont aucun contrat actif ne porte le produit. Elle compte encore dans l'estimé |
| Opportunités ouvertes | Les estimations chiffrées avant la proposition, à modifier dans l'onglet Argent |
| Convertir en client | Faire passer un prospect en Signé. Les étapes intermédiaires sont franchies le même jour. La fiche, les contacts et la chronologie restent les mêmes |
| à la conversion | Mention de la chronologie sur une étape franchie pendant une conversion |

## Concurrents et température (C-73, C-74)

| Terme | Sens |
|---|---|
| Concurrents | La page des solutions concurrentes : leur offre, leurs prix relevés, où elles sont en place, les affaires perdues contre elles |
| Relevé | Un prix noté chez un concurrent à une date, avec ses conditions et sa source |
| En vigueur | Le relevé le plus récent d'un concurrent |
| Prix non relevé | Aucun prix connu. Jamais affiché 0 €. À côté d'un autre prix, il dit duquel il parle : « Installation : prix non relevé » |
| Concurrent en place | Le concurrent que l'établissement utilise déjà, dans le bloc Solution actuelle |
| Lequel ? | Choisir ou créer ce concurrent depuis la fiche rapide |
| Contre qui ? | Le concurrent qui a gagné une affaire perdue avec le motif Concurrent. Facultatif |
| Passés chez Lyrae | Les établissements qu'un concurrent équipait et qui sont devenus clients |
| Température | Froid, Tiède ou Chaud : où en est un prospect avant la signature, d'après un barème de points sur la fiche |
| Froid | 0 à 4 points sur 11 |
| Tiède | 5 à 8 points, ou plus sans décideur parmi les contacts |
| Chaud | 9 points ou plus, avec un décideur parmi les contacts |
| Forcée | Choisie à la main à la place du calcul. Se dit avec son auteur, sa date et ce que dit le calcul |
| Le calcul dit | La température du barème, montrée à côté d'une température forcée qui diffère |
| Corriger | Forcer la température, ou revenir au calcul |
| Sans objet | Après la signature, ou pour un dossier perdu ou en pause : pas de température |
| RIS inconnu | Le RIS n'est pas renseigné ou reste incertain (Inconnu, NC, À vérifier). À distinguer de « Aucun RIS » : l'établissement n'en a pas |
| Équipements déclarés | IRM, scanners, radio, échographes et mammographes de la fiche, comptés quand le nombre de salles manque |
| Ce que vous savez du client | Le bloc des cases Besoin exprimé, Budget évoqué et Solution actuelle connue. Seules les deux premières comptent dans la température |
| Besoin exprimé | Remplace « Besoin identifié » : le prospect a dit ce qu'il cherche |
| Trier par | Dans À prospecter : l'ordre habituel, ou la température, les plus chauds d'abord |

## Tarifs et propositions (C-75 à C-77)

| Terme | Sens |
|---|---|
| Grille tarifaire | La liste des prix hors taxe de Lyrae, avec la date à partir de laquelle ils s'appliquent |
| Grille en vigueur | La grille dont la date est la plus récente sans dépasser aujourd'hui. Tous les prix de Pilot en viennent, apport d'affaires compris |
| Prochaine grille | Une grille datée dans le futur, encore modifiable |
| Grille utilisée | Une proposition s'en sert : elle ne change plus. Pour changer un prix, on crée une nouvelle grille datée |
| Créer une nouvelle grille datée | Copier une grille et y changer un prix, à partir d'une date |
| Rôle d'un tarif | Ce que le tarif représente pour le préremplissage : abonnement Talk, connecteur RIS, installation, autre prestation… |
| Prix à renseigner | Le tarif existe mais n'a pas de prix. Jamais affiché 0 € |
| Produit non relié | Un tarif de produit sans produit du catalogue : ses lignes préremplies seraient hors catalogue |
| Préremplir avec la grille du… | Remplacer les lignes d'un brouillon par celles de la grille en vigueur |
| Nouvelle version préremplie | Une nouvelle version dont les lignes viennent de la grille en vigueur |
| À chiffrer | Une ligne à 0 € qui n'est pas offerte. La version ne s'envoie pas tant qu'il en reste |
| Hors catalogue | Une ligne sans produit du catalogue : une prestation, une vente de RIS |
| Prestation | Ce qui se facture une seule fois, hors abonnement, comme une installation |
| Offert | Un geste commercial : la ligne garde son prix affiché, le client ne la paie pas. Le contrat la porte à 0 € |
| Gestes commerciaux | Le total des lignes offertes d'une proposition |
| Remplacée par la version N | Une ancienne version : on ne l'accepte plus, on répond sur la dernière |
| Offert, sans prix affiché | Une ligne offerte à 0 € : un geste dont on ne montre pas la valeur, par exemple « Formation incluse » |
| Grille passée | Une ancienne grille, consultable, qui ne se modifie plus |
| Récapitulatif, hors taxe | Brut, remise, gestes commerciaux et net, pour l'abonnement et pour ce qui se facture une fois |
| Installations et prestations du mois | Sur la page Chiffre d'affaires, ce qui est facturé une fois ce mois-ci (avant : « Frais d'installation du mois ») |
| TVA des montants TTC affichés | Réglage de l'apport d'affaires qui sert seulement à montrer le TTC aux apporteurs |

## Commentaires et départements (C-78, C-79)

| Terme | Sens |
|---|---|
| Commentaire | Une note laissée sur la fiche d'un client, visible par l'équipe. Jamais de donnée patient |
| Prévenir | Choisir qui reçoit une alerte avec le commentaire : personne, tout le monde, un département, une personne |
| Sans alerte | Un commentaire qui n'a prévenu personne |
| Pour vous | Dans Aujourd'hui : les demandes à traiter et les commentaires non lus qui vous concernent. Les demandes en retard d'abord |
| Pastille | Le nombre rouge sur « Aujourd'hui » : demandes à traiter et commentaires non lus |
| Nouveau | Un commentaire que vous n'aviez pas encore lu |
| Département | Commercial, Projet, Technique ou Direction. Un par personne de l'équipe, choisi par le super-administrateur dans Équipe |
| Département pas encore choisi | Le compte ne reçoit pas les alertes adressées à un département |
| Origine refusée | Une requête venue d'un autre site a été bloquée |

## Carte (C-80 à C-82)

| Terme | Sens |
|---|---|
| Localisé | Le centre a une position sur la carte |
| Position à vérifier | L'adresse correspond à plusieurs lieux : le centre est placé au plus probable, en pointillé |
| Adresse introuvable | Rien de crédible pour cette adresse, ou un résultat dans un autre département |
| Adresse incomplète | Il manque la rue, ou le code postal et la ville |
| Localisation en cours | La position se calcule toute seule après l'enregistrement de l'adresse |
| Localisation pas encore faite | Elle sera retentée automatiquement, toutes les quinze minutes |
| Pas encore localisés | La liste des centres sans marqueur, chacun avec sa raison |
| Montant du dossier | Le montant de tout le dossier, affiché dans la bulle de chacun de ses centres |
| Losange : affaire perdue | En mode concurrents, un établissement perdu contre un concurrent |
| Perdu contre X | L'affaire a été perdue au profit de ce concurrent |
| Par concurrent | Colorer la carte par concurrent : établissements équipés et affaires perdues |

## POC et Déploiement (C-93)

| Terme | Sens |
|---|---|
| POC, En POC | Test de Lyrae avant la signature. Le dossier reste un prospect. Un mois gratuit par cycle, prolongeable une seule fois d'un mois |
| POC non transformé | Test terminé sans signature. Motif et précision obligatoires, comme pour Perdu. La reconquête vers Prospect reste possible |
| Début du POC | Date portée par l'organisation, distincte du début de l'essai d'un contrat signé |
| Fin prévue du POC | Un mois calendaire depuis le début, deux avec la prolongation. Dernier jour compris, comme l'essai du contrat |
| Prolonger le POC d'un mois | Repousser la fin prévue d'un mois, une seule fois. La date de cette décision reste sur l'organisation |
| Fin du POC à décider | Alerte commerciale dès J-7, encore ouverte après la fin. Trois issues : validé, prolongé, non transformé. D'office à la Direction générale, sans montant |
| Valider le POC et convertir en client | Passage en Signé par la conversion existante : acceptation de la proposition en attente ou création d'un contrat en brouillon |
| Essai du contrat signé | Essai prévu par le contrat, en jours. Il reste distinct du POC avant signature. Visible dans Ventes, Argent et la case de suivi ESSAI_VALIDE |
| À venir | Dossiers sans centre suivi et centres dont l'installation n'a pas démarré. Les cinq prérequis sont visibles |
| En cours | Un compte Dashboard est relié ou une étape de travail est faite. La désignation du chef de projet, le contact de facturation et la commande EDL seuls ne démarrent pas l'installation |

Les cinq prérequis réutilisent les informations existantes, sans nouvelle saisie
pour un fait déjà connu. Ils ne s'affichent que dans À venir. Les centres
restent détaillés par produit.

| Prérequis | Source et façon de le remplir |
|---|---|
| Téléphonie | Case existante INTERFACAGE_TELEPHONIQUE, ligne branchée et essais cochés. Sans objet pour Konnect et NoShow |
| RIS | RIS du centre, sinon de l'organisation. Renseigner un nom précis sur la fiche. Inconnu et Plusieurs RIS ne suffisent pas |
| Bon de commande EDL reçu | Nouvelle case manuelle BON_COMMANDE_EDL. Commande passée à EDL pour Xplore, distincte de la commande du client. Une attente auprès d'EDL peut être déclarée. Case seule, sans fichier ni lien (décision du 22/11/2026, C-94) |
| Commercial EDL identifié | Commercial RIS déjà saisi dans Apport d'affaires, ou contact de la fiche dont le métier est Commercial EDL. Aucun nom recopié dans une nouvelle case |
| API reçue et testée | Case automatique existante JETON_XPLORE. L'équipe technique configure et teste le jeton. Aucun cochage manuel |

Les deux prérequis EDL sont sans objet pour un autre RIS connu. Un RIS inconnu
ne dispense pas de les vérifier. Un dossier sans centre suivi commence par
ajouter un centre et son produit depuis sa fiche.

## Cycles de POC (C-94, décision du 22/11/2026)

| Terme | Sens |
|---|---|
| Cycle de POC | Un test avant signature, avec ses dates et sa propre prolongation possible une fois. Après une décision de fin, un nouveau test ouvre un nouveau cycle et demande une nouvelle date |
| Reprendre le POC | Revenir directement d'une pause ou d'une sortie générique Perdu survenue pendant le test. Le même cycle continue, avec ses dates et sa prolongation déjà utilisée |
| POC précédent | La ligne courte de la fiche : dates et issue du dernier cycle clos antérieur au cycle affiché |
| POC validé | Le cycle est clos par le passage en Signé via la conversion ou l'acceptation de la proposition |
| Retour au devis | Le test est clos avec l’issue RETOUR_PROPOSITION et le dossier revient en Devis envoyé (PROPOSITION). Un prochain POC aura ses propres dates |
| Retour à la prospection | Le cycle suspendu est clos au retour en Prospect. L'historique conserve ses dates |

Les cycles clos restent dans l'historique. L'organisation conserve le courant
ou le dernier. Un POC non transformé repris ensuite commence un nouveau cycle.
La case de commande EDL reste seule, sans fichier ni lien ; l'emplacement commun
des documents sera choisi plus tard (décision du 22/11/2026).
