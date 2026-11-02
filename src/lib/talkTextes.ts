/**
 * Textes de confirmation que le client règle lui-même (08/10/2026).
 * Plan : `lyrae/plans/2026-10-confirmation-personnalisable.md`.
 *
 * Domaine `talk.textes` de `ProductConfig`, descendu au robot dans le bloc `site`
 * de `GET /api/configuration` :
 *
 *   {
 *     rdvInstructionSentence?: string,          // consigne dite après la réservation
 *     rdvInstructionParExamen?: { RX?, US?, MG?, CT?, MR? },  // codes robot
 *     smsConfirmationGabarit?: string,          // SMS de confirmation, un seul SMS
 *     smsDepotGabarit?: string,                 // SMS de dépôt d'ordonnance (lot 4)
 *     smsDepotAvantConfirmation?: true,         // dépôt envoyé avant la confirmation
 *     questionsExamen?: { MR?: {…}, CT?: {…} }, // questions IRM et scanner (15/10)
 *     examenFermeAuRobot?: {                    // examens fermés au robot (02/11)
 *       [codeRobot | codeExamen]: { reponse, texte?, telephone? }
 *     },
 *   }
 *
 * Une seule implémentation pour l'écran (aperçu, compteur) et pour la route
 * (validation) : le client ne doit jamais voir un aperçu accepté que le serveur
 * refuse, ni l'inverse.
 *
 * **Recopié côté robot** (`lyraetalk`, aucun package partagé) : la liste des
 * variables, le rendu et la translittération GSM-7 doivent y rester identiques.
 */

import { estNumeroSortant } from "./completude/validateurs";

export const CLE_CONSIGNE ="rdvInstructionSentence";
export const CLE_CONSIGNE_PAR_EXAMEN = "rdvInstructionParExamen";
export const CLE_GABARIT_SMS = "smsConfirmationGabarit";
export const CLE_GABARIT_DEPOT = "smsDepotGabarit";
export const CLE_DEPOT_AVANT = "smsDepotAvantConfirmation";
export const CLE_QUESTIONS = "questionsExamen";
export const CLE_EXAMEN_FERME = "examenFermeAuRobot";

/** Codes robot (jamais les diminutifs), dans l'ordre de l'écran. */
export const EXAMENS_CONSIGNE: {
  code: string;
  libelle: string;
  parle: string;
  court: string;
}[] = [
  { code: "RX", libelle: "Radiographie", parle: "la radio", court: "radio" },
  {
    code: "US",
    libelle: "Échographie",
    parle: "l'échographie",
    court: "échographie",
  },
  {
    code: "MG",
    libelle: "Mammographie",
    parle: "la mammographie",
    court: "mammographie",
  },
  { code: "CT", libelle: "Scanner", parle: "le scanner", court: "scanner" },
  { code: "MR", libelle: "IRM", parle: "l'IRM", court: "IRM" },
];
const CODES_EXAMEN = EXAMENS_CONSIGNE.map((e) => e.code);

export type VariableTexte = { nom: string; aide: string };

export const VARIABLES_CONSIGNE: VariableTexte[] = [
  { nom: "examen", aide: "l'IRM, le scanner, la radio…" },
  { nom: "centre", aide: "nom du centre" },
];

export const VARIABLES_SMS: VariableTexte[] = [
  {
    nom: "rendez_vous",
    aide: "RDV IRM lundi 21/07 à 11h30 (une ligne par rendez-vous)",
  },
  { nom: "examen", aide: "IRM, scanner, radio…" },
  { nom: "date", aide: "lundi 21/07" },
  { nom: "heure", aide: "11h30" },
  { nom: "centre", aide: "nom du centre" },
  { nom: "adresse", aide: "adresse du centre" },
  { nom: "prenom", aide: "prénom du patient" },
  { nom: "nom", aide: "nom du patient" },
];

/**
 * SMS de dépôt d'ordonnance (lot 4). Un SMS par rendez-vous concerné : les
 * variables d'examen, de date et d'heure sont celles de ce rendez-vous.
 * `{lien}` et `{code}` sont obligatoires, sans eux le patient ne peut pas
 * déposer son ordonnance.
 */
export const VARIABLES_DEPOT: VariableTexte[] = [
  { nom: "lien", aide: "lien de dépôt (obligatoire)" },
  { nom: "code", aide: "code à saisir sur la page de dépôt (obligatoire)" },
  { nom: "delai", aide: "délai pour déposer : 48h" },
  { nom: "examen", aide: "IRM, scanner, radio…" },
  { nom: "date", aide: "lundi 21/07" },
  { nom: "heure", aide: "11h30" },
  { nom: "centre", aide: "nom du centre" },
  { nom: "prenom", aide: "prénom du patient" },
  { nom: "nom", aide: "nom du patient" },
];
const VARIABLES_DEPOT_OBLIGATOIRES = ["lien", "code"];

