/**
 * Les champs de `talk.site` éditables depuis le Dashboard.
 *
 * Ce registre est au domaine `talk.site` ce que `src/lib/completude/talk.ts` est
 * aux exigences : la déclaration unique, lue par l'écran d'administration. Ajouter
 * un champ de `getInitInfo` au Dashboard se fait ICI, et l'écran le rend sans
 * qu'une ligne de formulaire soit écrite.
 *
 * ── DEUX RÈGLES QUE CE FICHIER FAIT RESPECTER ────────────────────────────────
 *
 * 1. **Le nom du champ est celui de `call.site`**, sans traduction. `chemin` est
 *    donc exactement la propriété que le robot alimentera, éventuellement avec
 *    un point pour désigner une sous-clé (`transferOptions.strictRedirect`).
 *
 * 2. **Un objet descendu doit être COMPLET.** La fusion côté robot est une
 *    affectation, pas un `deepMerge` : envoyer `risCode: { info: "A04" }` sans
 *    les types ferait perdre tous les codes sites, donc tous les créneaux. Les
 *    sous-champs d'un même objet sont donc écrits ensemble, ou pas du tout —
 *    `construireValeur` s'en charge, l'écran n'a pas à y penser.
 *
 * ── ABSENT VEUT DIRE « DÉFAUT DU ROBOT » ─────────────────────────────────────
 *
 * Un champ qui n'est pas dans le JSON n'est pas « vide » : le robot garde sa
 * valeur en dur. C'est ce qui rend chaque champ activable et réversible
 * séparément, et c'est pourquoi l'écran propose un interrupteur par champ plutôt
 * qu'un formulaire toujours rempli. `defautRobot` sert à afficher ce qui
 * s'applique quand l'interrupteur est ouvert.
 */

export type TypeChamp =
  | "texte"
  | "texte-long"
  | "booleen"
  | "nombre"
  | "liste"
  /**
   * Structure JSON éditée telle quelle.
   *
   * Assumé, et pas un renoncement : `risCode`, `siteDetails` ou
   * `siteSelectionList` n'ont pas de forme de formulaire évidente, elles se
   * règlent une fois à l'installation, et une saisie guidée fausse serait pire
   * qu'un JSON relu. L'écran valide la syntaxe avant d'enregistrer ; c'est le
   * contenu qui reste à la charge de celui qui saisit.
   */
  | "json";

export type ChampSite = {
  /** Chemin dans `call.site`. Un point désigne une sous-clé d'objet. */
  chemin: string;
  libelle: string;
  type: TypeChamp;
  /** Ce que fait le robot quand le champ n'est pas défini ici. */
  defautRobot: string;
  /** À quoi sert ce réglage, en une phrase. Affiché sous le champ. */
  aide: string;
  /** Qui décide de cette valeur. Oriente l'écran, pas les droits. */
  proprietaire: "client" | "admin";
  /** Bornes, pour un nombre. */
  min?: number;
  max?: number;
};

export type SectionSite = {
  titre: string;
  description: string;
  champs: ChampSite[];
};

