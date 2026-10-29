import type { EtapePremiersPas } from "./index";

/**
 * Les quatre premiers pas d'un client LyraeTalk, dans l'ordre où il les fait.
 *
 * Choisis par Enzo le 29/10/2026 : l'essentiel pour que le robot puisse répondre, et
 * rien d'autre. Les clés de complétude sont celles de `src/lib/completude/talk.ts`,
 * toutes à la main du client (un manque « admin » ne descend pas jusqu'à lui, il ne
 * pourrait donc jamais cocher l'étape).
 *
 * Les étapes 1 et 2 partagent leur verdict : la 2 est la façon de faire la 1, et Enzo
 * les veut séparées pour que le classeur ne passe pas inaperçu.
 */
export const ETAPES_TALK: EtapePremiersPas[] = [
  {
    cle: "talk.correspondance",
    titre: "Indiquez les examens que vous faites",
    texte:
      "Pour chaque examen, cochez s'il est pratiqué chez vous et donnez son code dans votre logiciel de gestion. Sans code, le robot ne peut pas réserver.",
    consigne:
      "Cochez les examens que votre centre pratique, puis saisissez leur code dans votre logiciel de gestion.",
    chemin: "parametrage/mapping_exam",
    ancre: "correspondance_examens",
    completude: ["talk.examens-acceptes", "talk.codes-examens"],
  },
  {
    cle: "talk.classeur",
    titre: "Remplissez la liste dans Excel",
    texte:
      "Plus rapide qu'à l'écran : téléchargez le tableau, complétez-le, puis importez-le. Les lignes arrivent à l'écran, vous les relisez avant d'enregistrer.",
    consigne:
      "Cliquez sur « Télécharger le tableau », remplissez les codes dans Excel, puis « Importer un fichier ». Les lignes arrivent à l'écran : relisez-les, puis cliquez sur Enregistrer.",
    chemin: "parametrage/mapping_exam",
    ancre: "classeur_examens",
    completude: ["talk.examens-acceptes", "talk.codes-examens"],
  },
  {
    cle: "talk.reglages",
    titre: "Renseignez votre centre",
    texte:
      "Le nom, l'adresse et le téléphone du centre, le numéro du secrétariat, ce que dit le robot quand le planning est complet, et son message d'accueil.",
    consigne:
      "Vérifiez le nom, l'adresse et le téléphone du centre, le numéro du secrétariat et le message d'accueil. Plus bas, la section « Planning rempli » dit quoi faire quand il n'y a plus de créneau.",
    chemin: "parametrage",
    ancre: "preferences_generales",
    completude: [
      "talk.secretariat",
      "talk.fiche-identite",
      "talk.fiche-telephone",
      "talk.redirections",
    ],
  },
  {
    cle: "talk.doubles",
    titre: "Choisissez comment prendre deux examens",
    texte:
      "Quand un patient demande deux examens dans le même appel, le robot pose un seul rendez-vous ou deux. Vous choisissez, combinaison par combinaison.",
    consigne:
      "Activez les combinaisons de deux examens que vous prenez ensemble. Pour chacune, choisissez un seul rendez-vous (le second examen dans le commentaire) ou deux rendez-vous distincts.",
    chemin: "parametrage",
    ancre: "doubles_examens",
    completude: [],
  },
];