export const MAX_CONSIGNE = 500;
export const MAX_SMS = 160;

/** Ce que le robot dit quand le centre n'a rien réglé (`Call.js`). */
export const CONSIGNE_STANDARD =
  "pensez bien à amener votre ordonnance ainsi que la carte vitale, la carte de mutuelle et une pièce d'identité, et si besoin vos justificatif ALD et arrêt de travail.";

/** `SMS.confirmation_single` du robot, écrit avec les variables de l'écran. */
export const SMS_STANDARD =
  "Bonjour,\n{rendez_vous}\n{centre}\n{adresse}\nPour toute modification, contactez votre centre";

/** `SMS.prescription_block` du robot, écrit avec les variables de l'écran. */
export const SMS_DEPOT_STANDARD =
  "Ordonnance à déposer sous {delai}, sinon le RDV risque une annulation :\n{lien}\nCode : {code}";

/**
 * Début de l'annonce, fixe, pour l'aperçu de la phrase entière. Depuis le 09/10/2026
 * le robot n'ajoute plus « Le jour de l'examen » : la consigne ouvre sa phrase.
 */
export const DEBUT_ANNONCE_EXEMPLE =
  "Parfait, je vous confirme que votre rendez-vous est bien enregistré mardi 14 octobre à 10 heures au nom de Martin. ";

// ─── Gabarits ────────────────────────────────────────────────────────────────

/**
 * Vérifie les accolades d'un gabarit. Rend un message lisible par le client, ou
 * `null` si le gabarit est bon.
 */
export function erreurGabarit(
  texte: string,
  variables: VariableTexte[],
): string | null {
  const permises = variables.map((v) => v.nom);
  const inconnues: string[] = [];
  for (const m of texte.matchAll(/\{([^{}]*)\}/g)) {
    if (!permises.includes(m[1])) inconnues.push(`{${m[1]}}`);
  }
  const liste = permises.map((p) => `{${p}}`).join(", ");
  if (inconnues.length > 0) {
    const debut =
      inconnues.length === 1
        ? `La variable ${inconnues[0]} n'existe pas.`
        : `Les variables ${inconnues.join(", ")} n'existent pas.`;
    return `${debut} Variables possibles : ${liste}.`;
  }
  const reste = texte.replace(/\{[^{}]*\}/g, "");
  if (/[{}]/.test(reste)) {
    return `Une accolade est ouverte ou fermée sans variable. Utilisez seulement ${liste}.`;
  }
  return null;
}

function remplacer(texte: string, valeurs: Record<string, string>): string {
  return texte.replace(/\{([^{}]*)\}/g, (tout, nom) =>
    nom in valeurs ? valeurs[nom] : tout,
  );
}

/**
 * Consigne orale rendue, telle que le robot la dira après la date et le nom : une
 * phrase à elle, la majuscule remise comme le fait `annonceDeLaConsigne` du robot.
 */
export function rendreConsigne(
  texte: string,
  valeurs: { examen: string; centre: string },
): string {
  const rendu = remplacer(texte, valeurs)
    .replace(/\s{2,}/g, " ")
    .trim();
  return rendu ? rendu[0].toUpperCase() + rendu.slice(1) : rendu;
}

export type RdvSms = { examen: string; date: string; heure: string };

export type DonneesSms = {
  rdvs: RdvSms[];
  centre: string;
  adresse: string;
  prenom: string;
  nom: string;
};

/**
 * Le SMS tel que le patient le reçoit : variables remplacées, lignes vides
 * retirées (`cleanSmsContent` du robot), texte ramené au jeu GSM-7.
 */
export function rendreSms(gabarit: string, d: DonneesSms): string {
  const premier = d.rdvs[0] ?? { examen: "", date: "", heure: "" };
  const brut = remplacer(gabarit, {
    rendez_vous: d.rdvs
      .map(
        (r) =>
          `RDV ${r.examen} ${[r.date, r.heure].filter(Boolean).join(" à ")}`,
      )
      .join("\n"),
    examen: d.rdvs
      .map((r) => r.examen)
      .filter(Boolean)
      .join(" et "),
    date: premier.date,
    heure: premier.heure,
    centre: d.centre,
    adresse: d.adresse,
    prenom: d.prenom,
    nom: d.nom,
  });
  const nettoye = brut
    .split("\n")
    .map((l) => l.replace(/[ \t]{2,}/g, " ").trim())
    .filter((l) => l.length > 0)
    .join("\n");
  return versGsm7(nettoye);
}

