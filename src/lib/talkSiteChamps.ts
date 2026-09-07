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

export type TypeChamp = "texte" | "texte-long" | "booleen" | "nombre" | "liste";

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
    default:
      return champ.defautRobot;
  }
}
