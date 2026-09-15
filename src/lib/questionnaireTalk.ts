/**
 * Les formes exactes que le questionnaire d'installation doit écrire (lot 4C).
 *
 * **Pourquoi un fichier à part.** Les champs de LyraeTalk emploient TROIS vocabulaires
 * différents pour les mêmes cinq examens, et se confondre écrit une configuration que le
 * robot ignore en silence. Les rassembler ici évite de les retaper au milieu d'un
 * composant, et donne un seul endroit à corriger.
 *
 * Relevé le 15/09/2026 contre `talk/parametrage/Ecran.tsx` et `api/configuration/route.ts`.
 */

/** Les cinq clés de `examsAccepted`, `fullPlanningNotes` et `examQuestions`. */
export type CleExamen = "radiographie" | "irm" | "echographie" | "scanner" | "mammo";

/**
 * Les cinq examens, avec leur libellé et leur clé de COMBO.
 *
 * ⚠️ **Le piège de ce dossier.** `multiExamMapping` n'emploie pas les mêmes mots :
 * `radio` et non `radiographie`, `mammographie` et non `mammo`. La table de traduction
 * du serveur (`api/configuration/route.ts:230`) ne connaît que le second vocabulaire, et
 * **ignore silencieusement** une clé qui n'en fait pas partie : une combinaison écrite
 * `radiographie_irm` n'est ni appliquée ni signalée.
 */
export const EXAMENS: {
  cle: CleExamen;
  libelle: string;
  /** Le mot employé DANS les clés de `multiExamMapping`. */
  combo: string;
}[] = [
  { cle: "radiographie", libelle: "Radiographie", combo: "radio" },
  { cle: "echographie", libelle: "Échographie", combo: "echographie" },
  { cle: "mammo", libelle: "Mammographie", combo: "mammographie" },
  { cle: "scanner", libelle: "Scanner", combo: "scanner" },
  { cle: "irm", libelle: "IRM", combo: "irm" },
];

/**
 * Les treize combinaisons que le serveur sait traduire.
 *
 * L'ordre des deux membres n'est pas libre : c'est celui de la table
 * `doubleExamCodeMap`. Inverser produit une clé inconnue, donc ignorée.
 */
export const COMBOS: { cle: string; a: string; b: string }[] = [
  { cle: "echographie_echographie", a: "echographie", b: "echographie" },
  { cle: "echographie_mammographie", a: "echographie", b: "mammographie" },
  { cle: "echographie_radio", a: "echographie", b: "radio" },
  { cle: "echographie_irm", a: "echographie", b: "irm" },
  { cle: "echographie_scanner", a: "echographie", b: "scanner" },
  { cle: "mammographie_radio", a: "mammographie", b: "radio" },
  { cle: "mammographie_irm", a: "mammographie", b: "irm" },
  { cle: "mammographie_scanner", a: "mammographie", b: "scanner" },
  { cle: "mammographie_echomammaire", a: "mammographie", b: "echomammaire" },
  { cle: "radio_radio", a: "radio", b: "radio" },
  { cle: "radio_irm", a: "radio", b: "irm" },
  { cle: "radio_scanner", a: "radio", b: "scanner" },
  { cle: "irm_scanner", a: "irm", b: "scanner" },
];

/**
 * Le libellé d'une combinaison, pour l'écran.
 *
 * Le second membre passe en minuscules, le premier garde sa majuscule : c'est une ligne
 * de liste, pas une phrase, et « échographie et mammographie » se lisait comme une
 * coquille à côté des autres libellés de l'écran. Vu à l'écran le 15/09/2026.
 */
export function libelleCombo(combo: { a: string; b: string }): string {
  const mot = (c: string) =>
    c === "echomammaire"
      ? "écho mammaire"
      : (EXAMENS.find((e) => e.combo === c)?.libelle ?? c).toLowerCase();
  const premier = mot(combo.a);
  return `${premier.charAt(0).toUpperCase()}${premier.slice(1)} et ${mot(combo.b)}`;
}

/** Les sept jours, clé stockée en anglais et libellé français. */
export const JOURS: { cle: string; libelle: string }[] = [
  { cle: "monday", libelle: "Lundi" },
  { cle: "tuesday", libelle: "Mardi" },
  { cle: "wednesday", libelle: "Mercredi" },
  { cle: "thursday", libelle: "Jeudi" },
  { cle: "friday", libelle: "Vendredi" },
  { cle: "saturday", libelle: "Samedi" },
  { cle: "sunday", libelle: "Dimanche" },
];

export type Plage = { start: string; end: string };
export type Journee = { enabled: boolean; ranges: Plage[] };

/** Une semaine fermée, le point de départ. `enabled: false` est ce qui veut dire fermé. */
export function semaineVide(): Record<string, Journee> {
  const s: Record<string, Journee> = {};
  for (const j of JOURS) s[j.cle] = { enabled: false, ranges: [] };
  return s;
}

/** La conduite à tenir quand le planning est complet, pour un type d'examen. */
export type ConduitePlanning =
  | { type: "fin_appel"; message: string }
  | { type: "redirection"; phone: string };

/**
 * Le questionnaire ne remplit QUE ces champs.
 *
 * `serviceEnabled` et `reconnaissance` en sont volontairement absents : ce sont des
 * interrupteurs d'exploitation, pas des réglages d'installation. `examQuestions` aussi :
 * aucune interface ne l'édite, et rien ne le lit.
 */
export type ReponsesTalk = {
  centerName: string;
  address: string;
  address2: string;
  centerPhone: string;
  centerMail: string;
  centerWebsite: string;
  examsAccepted: Record<CleExamen, boolean>;
  fullPlanningNotes: Record<string, ConduitePlanning>;
  weeklyHours: Record<string, Journee>;
  motif: boolean;
  questions: boolean;
  menstruations: boolean;
  multiExamMapping: Record<string, { enabled: boolean; mode: "single" | "double" }>;
};

export function reponsesVides(): ReponsesTalk {
  const examsAccepted = {} as Record<CleExamen, boolean>;
  for (const e of EXAMENS) examsAccepted[e.cle] = false;
  return {
    centerName: "",
    address: "",
    address2: "",
    centerPhone: "",
    centerMail: "",
    centerWebsite: "",
    examsAccepted,
    fullPlanningNotes: {},
    weeklyHours: semaineVide(),
    motif: true,
    questions: true,
    menstruations: false,
    multiExamMapping: {},
  };
}

/** Dix chiffres, le format qu'attend le robot pour un numéro sortant. */
export function numeroValide(v: string): boolean {
  return /^\d{10}$/.test(v.replace(/[\s.\-]/g, ""));
}

export function mailValide(v: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v.trim());
}
