import { PAGES } from "@/lib/permissions";
import type { Chapitre } from "./types";

/**
 * Les chapitres du tutoriel LyraeTalk, dans l'ordre de la liste (validés par Enzo le
 * 30/10/2026). Les textes sont à compléter avec lui chapitre par chapitre.
 *
 * Règles des textes (CLAUDE.md, « Ton des textes affichés ») : phrases courtes, on dit
 * quoi faire, aucun tiret cadratin, « votre logiciel de gestion » et jamais « le RIS ».
 *
 * Les cibles sont les ancres de la recherche centrale, plus celles posées pour le
 * tutoriel : `tuto_menu`, `tuto_recherche`, `tuto_profil`, `outils_mapping`, `col_*`.
 */
export const CHAPITRES_TALK: Chapitre[] = [
  {
    cle: "reperes",
    titre: "Bienvenue et repères",
    resume: "Le menu, la barre de recherche, et où retrouver ce tutoriel.",
    page: null,
    etapes: [
      {
        chemin: "",
        titre: "Bienvenue sur votre espace LyraeTalk",
        texte:
          "Ce tutoriel vous montre où tout se trouve et à quoi ça sert. Comptez quelques minutes. Vous pourrez le rouvrir quand vous voulez, chapitre par chapitre.",
      },
      {
        cible: "#tuto_menu",
        titre: "Le menu",
        texte:
          "Tous les écrans sont ici. En haut, le paramétrage du robot : la correspondance des examens, les paramètres, les questions des patients. En dessous, le suivi des appels et les statistiques. Tout en bas, le support.",
      },
      {
        cible: "#tuto_recherche",
        titre: "La barre de recherche",
        texte:
          "Écrivez ou dictez ce que vous cherchez, comme vous le diriez à un collègue : « modifier les horaires », « les rendez-vous pris hier », « l'ordonnance de Mme Martin ». Elle ouvre directement le bon écran, déjà filtré, et entoure le champ voulu. Raccourci : Ctrl+K.",
      },
      {
        cible: "#appels_aujourd_hui",
        titre: "La vue d'ensemble",
        texte:
          "L'accueil résume les dernières 24 heures : appels reçus, rendez-vous pris, transferts au secrétariat.",
      },
      {
        cible: "#premiers_pas",
        titre: "Votre tutoriel",
        texte:
          "Cette carte liste les chapitres du tutoriel et ce qu'il reste à faire. Commencez par la correspondance des examens : sans elle, le robot ne peut rien réserver.",
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
    cle: "correspondance",
    titre: "Correspondance des examens",
    resume:
      "Le code de chaque examen dans votre logiciel de gestion. L'étape la plus importante.",
    page: PAGES.MAPPING_EXAM,
    completude: ["talk.examens-acceptes", "talk.codes-examens"],
    primordial: true,
    etapes: [
      {
        chemin: "parametrage/mapping_exam",
        titre: "La correspondance des examens",
        texte: (etat) =>
          etat === "a_verifier"
            ? "Votre liste est déjà remplie, par vous ou par notre équipe à partir de vos documents. Prenez quelques minutes pour la relire : un code faux, et le robot propose un examen qu'il ne sait pas réserver."
            : "C'est l'étape la plus importante. Le robot ne réserve un examen que s'il connaît son code dans votre logiciel de gestion. Tant que cette liste n'est pas remplie, il ne prend aucun rendez-vous.",
      },
      {
        cible: "#outils_mapping",
        titre: "Chercher et filtrer",
        texte:
          "Cherchez un examen par son nom ou son code. Les filtres affichent par exemple les examens sans code : c'est ce qu'il vous reste à remplir.",
      },
      {
        cible: "#col_attribue",
        titre: "Attribué à Lyrae",
        texte:
          "Cochée : le robot propose cet examen au téléphone. Décochée : il ne le propose pas, et passe le patient au secrétariat.",
      },
      {
        cible: "#col_examen",
        titre: "Examen",
        texte:
          "Notre nom de l'examen, celui que le robot reconnaît quand le patient le demande. Vous n'avez rien à y changer.",
      },
      {
        cible: "#col_code",
        titre: "Code et libellé patient",
        texte:
          "Le code de l'examen dans votre logiciel de gestion : c'est lui qui permet de réserver. En dessous, le nom que le robot annonce au patient, si vous voulez le dire autrement.",
      },
      {
        cible: "#col_type",
        titre: "Type",
        texte: "Le type d'examen dans votre logiciel de gestion. Facultatif.",
      },
      {
        cible: "#col_injecte",
        titre: "Injecté",
        texte:
          "Pour les scanners et les IRM : cochez si l'examen se fait aussi avec produit de contraste, et saisissez le code de cette version.",
      },
      {
        cible: "#col_horaire",
        titre: "Créneau horaire",
        texte:
          "Une consigne d'horaire que le robot annonce avec le créneau proposé.",
      },
      {
        cible: "#col_salles",
        titre: "Salles",
        texte:
          "Les salles où se fait l'examen. Le robot ne cherche des créneaux que dans celles-ci. Si vous n'en choisissez aucune, il cherche dans toutes les salles du type.",
      },
      {
        cible: "#classeur_examens",
        titre: "Remplir dans Excel",
        texte:
          "Plus rapide pour une longue liste : cliquez sur « Télécharger le tableau », remplissez les codes dans Excel, puis « Importer un fichier ». Les lignes arrivent à l'écran.",
      },
      {
        titre: "Enregistrer",
        texte:
          "Rien n'est pris en compte avant d'avoir cliqué sur « Enregistrer », dans la barre en bas de l'écran. Le robot utilise la nouvelle liste au prochain appel.",
      },
    ],
  },

  {
    cle: "parametres",
    titre: "Paramètres généraux",
    resume:
      "Ce que le robot dit de votre centre, vos horaires, et ce qu'il fait quand le planning est plein.",
    page: PAGES.PARAMETRAGE,
    completude: [
      "talk.fiche-identite",
      "talk.fiche-telephone",
      "talk.redirections",
    ],
    etapes: [
      {
        chemin: "parametrage",
        cible: "#preferences_generales",
        titre: "Préférences générales",
        texte: (etat) =>
          (etat === "a_faire" ? "Il manque des informations ici. " : "") +
          "Le nom, l'adresse et le téléphone du centre, et le message d'accueil : c'est ce que le robot dit au patient. Vérifiez-les en premier.",
      },
      {
        cible: "#horaires",
        titre: "Horaires",
        texte:
          "Vos horaires d'ouverture. Le robot les donne au patient qui les demande.",
      },
      {
        cible: "#planning_rempli",
        titre: "Planning rempli",
        texte:
          "Ce que fait le robot quand il n'y a plus de créneau pour un examen : terminer l'appel avec un message, ou passer le patient au secrétariat.",
      },
      {
        cible: "#examens_acceptes",
        titre: "Examens acceptés",
        texte:
          "Les types d'examen que le robot prend en charge. Un type décoché est passé au secrétariat.",
      },
      {
        cible: "#options_questions",
        titre: "Ce que le robot demande",
        texte:
          "Les informations que le robot demande au patient, par exemple le motif inscrit sur l'ordonnance.",
      },
      {
        cible: "#doubles_examens",
        titre: "Doubles examens",
        texte:
          "Quand un patient demande deux examens dans le même appel : un seul rendez-vous ou deux, combinaison par combinaison.",
      },
      {
        cible: "#desactiver",
        titre: "Désactiver le service",
        texte:
          "En cas de besoin, le robot passe tous les appels au secrétariat sans rien traiter. Pensez à le réactiver ensuite.",
      },
      {
        titre: "Enregistrer",
        texte:
          "N'oubliez pas d'enregistrer en bas de l'écran : le robot applique vos réglages au prochain appel.",
      },
    ],
  },

  {
    cle: "questions_frequentes",
    titre: "Questions fréquentes",
    resume:
      "Les réponses du robot aux questions des patients : accès, parking, préparation…",
    page: PAGES.INFORMATIONNEL,
    completude: ["talk.faq"],
    primordial: true,
    etapes: [
      {
        chemin: "informationnel",
        titre: "Les questions des patients",
        texte: (etat) =>
          etat === "a_verifier"
            ? "Vos réponses sont déjà en place. Relisez-les : le robot les dit telles quelles au téléphone."
            : "C'est la deuxième étape importante. Le robot répond aux questions des patients (accès, parking, préparation, documents à apporter) avec ces réponses. Sans elles, il ne sait répondre à aucune question.",
      },
      {
        titre: "Écrire une réponse",
        texte:
          "Ouvrez une question pour modifier sa réponse, ou ajoutez-en une. Écrivez comme vous parleriez au patient au téléphone.",
      },
    ],
  },

  {
    cle: "questions_examen",
    titre: "Questions par examen",
    resume:
      "Les questions posées au patient avant de réserver certains examens.",
    page: PAGES.QUESTIONS_EXAM,
    etapes: [
      {
        chemin: "parametrage/questions_exam",
        titre: "Les questions par examen",
        texte:
          "Les questions que le robot pose au patient avant de réserver un examen. Vous les ajustez examen par examen.",
      },
    ],
  },

  {
    cle: "sms",
    titre: "SMS et documents",
    resume:
      "Confirmation, relance la veille, dépôt d'ordonnance, documents demandés.",
    page: PAGES.PARAMETRAGE,
    etapes: [
      {
        chemin: "parametrage",
        cible: "#apres_reservation",
        titre: "Après la réservation",
        texte:
          "La consigne que le robot donne au patient une fois le rendez-vous pris.",
      },
      {
        cible: "#confirmation_sms",
        titre: "SMS de confirmation",
        texte:
          "Le SMS envoyé au patient juste après la prise de rendez-vous : date, heure, adresse, consigne.",
      },
      {
        cible: "#rappel_sms",
        titre: "Relance la veille",
        texte:
          "Un SMS la veille du rendez-vous. Le patient confirme ou annule, ce qui libère le créneau. Les résultats sont dans « Rendez-vous non honorés ».",
      },
      {
        cible: "#depot_ordonnance",
        titre: "Dépôt d'ordonnance",
        texte:
          "Le patient reçoit un lien pour envoyer son ordonnance avant l'examen. Vous la retrouvez dans « Ordonnances manquantes ».",
      },
      {
        cible: "#documents_demandes",
        titre: "Documents demandés",
        texte:
          "Les documents et questionnaires demandés au patient avant certains examens, par le même lien.",
      },
    ],
  },

  {
    cle: "suivi",
    titre: "Le suivi au quotidien",
    resume: "Les appels, les ordonnances à récupérer, les incidents signalés.",
    page: PAGES.CALLS,
    etapes: [
      {
        chemin: "calls",
        titre: "La liste des appels",
        texte:
          "Tous les appels reçus par le robot, du plus récent au plus ancien. Ouvrez un appel pour lire la conversation et voir ce qu'il a fait. Les filtres trouvent un patient, un examen ou une période.",
      },
      {
        chemin: "ordonnances-manquantes",
        cible: "#en_attente",
        page: PAGES.ORDONNANCES,
        titre: "Ordonnances manquantes",
        texte:
          "Les patients qui n'ont pas encore envoyé leur ordonnance. Notez votre suivi : contacté, injoignable.",
      },
      {
        chemin: "incidents",
        page: PAGES.INCIDENTS,
        titre: "Incidents signalés",
        texte:
          "Les appels que vous nous avez signalés comme mal traités. Signalez-en un depuis la liste des appels : notre équipe le corrige.",
      },
    ],
  },

  {
    cle: "statistiques",
    titre: "Les statistiques",
    resume:
      "Les chiffres du robot, les examens sans créneau, les rendez-vous non honorés.",
    page: PAGES.STATS_APPEL,
    etapes: [
      {
        chemin: "stats_appel",
        cible: "#total_appels",
        titre: "Statistiques d'appels",
        texte:
          "Les chiffres du robot sur la période de votre choix : appels, rendez-vous pris, transferts, annulations. Vous n'avez rien à y remplir.",
      },
      {
        cible: "#transferts",
        titre: "Transferts",
        texte: "Les appels passés au secrétariat, avec leur motif.",
      },
      {
        chemin: "planning-complet",
        cible: "#planning_complet",
        page: PAGES.PLANNING_COMPLET,
        titre: "Examens non couverts",
        texte:
          "Les examens demandés pour lesquels il n'y avait plus de créneau, ou que le robot ne prend pas : de quoi ajuster vos plannings.",
      },
      {
        chemin: "stats-no-show",
        cible: "#sms_envoyes",
        page: PAGES.STATS_NO_SHOW,
        titre: "Rendez-vous non honorés",
        texte:
          "Les SMS de relance envoyés la veille, et ce qu'ils ont donné : confirmations, annulations.",
      },
    ],
  },

  {
    cle: "support",
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