export const SECTIONS_SITE: SectionSite[] = [
  {
    titre: "Ce que le robot dit au patient",
    description:
      "Des phrases lues à voix haute. Elles s'entendent, donc elles se relisent à voix haute.",
    champs: [
      {
        chemin: "rdvInstructionSentence",
        libelle: "Consigne de fin de rendez-vous",
        type: "texte-long",
        proprietaire: "client",
        defautRobot:
          "pensez bien à amener votre ordonnance ainsi que la carte vitale, la carte de mutuelle et une pièce d'identité, et si besoin vos justificatif ALD et arrêt de travail.",
        aide: "Dite juste avant de raccrocher, après « c'est noté ». Commencez par un verbe, sans majuscule ni point final : la phrase est enchaînée à la précédente.",
      },
    ],
  },
  {
    titre: "Transfert vers le secrétariat",
    description:
      "Ce que fait le robot quand il ne peut pas traiter la demande lui-même.",
    champs: [
      {
        chemin: "transferOptions.transferForNonBookableExams",
        libelle: "Transférer les examens non réservables",
        type: "booleen",
        proprietaire: "admin",
        defautRobot: "Activé",
        aide: "Quand le patient demande un examen que le centre ne prend pas par téléphone, le robot le passe au secrétariat au lieu de terminer l'appel.",
      },
      {
        chemin: "strictRedirectOptions.strictRedirect",
        libelle: "Redirection stricte",
        type: "booleen",
        proprietaire: "admin",
        defautRobot: "Désactivé",
        aide: "Le robot cesse de proposer d'autres créneaux et transfère dès le premier refus du patient.",
      },
      {
        chemin: "strictRedirectOptions.maxDispoAttempts",
        libelle: "Propositions de créneaux avant transfert",
        type: "nombre",
        proprietaire: "admin",
        min: 1,
        max: 10,
        defautRobot: "3",
        aide: "Nombre de fois où le robot propose d'autres dates avant de passer au secrétariat.",
      },
    ],
  },
  {
    titre: "Langues",
    description:
      "Ce que le robot comprend et parle. Une langue cochée sans ses phrases installées casse l'appel : à ne changer qu'avec l'équipe technique.",
    champs: [
      {
        chemin: "language",
        libelle: "Langue par défaut",
        type: "texte",
        proprietaire: "admin",
        defautRobot: "fr",
        aide: "Code de la langue dans laquelle le robot accueille le patient. « fr » partout aujourd'hui.",
      },
      {
        chemin: "languagesSupported",
        libelle: "Langues supplémentaires acceptées",
        type: "liste",
        proprietaire: "admin",
        defautRobot: "fr",
        aide: "Codes séparés par des virgules, par exemple « fr, it, en ». Le français est toujours inclus. Chaque langue doit avoir ses phrases déployées.",
      },
    ],
  },
  {
    titre: "Codes du logiciel de gestion",
    description:
      "Ce qui relie le robot au logiciel du centre. Une erreur ici ne lève aucune alerte : elle rend simplement les créneaux introuvables. À ne modifier qu'en sachant ce qu'on fait.",
    champs: [
      {
        chemin: "risCode",
        libelle: "Codes sites par type d'examen",
        type: "json",
        proprietaire: "admin",
        defautRobot: "La table du robot",
        aide: "`info` est le code du site principal. Chaque type d'examen (US, RX, MG, CT, MR, OT…) liste les sites où chercher des créneaux, le premier étant le préférentiel. Un type absent n'est pas réservable. Exemple : { \"info\": \"A04\", \"US\": [\"A04\"], \"CT\": [\"A05\"] }",
      },
      {
        chemin: "siteCodeToName",
        libelle: "Nom prononcé de chaque site",
        type: "json",
        proprietaire: "admin",
        defautRobot: "La table du robot",
        aide: "Le nom que le robot dit au patient pour chaque code site. Il est lu à voix haute : écrire comme cela se prononce. Exemple : { \"A04\": \"Imagerie Médicale Cognac\" }",
      },
      {
        chemin: "siteDetails",
        libelle: "Fiches des sites secondaires",
        type: "json",
        proprietaire: "admin",
        defautRobot: "La table du robot",
        aide: "Adresse et téléphone de chaque site AUTRE que le principal, pour les convocations. Une fiche saisie ici pour le site principal serait ignorée : elle vient des Paramètres généraux du centre.",
      },
      {
        chemin: "siteSelectionList",
        libelle: "Centres proposés au patient",
        type: "json",
        proprietaire: "admin",
        defautRobot: "Aucun choix proposé",
        aide: "Quand le robot demande au patient dans quel centre il veut son rendez-vous. L'ordre est celui de l'énoncé. Exemple : [{ \"id\": \"PQS\", \"nom\": \"Quimper\", \"userProductId\": 18 }]",
      },
    ],
  },
  {
    titre: "Où le robot renvoie le patient",
    description:
      "Les numéros que le robot compose ou dicte. Un numéro faux s'entend, mais seulement chez le patient.",
    champs: [
      {
        chemin: "transferNumber",
        libelle: "Secrétariat",
        type: "json",
        proprietaire: "client",
        defautRobot: "La table du robot",
        aide: "Numéros essayés dans l'ordre quand le robot passe la main. Exemple : [{ \"phone\": \"+33586870092\", \"label\": \"Cognac\" }]",
      },
      {
        chemin: "examTypeRedirection",
        libelle: "Redirection par type d'examen",
        type: "json",
        proprietaire: "client",
        defautRobot: "Aucune, tout va au secrétariat",
        aide: "Un numéro dédié pour certains examens. Exemple : { \"MR\": [{ \"phone\": \"+33545356891\", \"label\": \"Centre IRM\" }] }",
      },
      {
        chemin: "transferFallbacks",
        libelle: "Repli sur des horaires",
        type: "json",
        proprietaire: "client",
        defautRobot: "Aucun repli",
        aide: "Un autre numéro sur des créneaux précis, quand le secrétariat habituel est fermé. `days` va de 0 (dimanche) à 6 (samedi).",
      },
      {
        chemin: "transferFallbackMessage",
        libelle: "Phrase ajoutée au transfert",
        type: "texte-long",
        proprietaire: "client",
        defautRobot: "Aucune",
        aide: "Ajoutée à toutes les phrases de transfert, par exemple pour donner un second numéro. Elle est lue à voix haute : écrire les chiffres en toutes lettres.",
      },
    ],
  },
  {
    titre: "Étapes du parcours",
    description:
      "Ce que le robot demande au patient, et dans quel ordre. Chaque étape allonge l'appel : ne garder que ce dont le centre a besoin.",
    champs: [
      {
        chemin: "statePerformed",
        libelle: "Étapes activées",
        type: "json",
        proprietaire: "client",
        defautRobot: "La table du robot",
        aide: "adultCheck, identification_full, organEchoConstraints, siteSelection, phoneLookupEnabled, spell_confirm_new_patient. Attention : motif, questions et menstruations ne se règlent PAS ici, elles viennent des Paramètres généraux du centre et écrasent ce qui serait saisi.",
      },
      {
        chemin: "askRadiologueChoice",
        libelle: "Choix du radiologue",
        type: "json",
        proprietaire: "client",
        defautRobot: "Jamais demandé",
        aide: "Par type d'examen. Exemple : { \"MG\": true, \"US\": false }",
      },
      {
        chemin: "infoNewPatient",
        libelle: "Informations demandées à un nouveau patient",
        type: "json",
        proprietaire: "client",
        defautRobot: "Rien de plus",
        aide: "{ \"enabled\": true, \"adresse\": false, \"poids\": false, \"taille\": false }. N'agit que pour un dossier inconnu du logiciel.",
      },
      {
        chemin: "specialMedecins",
        libelle: "Médecins particuliers",
        type: "json",
        proprietaire: "admin",
        defautRobot: "Aucun",
        aide: "Une phrase d'avertissement quand le rendez-vous concerne certains praticiens. { \"enabled\": true, \"codesMedecins\": [\"BENATE\"], \"doctorName\": \"BENATTAR\", \"sentence\": \"special_medecin_warning\" }",
      },
    ],
  },
];