/**
 * Le pire cas que le serveur exige de tenir en un SMS : le vrai nom et la vraie
 * adresse du centre, un RDV simple, le jour le plus long, l'examen le plus long,
 * un nom et un prénom de vingt caractères.
 */
export function donneesPireCas(centre: string, adresse: string): DonneesSms {
  return {
    rdvs: [{ examen: "mammographie", date: "mercredi 22/07", heure: "11h30" }],
    centre,
    adresse,
    prenom: "X".repeat(20),
    nom: "X".repeat(20),
  };
}

/** Un exemple réaliste pour l'aperçu, en RDV simple ou double. */
export function donneesExemple(
  centre: string,
  adresse: string,
  double = false,
): DonneesSms {
  const rdvs: RdvSms[] = [
    { examen: "IRM", date: "mardi 14/10", heure: "10h00" },
  ];
  if (double)
    rdvs.push({ examen: "radio", date: "mardi 14/10", heure: "10h45" });
  return { rdvs, centre, adresse, prenom: "Claire", nom: "Martin" };
}

export type DonneesDepot = {
  lien: string;
  code: string;
  /** Délai de dépôt, en heures (rendu « 48h »). */
  delaiHeures: number;
  rdv: RdvSms;
  centre: string;
  prenom: string;
  nom: string;
};

/** Le SMS de dépôt tel que le patient le reçoit, même nettoyage que la confirmation. */
export function rendreSmsDepot(gabarit: string, d: DonneesDepot): string {
  const brut = remplacer(gabarit, {
    lien: d.lien,
    code: d.code,
    delai: `${d.delaiHeures}h`,
    examen: d.rdv.examen,
    date: d.rdv.date,
    heure: d.rdv.heure,
    centre: d.centre,
    prenom: d.prenom,
    nom: d.nom,
  });
  const nettoye = brut
    .split("\n")
    .map((l) => l.replace(/[ \t]{2,}/g, " ").trim())
    .filter((l) => l.length > 0)
    .join("\n");
  return versGsm7(nettoye);
}

/**
 * Pire cas du SMS de dépôt : lien de 51 caractères (`https://depot-ordonnances.
 * neuracorp.ai/d/` suivi de 10), code de 6 chiffres, délai d'une semaine, et les
 * mêmes valeurs longues que la confirmation.
 */
export function donneesDepotPireCas(centre: string): DonneesDepot {
  const pire = donneesPireCas(centre, "");
  return {
    lien: "https://depot-ordonnances.neuracorp.ai/d/" + "X".repeat(10),
    code: "000000",
    delaiHeures: 168,
    rdv: pire.rdvs[0],
    centre,
    prenom: pire.prenom,
    nom: pire.nom,
  };
}

/** Un exemple réaliste pour l'aperçu. */
export function donneesDepotExemple(centre: string): DonneesDepot {
  const ex = donneesExemple(centre, "");
  return {
    lien: "https://depot-ordonnances.neuracorp.ai/d/a7K2mQ9xTb",
    code: "482913",
    delaiHeures: 48,
    rdv: ex.rdvs[0],
    centre,
    prenom: ex.prenom,
    nom: ex.nom,
  };
}

/** Variables obligatoires absentes du gabarit de dépôt, ou message `null`. */
export function erreurVariablesDepot(gabarit: string): string | null {
  const g = erreurGabarit(gabarit, VARIABLES_DEPOT);
  if (g) return g;
  const presentes = new Set(
    Array.from(gabarit.matchAll(/\{([^{}]*)\}/g)).map((m) => m[1]),
  );
  if (VARIABLES_DEPOT_OBLIGATOIRES.some((v) => !presentes.has(v))) {
    return "Ajoutez {lien} et {code} : sans eux le patient ne peut pas déposer son ordonnance.";
  }
  return null;
}

/** Longueur du SMS de dépôt au pire cas, en septets GSM-7. */
export function longueurDepotPireCas(gabarit: string, centre: string): number {
  return longueurGsm7(rendreSmsDepot(gabarit, donneesDepotPireCas(centre)));
}

// ─── GSM-7 ───────────────────────────────────────────────────────────────────

/** Jeu de base GSM 03.38 : un caractère = un septet. */
const GSM_BASE = new Set(
  Array.from(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡" +
      "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
  ),
);
/** Table d'extension : chaque caractère compte double. */
const GSM_EXTENSION = new Set(Array.from("^{}\\[~]|€"));

