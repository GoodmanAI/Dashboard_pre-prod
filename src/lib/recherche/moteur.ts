/**
 * Recherche centrale, étage 1 : comprendre une phrase sans modèle.
 * -----------------------------------------------------------------------------
 * Plan `plans/2026-10-recherche-centrale-dashboard.md` (workspace), R2, R3, R8.
 *
 * Module PUR : aucun import à l'exécution (seulement des types), ni React, ni Prisma.
 * La route `/api/recherche` l'appelle, et le banc `scripts/recherche/banc.mjs` le
 * charge tel quel sous Node (`--experimental-strip-types`) pour rejouer le corpus.
 * Un import ajouté ici casserait le banc : passer la donnée en paramètre.
 *
 * Ce que fait l'étage 1 :
 *   1. lit les filtres structurés de la phrase (période, examen, issue d'appel, nom,
 *      téléphone, état) ;
 *   2. note chaque fiche du catalogue (termes trouvés, genre de la demande, produit) ;
 *   3. rend les meilleures destinations, avec les seuls filtres que l'écran accepte.
 *
 * Ce qu'il ne fait jamais : lire la base, calculer un chiffre, agir. Une demande
 * d'action (« annule le rendez-vous de… ») est refusée et le dit (R1).
 */

export type Produit = "talk" | "konnect";

/** Ce que la fiche apporte : un réglage, une liste à traiter, une carte de chiffres, une donnée. */
export type Genre = "reglage" | "liste" | "statistique" | "donnee";

export type CleFiltre =
  | "periode"
  | "examen"
  | "type"
  | "issue"
  | "nom"
  | "telephone"
  | "texte"
  | "etat";

/**
 * Une fiche du catalogue (R6) : un écran, ou une section d'écran désignée par son
 * ancre, que le panneau monte préfiltré (R8).
 */
export type Fiche = {
  /** `{chemin}` ou `{chemin}#{ancre}`, chemin relatif à `/client/c/{userId}/`. */
  cle: string;
  produit: Produit;
  /** Clé de droit de `PAGES` (`src/lib/permissions.ts`). */
  page: string;
  /** Libellé montré dans le résultat, tel que l'écran le nomme. */
  libelle: string;
  genre: Genre;
  /** Mots et expressions qui y mènent, écrits naturellement (accents et casse libres). */
  termes: string[];
  /** Filtres que l'écran sait recevoir. Les autres sont ignorés, et on le dit. */
  filtres?: CleFiltre[];
};

export type Filtres = Partial<Record<CleFiltre, string>>;

export type Resultat = {
  cle: string;
  produit: Produit;
  page: string;
  libelle: string;
  genre: Genre;
  score: number;
  filtres: Filtres;
};

export type Reponse = {
  resultats: Resultat[];
  /** Ce que la phrase demandait et qu'aucun écran ne sait filtrer (sexe, âge…). */
  ignores: string[];
  /** Demande hors de ce que fait la barre. */
  refus?: "action" | "hors_perimetre";
  /** Filtres lus dans la phrase, avant le choix de l'écran. */
  lus: Filtres;
};

// ── Normalisation ───────────────────────────────────────────────────────────

/** Minuscules, sans accents ni ponctuation, mots séparés par une espace. */
export function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’'`-]/g, " ")
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Abréviations et variantes ramenées à un mot de base, avant toute comparaison. */
const ABREVIATIONS: Record<string, string> = {
  rdv: "rendez vous",
  rdvs: "rendez vous",
  mammo: "mammographie",
  mamo: "mammographie",
  mamographie: "mammographie",
  ecographie: "echographie",
  mammos: "mammographie",
  echo: "echographie",
  echos: "echographie",
  scan: "scanner",
  scanners: "scanner",
  tdm: "scanner",
  irms: "irm",
  radios: "radio",
  stats: "statistiques",
  stat: "statistiques",
  email: "mail",
  mails: "mail",
  courriel: "mail",
  texto: "sms",
  textos: "sms",
  aujourdhui: "aujourd hui",
  mme: "madame",
  mr: "monsieur",
  faq: "questions frequentes",
};

