import { PAGES } from "@/lib/permissions";
import type { Chapitre } from "./types";

/**
 * Les chapitres du tutoriel LyraeKonnect (demandé par Enzo le 30/10/2026, « la même
 * chose pour un client Konnect »). Le fond vient du guide de paramétrage envoyé à Menton
 * le 28/10 (`livrables/konnect/guide-parametrage/`), dans le même ordre : l'indispensable,
 * le quotidien, l'activité, pour aller plus loin.
 *
 * Clés préfixées `konnect_` : l'état « chapitres vus » est commun aux deux produits d'un
 * même utilisateur, les clés ne doivent pas se croiser avec celles de Talk.
 *
 * Le catalogue d'examens est un manque « admin » (décision du 09/09) : son état arrive au
 * tutoriel par le champ `tutoriel` de `/api/completude`, jamais par le bandeau.
 */
export const CHAPITRES_KONNECT: Chapitre[] = [
  {
    cle: "konnect_reperes",
    titre: "Bienvenue et repères",
    resume:
      "Le menu, la barre de recherche, vos plannings dans Xplore, et où retrouver ce tutoriel.",
    page: null,
    etapes: [
      {
        chemin: "",
        titre: "Bienvenue sur votre espace Konnect",
        texte:
          "Konnect est votre portail de prise de rendez-vous en ligne. Il lit vos créneaux dans Xplore et y enregistre les rendez-vous. Tout ce que le patient voit et peut faire se règle ici. Ce tutoriel vous montre où, en quelques minutes.",
      },
      {
        titre: "Vos plannings dans Xplore",
        texte:
          "Konnect ne crée aucun créneau : il propose ceux que Xplore ouvre à la prise de rendez-vous en ligne. Un planning vide ou fermé, c'est un examen que le patient ne peut pas réserver. Ouvrez vos plannings sur plusieurs semaines, pour chaque type d'examen à proposer.",
      },
      {
        cible: "#tuto_menu",
        titre: "Le menu",
        texte:
          "En haut, la configuration du portail : la correspondance des examens, les paramètres, les sites. En dessous, ce que vous traitez au quotidien : les demandes de rappel, la liste d'attente, les questionnaires. Puis les statistiques, et le support.",
      },
      {
        cible: "#tuto_recherche",
        titre: "La barre de recherche",
        texte:
          "Écrivez ou dictez ce que vous cherchez, comme vous le diriez à un collègue : « le téléphone du secrétariat », « les demandes de rappel en attente », « ouvrir la liste d'attente pour l'IRM ». Elle ouvre directement le bon écran et entoure le champ voulu. Raccourci : Ctrl+K.",
      },
      {
        cible: "#premiers_pas",
        titre: "Votre tutoriel",
        texte:
          "Cette carte liste les chapitres du tutoriel et ce qu'il reste à faire. Commencez par la correspondance des examens : un examen sans code n'est jamais proposé au patient.",
      },
      {
        cible: "#tuto_profil",
        titre: "Revoir le tutoriel",
        texte:
          "À tout moment, cliquez ici puis sur « Tutoriel », et choisissez le chapitre qui vous intéresse.",
      },
    ],
  },

  {
    cle: "konnect_correspondance",
    titre: "Correspondance des examens",
    resume:
      "Le code de chaque examen dans Xplore, et comment il se réserve. La page la plus importante.",
    page: PAGES.KONNECT_EXAMENS,
    completude: ["konnect.examens", "konnect.examens-reservables"],
    primordial: true,
    etapes: [
      {
        chemin: "examens",
        titre: "La correspondance des examens",
        texte: (etat) =>
          etat === "a_verifier"
            ? "C'est la page la plus importante, et elle est déjà remplie, par vous ou par notre équipe. Relisez-la type par type : un examen sans code n'est jamais proposé au patient, un code faux réserve le mauvais examen."
            : "C'est la page la plus importante. À gauche, notre liste d'examens ; à droite, le code de chacun dans Xplore. Tant qu'aucun examen n'a de code, le portail ne reconnaît aucune demande de patient.",
      },
      {
        cible: "#outils_mapping",
        titre: "Chercher et filtrer",
        texte:
          "Parcourez la liste type par type avec le filtre « Type ». Le filtre « Chemin » montre d'un coup ce qui part en demande de rappel.",
      },
      {
        cible: "#col_pratique",
        titre: "Pratiqué",
        texte:
          "L'examen est fait au centre. Décoché, le portail ne le propose pas.",
      },
      {
        cible: "#col_examen",
        titre: "Examen",
        texte:
          "Notre nom de l'examen, celui que le patient cherche. Vous n'avez rien à y changer.",
      },
      {
        cible: "#col_code",
        titre: "Code et libellé patient",
        texte:
          "Le code de l'examen dans Xplore, obligatoire. Le libellé est facultatif : vide, le patient lit notre libellé. Un même code utilisé deux fois est signalé.",
      },
      {
        cible: "#col_type",
        titre: "Type",
        texte: "Le type d'examen dans Xplore. Facultatif.",
      },
      {
        cible: "#col_injecte",
        titre: "Injecté",
        texte:
          "L'examen existe aussi avec injection : cochez et donnez le code de cette version. Le patient répond alors aux questions sur l'injection.",
      },
      {
        cible: "#col_salles",
        titre: "Salles",
        texte:
          "Pour réserver cet examen dans certaines salles seulement. Rien de choisi : toutes les salles ouvertes au portail.",
      },
      {
        cible: "#col_reservable",
        titre: "Réservable en ligne",
        texte:
          "Coché, le patient choisit son créneau et réserve seul. Décoché, il laisse ses coordonnées et vous le rappelez.",
      },
      {
        cible: "#col_attente",
        titre: "File d'attente",
        texte:
          "Pour un examen réservable en ligne. Quand il n'a plus aucun créneau, le patient s'inscrit sur la liste d'attente au lieu de laisser une demande de rappel, et reçoit par SMS la première place qui se libère.",
      },
      {
        cible: "#classeur_examens",
        titre: "Réviser dans Excel",
        texte:
          "Pour une révision en masse : « Télécharger le tableau » donne un fichier à modifier, puis « Importer un fichier » le reprend. Les lignes arrivent à l'écran.",
      },
      {
        titre: "Enregistrer",
        texte:
          "Rien n'est pris en compte avant d'avoir cliqué sur « Enregistrer », en bas de l'écran. Une modification enregistrée s'applique sur le portail dans la minute.",
      },
    ],
  },

  {
    cle: "konnect_parametres",
    titre: "Paramètres du portail",
    resume:
      "Téléphone du secrétariat, consignes, logo, notifications, planning complet, ordonnance.",
    page: PAGES.KONNECT_PARAMETRAGE,
    completude: ["konnect.telephone-secretariat", "konnect.parametres"],
    etapes: [
      {
        chemin: "parametrage",
        cible: "#identite",
        titre: "Identité du centre",
        texte: (etat) =>
          (etat === "a_faire" ? "Il manque des informations ici. " : "") +
          "Le téléphone du secrétariat est obligatoire : c'est le numéro affiché à un patient qui doit vous appeler. Les consignes générales s'affichent pendant la réservation (accès, stationnement, pièces à apporter). « Couleurs et logo » habille le portail à vos couleurs.",
      },
      {
        cible: "#notifications",
        titre: "Notifications au patient",
        texte:
          "La confirmation part par e-mail quand le patient en donne un, sinon par SMS. Vous choisissez le nom d'expéditeur affiché.",
      },
      {
        cible: "#planning_complet",
        titre: "Planning complet",
        texte:
          "Quand un type d'examen n'a plus aucun créneau en ligne : envoyer une demande de rappel à vos secrétaires, ou afficher un message au patient. Un examen qui a la file d'attente passe avant ce réglage.",
      },
      {
        cible: "#ordonnance_xplore",
        titre: "Ordonnance dans Xplore",
        texte:
          "Les documents déposés par le patient arrivent dans Xplore en pièce jointe. Recopiez le nom de l'ordonnance tel qu'il apparaît dans la liste des pièces jointes de Xplore, sinon le document est rangé sous un autre nom.",
      },
      {
        cible: "#questionnaires_non_remplis",
        titre: "Questionnaires non remplis",
        texte:
          "Le délai au-delà duquel un patient qui n'a pas rempli ses questionnaires apparaît dans « Questionnaires des patients ». 24 heures par défaut.",
      },
      {
        titre: "Enregistrer",
        texte:
          "Chaque page a son bouton d'enregistrement en bas. Une modification s'applique sur le portail dans la minute.",
      },
    ],
  },

  {
    cle: "konnect_sites",
    titre: "Sites",
    resume:
      "Le lieu où le patient se présente, son adresse et son code postal.",
    page: PAGES.KONNECT_SITES,
    completude: ["konnect.sites"],
    etapes: [
      {
        chemin: "sites",
        titre: "Vos sites",
        texte:
          "Le lieu où le patient se présente. L'adresse lui est affichée avant qu'il confirme, et le code postal sert à lui proposer le site le plus proche. Vérifiez le nom tel que le patient doit le lire, l'adresse complète et le code postal.",
      },
    ],
  },

  {
    cle: "konnect_rappels",
    titre: "Demandes de rappel",
    resume:
      "Les patients qui n'ont pas pu réserver seuls et attendent votre appel.",
    page: PAGES.KONNECT_DEMANDES_RAPPEL,
    etapes: [
      {
        chemin: "demandes-rappel",
        titre: "Les demandes de rappel",
        texte:
          "Le portail ne laisse jamais un patient sans solution. Quand il ne peut pas réserver seul, il laisse ses coordonnées et la demande arrive ici. C'est le seul endroit où arrivent ces patients : désignez qui consulte cette page, au moins une fois par demi-journée.",
      },
      {
        titre: "Traiter une demande",
        texte:
          "Le compteur en haut indique les appels à passer ; les contre-indications sont signalées comme urgentes. Une fois le patient appelé, cliquez sur « Rappelé » ou « Sans suite ». La note sert à vos secrétaires, le patient ne la voit jamais.",
      },
    ],
  },

  {
    cle: "konnect_attente",
    titre: "Liste d'attente",
    resume:
      "Les patients inscrits quand un examen n'a plus de créneau, et les places proposées par SMS.",
    page: PAGES.KONNECT_FILE_ATTENTE,
    etapes: [
      {
        chemin: "liste-attente",
        titre: "La liste d'attente",
        texte:
          "Quand un examen avec la file d'attente n'a plus de créneau, le patient s'inscrit ici. Le portail relit vos plannings toutes les 15 minutes, de 8 h à 19 h : dès qu'une place se libère, il l'envoie par SMS au premier inscrit, et à lui seul. Sans réponse, la place passe au suivant.",
      },
      {
        chemin: "parametrage",
        cible: "#liste_attente",
        page: PAGES.KONNECT_PARAMETRAGE,
        titre: "Réserver la place pendant la réponse",
        texte:
          "Site par site, le portail peut créer tout de suite le rendez-vous dans Xplore avec votre caractéristique « liste d'attente ». Avant d'activer, vérifiez que votre outil SMS n'écrit pas au patient quand ce rendez-vous est créé.",
      },
    ],
  },

  {
    cle: "konnect_questionnaires",
    titre: "Questionnaires des patients",
    resume:
      "Les patients qui n'ont pas rempli leurs questionnaires, ou dont une réponse est à vérifier.",
    page: PAGES.KONNECT_QUESTIONNAIRES,
    etapes: [
      {
        chemin: "questionnaires",
        titre: "Les questionnaires des patients",
        texte:
          "Après sa réservation, le patient reçoit un lien vers les questionnaires que vous lui demandez. Cette page liste ceux qui ne les ont pas remplis à temps, et ceux dont une réponse est à vérifier. Une fois le patient contacté, « Marquer traité » le retire de la liste.",
      },
    ],
  },

  {
    cle: "konnect_statistiques",
    titre: "Statistiques et relances",
    resume:
      "Où les patients s'arrêtent dans la réservation, et ce que donnent les SMS de rappel.",
    page: PAGES.KONNECT_STATS,
    etapes: [
      {
        chemin: "statistiques",
        titre: "Les statistiques",
        texte:
          "Où les patients s'arrêtent dans la prise de rendez-vous : combien ont commencé, réservé, abandonné, ou vous ont laissé une demande. Les chiffres arrivent environ toutes les 6 heures, les premiers quelques jours après l'ouverture.",
      },
      {
        cible: "#evolution",
        titre: "L'évolution",
        texte:
          "Les mêmes chiffres jour par jour, pour voir l'effet d'un réglage.",
      },
      {
        chemin: "relances-no-show",
        page: PAGES.KONNECT_RELANCES,
        titre: "Relances no-show",
        texte:
          "Quelques jours avant son rendez-vous, le patient reçoit un SMS pour confirmer ou annuler ; une annulation libère le créneau. Le réglage est commun avec le robot téléphonique : le modifier change aussi les relances des rendez-vous pris par téléphone.",
      },
    ],
  },

  {
    cle: "konnect_avance",
    titre: "Pour aller plus loin",
    resume:
      "Multi examens, ordre d'affichage, mots du cabinet, règles. Pas nécessaire au lancement.",
    page: PAGES.KONNECT_PARAMETRAGE,
    etapes: [
      {
        chemin: "paires-examens",
        page: PAGES.KONNECT_PAIRES,
        titre: "Multi examens",
        texte:
          "Par défaut, un patient qui a deux examens est rappelé. Ici, vous autorisez certaines paires à se réserver en ligne, le même jour et dans le même centre, avec l'ordre et l'attente maximale entre les deux.",
      },
      {
        chemin: "ordre-entonnoir",
        page: PAGES.KONNECT_ENTONNOIR,
        titre: "Ordre de l'entonnoir",
        texte:
          "L'ordre des types d'examen proposés au patient, et ceux à mettre en avant en haut de la liste.",
      },
      {
        chemin: "ordre-creneaux",
        page: PAGES.KONNECT_CRENEAUX,
        titre: "Ordre des créneaux",
        texte:
          "Du plus tôt au plus tard par défaut. Vous pouvez chercher plus loin, regrouper les rendez-vous pour éviter les trous, ou faire remonter les horaires peu choisis.",
      },
      {
        chemin: "mots-cabinet",
        page: PAGES.KONNECT_MOTS,
        titre: "Mots du cabinet",
        texte:
          "Les mots que vos patients tapent et que le portail ne comprend pas seul, avec l'examen à chercher à la place. Par exemple « arthro genou ».",
      },
      {
        chemin: "regles-cliniques",
        page: PAGES.KONNECT_REGLES_CLINIQUES,
        titre: "Règles",
        texte:
          "Affiche au patient la préparation de son examen, prise dans Xplore. Éteinte par défaut : allumez-la si vos consignes de préparation sont à jour dans Xplore.",
      },
      {
        chemin: "parametrage",
        cible: "#securite_clinique",
        titre: "Sécurité clinique",
        texte:
          "Le questionnaire de contre-indications (IRM, injection, grossesse) avant de confirmer. À n'activer qu'après relecture des questions par un radiologue.",
      },
    ],
  },

  {
    cle: "konnect_support",
    titre: "Le support",
    resume: "Une question, un problème : ouvrir un ticket.",
    page: PAGES.TICKETS,
    etapes: [
      {
        chemin: "support",
        titre: "Le support",
        texte:
          "Une question, un problème ? Ouvrez un ticket ici. La cloche en haut à droite vous prévient quand nous répondons.",
      },
    ],
  },
];