const TRANSLITTERATION: Record<string, string> = {
  œ: "oe",
  Œ: "OE",
  "’": "'",
  "‘": "'",
  "‚": "'",
  "‛": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "«": '"',
  "»": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2212": "-",
  "…": "...",
  " ": " ",
  " ": " ",
  " ": " ",
};

/**
 * Ramène un texte au jeu GSM-7 pour qu'il parte en un seul SMS de 160
 * caractères. Sans cela, un seul « ê » fait passer tout le message en Unicode,
 * à 70 caractères par SMS.
 *
 * On garde ce que le jeu GSM porte déjà (é, è, à, ù, ì, ò, É, Ç, ä, ö, ü, ñ, æ…),
 * on translittère le reste (ê → e, ç → c, œ → oe, guillemets et tirets
 * typographiques) et on retire ce qui n'a pas d'équivalent (emoji, symboles).
 */
export function versGsm7(texte: string): string {
  let sortie = "";
  for (const c of Array.from(texte)) {
    if (GSM_BASE.has(c) || GSM_EXTENSION.has(c)) {
      sortie += c;
      continue;
    }
    if (c in TRANSLITTERATION) {
      sortie += TRANSLITTERATION[c];
      continue;
    }
    // Lettre accentuée hors jeu : on retire le diacritique (ê → e, ç → c).
    const base = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (base !== c && Array.from(base).every((b) => GSM_BASE.has(b))) {
      sortie += base;
    }
    // Sinon : pas d'équivalent, le caractère est retiré.
  }
  return sortie;
}

/** Longueur facturée en septets : la table d'extension compte double. */
export function longueurGsm7(texte: string): number {
  let n = 0;
  for (const c of Array.from(texte)) n += GSM_EXTENSION.has(c) ? 2 : 1;
  return n;
}

// ─── Validation de la valeur du domaine ──────────────────────────────────────

export type TextesTalk = {
  rdvInstructionSentence?: string;
  rdvInstructionParExamen?: Record<string, string>;
  smsConfirmationGabarit?: string;
  smsDepotGabarit?: string;
  smsDepotAvantConfirmation?: true;
  questionsExamen?: Record<string, QuestionsExamen>;
  examenFermeAuRobot?: Record<string, ExamenFerme>;
};

function erreurConsigne(texte: string, ou: string): string | null {
  if (texte.length > MAX_CONSIGNE) {
    return `${ou} fait ${texte.length} caractères. Raccourcissez-la à ${MAX_CONSIGNE} au plus.`;
  }
  const g = erreurGabarit(texte, VARIABLES_CONSIGNE);
  return g ? `${ou} : ${g}` : null;
}

/** Erreur de longueur du SMS, ou `null` s'il tient en un SMS. */
export function erreurLongueurSms(
  gabarit: string,
  centre: string,
  adresse: string,
): string | null {
  const n = longueurGsm7(rendreSms(gabarit, donneesPireCas(centre, adresse)));
  if (n <= MAX_SMS) return null;
  return `Le SMS ne tient pas en un seul message : il peut atteindre ${n} caractères avec le nom et l'adresse de votre centre, pour ${MAX_SMS} au plus. Retirez ${n - MAX_SMS} caractères.`;
}

/**
 * Valide et normalise la valeur du domaine `talk.textes`. Les textes vides sont
 * retirés : une clé absente veut dire « texte standard » pour le robot. Les clés
 * inconnues sont conservées telles quelles (le socle reste extensible).
 *
 * `centre` et `adresse` sont ceux de la fiche du centre, pour le pire cas du SMS.
 */