/** Pluriel ramené au singulier, des deux côtés de la comparaison. */
function racine(mot: string): string {
  if (mot.length > 3 && /[sx]$/.test(mot) && !/(ss|us)$/.test(mot)) return mot.slice(0, -1);
  return mot;
}

function mots(texte: string): string[] {
  return normaliser(texte)
    .split(" ")
    .flatMap((m) => (ABREVIATIONS[m] ?? m).split(" "))
    .filter(Boolean)
    .map(racine);
}

/** Une expression est présente si ses mots s'y suivent. */
function contient(phrase: string[], expression: string[]): boolean {
  if (!expression.length || expression.length > phrase.length) return false;
  outer: for (let i = 0; i <= phrase.length - expression.length; i++) {
    for (let j = 0; j < expression.length; j++) if (phrase[i + j] !== expression[j]) continue outer;
    return true;
  }
  return false;
}

function contientUn(phrase: string[], expressions: string[]): boolean {
  return expressions.some((e) => contient(phrase, mots(e)));
}

// ── Filtres ─────────────────────────────────────────────────────────────────

const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

const PERIODES: [string[], string][] = [
  [["semaine derniere", "la semaine passee"], "semaine_derniere"],
  [["cette semaine", "de la semaine", "sur la semaine"], "cette_semaine"],
  [["mois dernier", "dernier mois", "le mois passe", "30 derniers jours", "trente derniers jours"], "dernier_mois"],
  [["ce mois", "du mois", "sur le mois"], "ce_mois"],
  [["ce matin"], "ce_matin"],
  [["cet apres midi"], "cet_apres_midi"],
  [["avant hier"], "avant_hier"],
  [["hier"], "hier"],
  [["aujourd hui", "ce jour", "du jour"], "aujourd_hui"],
];

/** Les valeurs de période que l'étage 1 lit, et que l'étage 2 a le droit de rendre. */
export const VALEURS_PERIODE: string[] = [...PERIODES.map(([, v]) => v), ...JOURS];
export const VALEURS_ISSUE = ["rdv_booked", "rdv_canceled", "rdv_modified", "transfert", "raccroche"];
export const VALEURS_ETAT = ["en_attente", "traite"];
export const VALEURS_TYPE = ["US", "MG", "RX", "MR", "CT"];

function lirePeriode(m: string[]): string | undefined {
  for (const [expressions, valeur] of PERIODES) if (contientUn(m, expressions)) return valeur;
  const jour = JOURS.find((j) => m.includes(j));
  if (jour) return jour;
  const date = m.find((x) => /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(x));
  return date;
}

/** Mots qui désignent une modalité, vers les codes robot (`src/lib/examTypes.ts`). */
const MODALITES: [string, string][] = [
  ["mammographie", "MG"],
  ["tomosynthese", "MG"],
  ["sein", "MG"],
  ["echographie", "US"],
  ["doppler", "US"],
  ["echodoppler", "US"],
  ["scanner", "CT"],
  ["scanographie", "CT"],
  ["coloscanner", "CT"],
  ["irm", "MR"],
  ["radio", "RX"],
  ["radiographie", "RX"],
  ["panoramique", "RX"],
];

/** Ce qui arrête la lecture du nom d'un examen. */
const FIN_EXAMEN = new Set([
  ...JOURS,
  "hier", "aujourd", "ce", "cet", "cette", "le", "la", "les", "un", "une", "patient", "patiente",
  "on", "il", "elle", "qui", "que", "est", "c", "pour", "sur", "dans", "en", "a", "au", "avec",
  "et", "ou", "chez", "par", "mineur", "majeur", "dame", "monsieur", "madame", "ne", "pa",
]);

function lireExamen(m: string[]): { examen?: string; type?: string } {
  for (let i = 0; i < m.length; i++) {
    const modalite = MODALITES.find(([mot]) => m[i] === mot);
    if (!modalite) continue;
    const suite: string[] = [m[i]];
    for (let j = i + 1; j < m.length && suite.length < 5; j++) {
      if (FIN_EXAMEN.has(m[j]) || MODALITES.some(([mot]) => mot === m[j] && mot !== "doppler")) break;
      suite.push(m[j]);
    }
    while (["de", "des", "du", "d"].includes(suite[suite.length - 1])) suite.pop();
    return { examen: suite.join(" "), type: modalite[1] };
  }
  return {};
}