/** Tous les champs, à plat. */
export const CHAMPS_SITE: ChampSite[] = SECTIONS_SITE.flatMap((s) => s.champs);

/** La racine d'un chemin : `transferOptions.strictRedirect` → `transferOptions`. */
export function racine(chemin: string): string {
  return chemin.split(".")[0];
}

/** La sous-clé, ou `null` si le champ est à la racine. */
export function sousCle(chemin: string): string | null {
  const p = chemin.split(".");
  return p.length > 1 ? p.slice(1).join(".") : null;
}

/** Lit la valeur d'un chemin dans le JSON stocké. `undefined` si absente. */
export function lireChemin(
  valeur: Record<string, any> | null,
  chemin: string
): unknown {
  if (!valeur) return undefined;
  const r = racine(chemin);
  const sc = sousCle(chemin);
  if (!sc) return valeur[r];
  const obj = valeur[r];
  return obj && typeof obj === "object" ? obj[sc] : undefined;
}

/**
 * Reconstruit le JSON complet à partir des champs actifs de l'écran.
 *
 * **C'est ici que la règle de l'objet complet est tenue.** Un objet n'est écrit
 * que si au moins un de ses sous-champs est actif, et il est alors rempli avec
 * TOUS ses sous-champs déclarés : ceux que l'utilisateur n'a pas activés
 * reçoivent le défaut du robot, converti au bon type. Sans cela, activer le seul
 * `maxDispoAttempts` produirait `{ maxDispoAttempts: 5 }`, et le robot perdrait
 * `strictRedirect` en écrasant son objet.
 */
export function construireValeur(
  actifs: Record<string, boolean>,
  saisies: Record<string, unknown>
): Record<string, unknown> {
  const sortie: Record<string, unknown> = {};

  for (const champ of CHAMPS_SITE) {
    if (!actifs[champ.chemin]) continue;
    const r = racine(champ.chemin);
    const sc = sousCle(champ.chemin);

    if (!sc) {
      sortie[r] = saisies[champ.chemin];
      continue;
    }

    // Objet : on le remplit en entier, avec les défauts pour les sous-champs
    // laissés au robot.
    if (!sortie[r] || typeof sortie[r] !== "object") sortie[r] = {};
    const obj = sortie[r] as Record<string, unknown>;
    for (const frere of CHAMPS_SITE) {
      if (racine(frere.chemin) !== r) continue;
      const fsc = sousCle(frere.chemin);
      if (!fsc) continue;
      obj[fsc] = actifs[frere.chemin]
        ? saisies[frere.chemin]
        : defautTypé(frere);
    }
  }

  return sortie;
}

/** Le défaut du robot, converti dans le type du champ. */
function defautTypé(champ: ChampSite): unknown {
  switch (champ.type) {
    case "booleen":
      return champ.defautRobot.toLowerCase().startsWith("activ");
    case "nombre":
      return Number(champ.defautRobot);
    case "liste":
      return champ.defautRobot.split(",").map((v) => v.trim()).filter(Boolean);
    case "json":
      // Un objet JSON n'a pas de défaut représentable en texte : le champ n'est
      // écrit que s'il est explicitement activé, jamais rempli par défaut.
      return undefined;
    default:
      return champ.defautRobot;
  }
}