export function validerTextes(
  valeur: Record<string, unknown>,
  centre: string,
  adresse: string,
): { valeur: Record<string, unknown> } | { erreur: string } {
  const sortie: Record<string, unknown> = { ...valeur };

  const texte = (v: unknown): string | null | undefined => {
    if (v === undefined || v === null) return null;
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t === "" ? null : t;
  };

  const consigne = texte(valeur[CLE_CONSIGNE]);
  if (consigne === undefined)
    return { erreur: "La consigne doit être un texte." };
  if (consigne === null) delete sortie[CLE_CONSIGNE];
  else {
    const e = erreurConsigne(consigne, "La consigne");
    if (e) return { erreur: e };
    sortie[CLE_CONSIGNE] = consigne;
  }

  const parExamen = valeur[CLE_CONSIGNE_PAR_EXAMEN];
  if (parExamen === undefined || parExamen === null)
    delete sortie[CLE_CONSIGNE_PAR_EXAMEN];
  else {
    if (typeof parExamen !== "object" || Array.isArray(parExamen)) {
      return { erreur: "Les consignes par examen sont mal formées." };
    }
    const propres: Record<string, string> = {};
    for (const [code, brut] of Object.entries(
      parExamen as Record<string, unknown>,
    )) {
      if (!CODES_EXAMEN.includes(code)) {
        return {
          erreur: `Le type d'examen ${code} n'existe pas. Types possibles : ${CODES_EXAMEN.join(", ")}.`,
        };
      }
      const t = texte(brut);
      if (t === undefined)
        return { erreur: `La consigne ${code} doit être un texte.` };
      if (t === null) continue;
      const libelle = EXAMENS_CONSIGNE.find((x) => x.code === code)!.libelle;
      const e = erreurConsigne(t, `La consigne ${libelle}`);
      if (e) return { erreur: e };
      propres[code] = t;
    }
    if (Object.keys(propres).length === 0)
      delete sortie[CLE_CONSIGNE_PAR_EXAMEN];
    else sortie[CLE_CONSIGNE_PAR_EXAMEN] = propres;
  }

  const sms = texte(valeur[CLE_GABARIT_SMS]);
  if (sms === undefined)
    return { erreur: "Le texte du SMS doit être un texte." };
  if (sms === null) delete sortie[CLE_GABARIT_SMS];
  else {
    const g = erreurGabarit(sms, VARIABLES_SMS);
    if (g) return { erreur: `SMS : ${g}` };
    const l = erreurLongueurSms(sms, centre, adresse);
    if (l) return { erreur: l };
    sortie[CLE_GABARIT_SMS] = sms;
  }

  const depot = texte(valeur[CLE_GABARIT_DEPOT]);
  if (depot === undefined)
    return { erreur: "Le texte du SMS de dépôt doit être un texte." };
  if (depot === null) delete sortie[CLE_GABARIT_DEPOT];
  else {
    const g = erreurVariablesDepot(depot);
    if (g) return { erreur: `SMS de dépôt : ${g}` };
    const n = longueurDepotPireCas(depot, centre);
    if (n > MAX_SMS) {
      return {
        erreur: `Le SMS de dépôt ne tient pas en un seul message : il peut atteindre ${n} caractères avec le lien, le code et le nom de votre centre, pour ${MAX_SMS} au plus. Retirez ${n - MAX_SMS} caractères.`,
      };
    }
    sortie[CLE_GABARIT_DEPOT] = depot;
  }

  // Ordre des deux SMS. Seul `true` est stocké : absent veut dire « après »,
  // le comportement par défaut du robot.
  const avant = valeur[CLE_DEPOT_AVANT];
  if (avant === undefined || avant === null || avant === false)
    delete sortie[CLE_DEPOT_AVANT];
  else if (avant === true) sortie[CLE_DEPOT_AVANT] = true;
  else
    return {
      erreur:
        "L'ordre des SMS doit valoir vrai (dépôt avant) ou faux (dépôt après).",
    };

  const questions = validerQuestions(valeur[CLE_QUESTIONS]);
  if ("erreur" in questions) return questions;
  if (questions.valeur) sortie[CLE_QUESTIONS] = questions.valeur;
  else delete sortie[CLE_QUESTIONS];

  const fermes = validerExamensFermes(valeur[CLE_EXAMEN_FERME]);
  if ("erreur" in fermes) return fermes;
  if (fermes.valeur) sortie[CLE_EXAMEN_FERME] = fermes.valeur;
  else delete sortie[CLE_EXAMEN_FERME];

  return { valeur: sortie };
}

/** Le nom et l'adresse du centre tels que le robot les met dans le SMS. */
export function centreEtAdresse(fiche: {
  centerName?: string | null;
  address?: string | null;
  address2?: string | null;
}): { centre: string; adresse: string } {
  return {
    centre: fiche.centerName?.trim() || "notre centre",
    adresse: [fiche.address, fiche.address2]
      .map((x) => x?.trim())
      .filter(Boolean)
      .join(", "),
  };
}

// ─── Questions avant l'IRM et le scanner (15/10/2026) ────────────────────────
// Le robot pose ces questions dans cet ordre (`confirmExam.js`, `askAllergy.js`,
// `askIrmContraindication.js`, `v2/grossesse.js`). Une case décochée : la question
// n'est pas posée. Clé absente : la question est posée, comme avant le 15/10.