/** Le type d'un libellé d'examen écrit en clair (sert au banc). */
export function typeDe(libelle: string): string | undefined {
  return lireExamen(mots(libelle)).type;
}

function lireIssue(m: string[]): string | undefined {
  if (contientUn(m, ["raccroche"])) return "raccroche";
  if (contientUn(m, ["annule", "annulation", "annulee"])) return "rdv_canceled";
  if (contientUn(m, ["deplace", "decale", "reporte", "rendez vous modifie"])) return "rdv_modified";
  if (contientUn(m, ["transfere", "transfert", "redirige", "redirection"])) return "transfert";
  if (contientUn(m, ["rendez vous pri", "reserve", "rendez vous pris"])) return "rdv_booked";
  return undefined;
}

/** Nom d'un patient après une civilité, lu dans le texte d'origine (casse gardée). */
function lireNom(texte: string): string | undefined {
  const m = texte.match(
    /\b(?:madame|monsieur|mme|mlle|mademoiselle|mr|m\.)\s+([A-ZÀ-Ý][\p{L}'’-]+)/iu
  );
  return m?.[1];
}

function lireTelephone(texte: string): string | undefined {
  const chiffres = texte.replace(/(?<=\d)[ .-](?=\d)/g, "").match(/(?:\+33|0033|0)[1-9]\d{8}/);
  if (!chiffres) return undefined;
  return chiffres[0].replace(/^(\+33|0033)/, "0");
}

function lireEtat(m: string[]): string | undefined {
  if (contientUn(m, ["pas encore traite", "pas encore traitee", "non traite", "non traitee", "a traiter", "en attente", "pas traite", "pas traitee"]))
    return "en_attente";
  if (contientUn(m, ["deja traite", "traitee", "traite"])) return "traite";
  return undefined;
}

/** Mots vides retirés pour garder le sujet d'une recherche dans un texte. */
const VIDES = new Set([
  "est", "ce", "qu", "que", "qui", "il", "elle", "on", "y", "a", "existe", "une", "un", "des", "de",
  "du", "d", "le", "la", "les", "l", "dans", "pour", "par", "sur", "en", "et", "ou", "donne", "donner",
  "dit", "dire", "nos", "notre", "vos", "votre", "je", "veux", "voudrais", "montre", "moi", "affiche",
  "quel", "quelle", "quels", "quelles", "robot", "patient", "patients",
]);

function lireTexte(m: string[], fiche: Fiche): string | undefined {
  const exclus = new Set(fiche.termes.flatMap(mots));
  const reste = m.filter((x) => !VIDES.has(x) && !exclus.has(x));
  return reste.length ? reste.join(" ") : undefined;
}

// ── Garde-fous ──────────────────────────────────────────────────────────────

const ACTIONS = /^(?:(?:peux tu|pouvez vous|tu peux|vous pouvez)\s+)?(annule|annuler|supprime|supprimer|efface|effacer|deplace|deplacer|reporte|reporter|envoie|envoyer|appelle|appeler|rappelle|rappeler|reserve|reserver|prends|prendre|cree|creer)\b/;

const HORS_PERIMETRE = [
  "mot de passe", "mon profil", "mon compte", "ticket", "facture", "facturation",
  "tous les centre", "liste des client", "centres client", "les client", "autres centre",
];

const SEXE_AGE = ["homme", "femme", "dame", "monsieur", "an", "age", "ag", "vieux", "jeune", "enfant"];

// ── Notation ────────────────────────────────────────────────────────────────

const MOTS_CHIFFRE = [
  "combien", "nombre", "pourcentage", "taux", "le plus", "qui reviennent", "qui ressortent",
  "statistiques", "total", "moyenne", "evolution",
];
const MOTS_REGLAGE = [
  "modifier", "changer", "regler", "enlever", "retirer", "ajouter", "desactiver", "activer",
  "mettre", "ou est", "c est regle", "parametre", "parametrer", "configurer", "est ce qu on",
  "est ce que le robot", "on peut",
];
const MOTS_KONNECT = ["portail", "en ligne", "internet", "konnect"];
const MOTS_TALK = ["robot", "telephone", "talk", "appel"];

/** Plus une fiche marque de points, plus elle est sûre. Sous ce seuil : rien (étage 2). */
export const SEUIL = 2;

function noter(fiche: Fiche, m: string[], lus: Filtres): number {
  // Le terme le plus long trouvé compte en entier, les autres pour moitié : une section
  // nommée précisément (« annulations via les relances ») passe devant l'écran qui la
  // contient et dont plusieurs mots courts reviennent.
  const poids = fiche.termes
    .map(mots)
    .filter((t) => contient(m, t))
    .map((t) => 1 + t.length * 1.5)
    .sort((a, b) => b - a);
  if (!poids.length) return 0;
  let score = poids[0] + poids.slice(1).reduce((s, p) => s + p / 2, 0);

  const accepte = new Set(fiche.filtres ?? []);
  const chiffre = contientUn(m, MOTS_CHIFFRE);
  if (chiffre) score += fiche.genre === "statistique" ? 4 : -2;
  if (contientUn(m, MOTS_REGLAGE) && fiche.genre === "reglage") score += 1.5;
  if ((lus.nom || lus.telephone) && (accepte.has("nom") || accepte.has("telephone"))) score += 3;
  if (lus.type && accepte.has("type")) score += 1;
  if (lus.periode && accepte.has("periode")) score += 1;
  if (contientUn(m, MOTS_KONNECT)) score += fiche.produit === "konnect" ? 3 : -1;
  else score += fiche.produit === "talk" ? (contientUn(m, MOTS_TALK) ? 1 : 0.25) : 0;
  return score;
}

/**
 * Comprend une phrase avec le seul catalogue.
 * `fiches` est déjà filtré par les droits et les produits du compte (la route s'en charge).
 */
export function chercher(phrase: string, fiches: Fiche[], max = 3): Reponse {
  const m = mots(phrase);
  const n = normaliser(phrase);
  const ex = lireExamen(m);
  const lus: Filtres = {
    periode: lirePeriode(m),
    examen: ex.examen,
    type: ex.type,
    issue: lireIssue(m),
    nom: lireNom(phrase),
    telephone: lireTelephone(phrase),
    etat: lireEtat(m),
  };
  for (const k of Object.keys(lus) as CleFiltre[]) if (lus[k] === undefined) delete lus[k];

  const ignores: string[] = [];
  if (!lus.nom && contientUn(m, SEXE_AGE.filter((x) => x !== "an" && x !== "ag")) ) ignores.push("sexe");
  if (/\b\d+\s*ans\b/.test(n) || contientUn(m, ["age", "plus de 60"])) ignores.push("age");

  if (contientUn(m, HORS_PERIMETRE)) return { resultats: [], ignores, refus: "hors_perimetre", lus };
  if (ACTIONS.test(n)) return { resultats: [], ignores, refus: "action", lus };

  const notes = fiches
    .map((f) => ({ f, score: noter(f, m, lus) }))
    .filter((x) => x.score >= SEUIL)
    .sort((a, b) => b.score - a.score);
  const meilleur = notes[0]?.score ?? 0;

  const resultats = notes
    .filter((x) => x.score >= meilleur * 0.7)
    .slice(0, max)
    .map(({ f, score }) => {
      const accepte = new Set(f.filtres ?? []);
      const filtres: Filtres = {};
      for (const k of Object.keys(lus) as CleFiltre[]) if (accepte.has(k)) filtres[k] = lus[k];
      if (accepte.has("texte")) {
        const texte = lireTexte(m, f);
        if (texte) filtres.texte = texte;
      }
      // « Rendez-vous mammo vendredi » : sur la liste des appels, un rendez-vous sans autre
      // issue dite est un rendez-vous pris.
      if (accepte.has("issue") && !filtres.issue && contient(m, mots("rendez vous"))) filtres.issue = "rdv_booked";
      return { cle: f.cle, produit: f.produit, page: f.page, libelle: f.libelle, genre: f.genre, score, filtres };
    });

  return { resultats, ignores, lus };
}