export type QuestionsExamen = {
  injection?: boolean;
  /** Ce que le robot réserve quand il ne demande pas : « sans » par défaut. */
  siInjectionNonDemandee?: "sans" | "avec";
  allergie?: boolean;
  contreIndications?: boolean;
  grossesse?: boolean;
};

export type CleQuestion =
  "injection" | "allergie" | "contreIndications" | "grossesse";

export type QuestionArbre = {
  cle: CleQuestion;
  titre: string;
  question: string;
  siOui: string;
  siNon: string;
  /** La question n'existe que si l'examen est injecté. */
  siInjecte?: true;
};

const INJECTION: QuestionArbre = {
  cle: "injection",
  titre: "Injection",
  question: "« Votre examen est-il avec injection, oui ou non ? »",
  siOui: "le robot réserve l'examen avec injection",
  siNon: "le robot réserve l'examen sans injection",
};
const GROSSESSE: QuestionArbre = {
  cle: "grossesse",
  titre: "Grossesse",
  question:
    "« Est-ce que vous êtes enceinte ? » Posée aux femmes de 12 à 55 ans, juste avant le récapitulatif.",
  siOui: "transfert au secrétariat, comme en cas de doute",
  siNon: "le robot continue",
};

/** L'arbre de chaque type, dans l'ordre où le robot pose les questions. */
export const ARBRE_QUESTIONS: {
  code: "MR" | "CT";
  libelle: string;
  questions: QuestionArbre[];
}[] = [
  {
    code: "MR",
    libelle: "IRM",
    questions: [
      INJECTION,
      {
        cle: "allergie",
        titre: "Allergie au produit de contraste",
        question:
          "« Avez-vous une allergie connue au produit de contraste utilisé pour les IRM ? »",
        siOui: "transfert au secrétariat, comme en cas de doute",
        siNon: "le robot continue",
        siInjecte: true,
      },
      {
        cle: "contreIndications",
        titre: "Contre-indications",
        question:
          "« Avez-vous un pacemaker, une valve cardiaque, du matériel médical métallique, ou un éclat métallique dans les yeux ? »",
        siOui: "transfert au secrétariat, comme en cas de doute",
        siNon: "le robot continue",
      },
      GROSSESSE,
    ],
  },
  {
    code: "CT",
    libelle: "Scanner",
    questions: [
      INJECTION,
      {
        cle: "allergie",
        titre: "Allergie à l'iode",
        question: "« Êtes-vous allergique au produit de contraste iodé ? »",
        siOui: "transfert au secrétariat, comme en cas de doute",
        siNon: "le robot continue",
        siInjecte: true,
      },
      GROSSESSE,
    ],
  },
];

function validerQuestions(
  brut: unknown,
): { valeur: Record<string, QuestionsExamen> | null } | { erreur: string } {
  if (brut === undefined || brut === null) return { valeur: null };
  if (typeof brut !== "object" || Array.isArray(brut)) {
    return { erreur: "Les questions par examen sont mal formées." };
  }
  const propres: Record<string, QuestionsExamen> = {};
  for (const [code, v] of Object.entries(brut as Record<string, unknown>)) {
    const arbre = ARBRE_QUESTIONS.find((a) => a.code === code);
    if (!arbre) {
      return {
        erreur: `Les questions ne se règlent que pour l'IRM et le scanner (${code} reçu).`,
      };
    }
    if (v === null || v === undefined) continue;
    if (typeof v !== "object" || Array.isArray(v)) {
      return { erreur: `Les questions ${arbre.libelle} sont mal formées.` };
    }
    const q = v as Record<string, unknown>;
    const r: QuestionsExamen = {};
    for (const { cle, titre } of arbre.questions) {
      if (q[cle] === undefined || q[cle] === null) continue;
      if (typeof q[cle] !== "boolean") {
        return {
          erreur: `${arbre.libelle} : la question « ${titre} » doit être cochée ou décochée.`,
        };
      }
      // Seul « non posée » est stocké : posée est le comportement par défaut.
      if (q[cle] === false) r[cle] = false;
    }
    const si = q.siInjectionNonDemandee;
    if (si !== undefined && si !== null && si !== "sans" && si !== "avec") {
      return {
        erreur: `${arbre.libelle} : sans la question de l'injection, le robot réserve l'examen sans ou avec injection.`,
      };
    }
    if (r.injection === false && si === "avec")
      r.siInjectionNonDemandee = "avec";
    if (Object.keys(r).length) propres[code] = r;
  }
  return { valeur: Object.keys(propres).length ? propres : null };
}

// ─── Examens fermés au robot (02/11/2026) ────────────────────────────────────
// Plan `lyrae/plans/2026-11-examens-fermes-au-robot.md`, § 4. Pour un examen que le
// centre ne confie pas au robot (type décoché dans « Examens acceptés », code
// « non réservable » ou absent de la correspondance), ce que le robot répond au
// patient. Clé : code robot (`RX`, `US`, `MG`, `CT`, `MR`, jamais les diminutifs)
// ou `codeExamen` NEURACORP (`N01MR141`) pour un examen précis ; le code prime sur
// le type (côté robot). Clé absente = `transferer`, le comportement d'avant.
//
// Le réglage ne joue que pour un examen demandé seul : dans une demande à plusieurs
// examens, un examen fermé transfère toujours (Enzo, 02/11). Hors français, le robot
// dit sa phrase fixe traduite, avec le numéro s'il y en a un, sinon il transfère.
//
// **Recopié côté robot** (`v2/examenFerme.js`, lot 6c) : les trois valeurs de
// `reponse`, les phrases fixes et l'ordre texte puis numéro.

export type ReponseExamenFerme = "transferer" | "orienter" | "non_fait";

export type ExamenFerme = {
  reponse: ReponseExamenFerme;
  /** Phrase du centre, dite telle quelle (seule variable : `{examen}`). */
  texte?: string;
  /** Numéro dit au patient, en forme internationale (`+33…`). */
  telephone?: string;
};

export const REPONSES_EXAMEN_FERME: {
  valeur: ReponseExamenFerme;
  libelle: string;
}[] = [
  { valeur: "transferer", libelle: "Passer l'appel au secrétariat" },
  { valeur: "orienter", libelle: "Dire au patient où prendre rendez-vous" },
  { valeur: "non_fait", libelle: "Dire que le centre ne fait pas cet examen" },
];

export const VARIABLES_EXAMEN_FERME: VariableTexte[] = [
  { nom: "examen", aide: "la mammographie, l'IRM du genou…" },
];

export const MAX_TEXTE_EXAMEN_FERME = 300;

export const ERREUR_ORIENTER_VIDE =
  "Écrivez la phrase que le robot dira, ou donnez un numéro.";
export const ERREUR_NUMERO_FERME =
  "Ce numéro n'est pas valide. Écrivez ses dix chiffres, par exemple 01 23 45 67 89.";

/** `codeExamen` NEURACORP : `N01MR141`, `N01US012`… */
const CODE_EXAMEN_PRECIS = /^N\d{2}[A-Z]{2,5}\d{2,4}$/;

/** La clé est-elle un code robot ou un code d'examen précis ? */
export function estCleExamenFerme(cle: string): boolean {
  return CODES_EXAMEN.includes(cle) || CODE_EXAMEN_PRECIS.test(cle);
}

/** `01 23 45 67 89` ou `+33 1 23…` vers `+33123456789`. `null` si le numéro n'est pas valide. */
export function numeroEnInternational(brut: string): string | null {
  if (!estNumeroSortant(brut)) return null;
  const n = brut.trim().replace(/[\s.\-()/]/g, "");
  return n.startsWith("0") ? `+33${n.slice(1)}` : n;
}

/** `+33123456789` vers `01 23 45 67 89`, la forme lue par une secrétaire. */
export function numeroLisible(telephone: string): string {
  const n = telephone.replace(/^\+33/, "0").replace(/\D/g, "");
  return n.length === 10 ? n.replace(/(\d{2})(?=\d)/g, "$1 ") : telephone;
}

/** Erreur du texte d'un examen fermé, ou `null`. */
export function erreurTexteFerme(texte: string): string | null {
  if (texte.length > MAX_TEXTE_EXAMEN_FERME) {
    return `La phrase fait ${texte.length} caractères. Raccourcissez-la à ${MAX_TEXTE_EXAMEN_FERME} au plus.`;
  }
  return erreurGabarit(texte, VARIABLES_EXAMEN_FERME);
}

/**
 * L'examen avec son article, comme `catalogue.avecArticle` du robot
 * (`v2/catalogue.js`) : « la mammographie », « l'IRM du genou », « le scanner ».
 */
export function examenAvecArticle(libelle: string): string {
  const l = libelle.trim();
  if (!l) return "";
  let corps = /^irm/i.test(l)
    ? "IRM" + l.slice(3)
    : l.charAt(0).toLowerCase() + l.slice(1);
  corps = corps.replace(/^echo/, "écho");
  if (/^[aeiouyhéèêàâîïôû]/i.test(corps)) return `l'${corps}`;
  if (
    /^(radiographie|mammographie|radio|mammo|densitometrie|densitométrie)/i.test(
      corps,
    )
  )
    return `la ${corps}`;
  return `le ${corps}`;
}

/**
 * La phrase que le patient entend, pour l'aperçu de l'écran. Les phrases fixes
 * sont celles du plan (§ 4) ; le robot dit le numéro chiffre par chiffre.
 */
export function phraseExamenFerme(reglage: ExamenFerme, examen: string): string {
  const ex = examen || "cet examen";
  const texte = reglage.texte?.trim()
    ? rendreConsigne(reglage.texte, { examen: ex, centre: "" })
    : "";
  const tel = reglage.telephone ? numeroLisible(reglage.telephone) : "";
  const finir = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
  if (reglage.reponse === "orienter") {
    if (!texte && tel)
      return `Pour ${ex}, appelez le ${tel}, c'est là que se prend le rendez-vous. Bonne journée.`;
    return [texte ? finir(texte) : "", tel ? `${tel}.` : "", "Bonne journée."]
      .filter(Boolean)
      .join(" ");
  }
  if (reglage.reponse === "non_fait") {
    return [
      `Je suis désolée, notre centre ne fait pas ${ex}.`,
      texte ? finir(texte) : "",
      "Bonne journée.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return `Pour ${ex}, c'est le secrétariat qui prend le rendez-vous. Je vous le passe.`;
}

/**
 * Valide et normalise `examenFermeAuRobot`. Seul ce qui sert est gardé : pas de
 * texte ni de numéro pour `transferer`, pas de numéro pour `non_fait`. Une valeur
 * vide retire la clé.
 */
export function validerExamensFermes(
  brut: unknown,
): { valeur: Record<string, ExamenFerme> | null } | { erreur: string } {
  if (brut === undefined || brut === null) return { valeur: null };
  if (typeof brut !== "object" || Array.isArray(brut)) {
    return {
      erreur: "Les réponses des examens fermés au robot sont mal formées.",
    };
  }
  const propres: Record<string, ExamenFerme> = {};
  for (const [cleBrute, v] of Object.entries(brut as Record<string, unknown>)) {
    const cle = cleBrute.trim().toUpperCase();
    if (!estCleExamenFerme(cle)) {
      return {
        erreur: `L'examen ${cleBrute} n'est pas reconnu. Choisissez un type (${CODES_EXAMEN.join(", ")}) ou un examen de la correspondance.`,
      };
    }
    if (v === null || v === undefined) continue;
    if (typeof v !== "object" || Array.isArray(v)) {
      return { erreur: `La réponse pour ${cle} est mal formée.` };
    }
    const r = v as Record<string, unknown>;
    const nom = EXAMENS_CONSIGNE.find((x) => x.code === cle)?.libelle ?? cle;
    const reponse = r.reponse;
    if (
      reponse !== "transferer" &&
      reponse !== "orienter" &&
      reponse !== "non_fait"
    ) {
      return {
        erreur: `Pour ${nom}, choisissez ce que dit le robot : passer l'appel, dire où prendre rendez-vous, ou dire que le centre ne fait pas l'examen.`,
      };
    }
    if (r.texte !== undefined && r.texte !== null && typeof r.texte !== "string") {
      return { erreur: `La phrase pour ${nom} doit être un texte.` };
    }
    if (
      r.telephone !== undefined &&
      r.telephone !== null &&
      typeof r.telephone !== "string"
    ) {
      return { erreur: `Le numéro pour ${nom} doit être un texte.` };
    }
    const texte = typeof r.texte === "string" ? r.texte.trim() : "";
    const telBrut = typeof r.telephone === "string" ? r.telephone.trim() : "";

    if (reponse === "transferer") {
      propres[cle] = { reponse };
      continue;
    }
    if (texte) {
      const e = erreurTexteFerme(texte);
      if (e) return { erreur: `${nom} : ${e}` };
    }
    if (reponse === "non_fait") {
      propres[cle] = texte ? { reponse, texte } : { reponse };
      continue;
    }
    // orienter : la phrase du centre, le numéro, ou les deux.
    let telephone: string | null = null;
    if (telBrut) {
      telephone = numeroEnInternational(telBrut);
      if (!telephone) return { erreur: `${nom} : ${ERREUR_NUMERO_FERME}` };
    }
    if (!texte && !telephone)
      return { erreur: `${nom} : ${ERREUR_ORIENTER_VIDE}` };
    propres[cle] = {
      reponse,
      ...(texte ? { texte } : {}),
      ...(telephone ? { telephone } : {}),
    };
  }
  return { valeur: Object.keys(propres).length ? propres : null };
}
