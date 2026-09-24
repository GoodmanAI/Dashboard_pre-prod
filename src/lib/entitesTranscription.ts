/**
 * Les entités dans une transcription d'appel : ce qui est dit, ce que Lyrae en a retenu.
 * -----------------------------------------------------------------------------
 * Module PUR : pas de React. Plan : plans/2026-09-transcriptions-entites.md (workspace).
 *
 * DEUX ORIGINES, affichées différemment :
 *
 *   - « repere » : trouvé ici, dans le texte, par motif (date, heure, téléphone) ou par
 *     lexique (type d'examen, région, côté). Marche sur tous les appels, y compris ceux
 *     d'avant le 24/09/2026. Ne sait pas si Lyrae a compris.
 *   - « retenu » : envoyé par LyraeTalk dans `stats.entites` (`src/helpers/calls/entites.js`
 *     côté robot) : à ce tour, le robot a retenu telle chose. Nom, prénom, naissance et
 *     téléphone y arrivent SANS VALEUR (minimisation) : on surligne alors ce qu'on a
 *     repéré dans la réponse, ou la réponse entière.
 *
 * LE LOCUTEUR VIENT DU PRÉFIXE (`Lyrae:`, `Patient:`, `WaitSound:`), jamais de la parité
 * de l'index : les WaitSound s'intercalent et la décalent.
 *
 * On ne cherche pas un nom propre dans une phrase libre : le STT ne rend pas la casse, la
 * détection se tromperait plus souvent qu'elle n'aiderait. Un nom n'est repéré que dans
 * la réponse à une question de Lyrae qui le demande.
 */

export type Locuteur = "Lyrae" | "Patient" | "WaitSound";

export type TypeEntite =
  | "nom"
  | "prenom"
  | "naissance"
  | "telephone"
  | "identite"
  | "date"
  | "heure"
  | "examen"
  | "region"
  | "cote"
  | "disponibilite"
  | "creneau"
  | "site";

export type Origine = "repere" | "retenu";

/** Une entrée de `stats.entites`, telle que LyraeTalk l'envoie. Énumérations : on ajoute, on ne renomme pas. */
export type EntiteRobot = {
  tour: number;
  type:
    | "nom"
    | "prenom"
    | "naissance"
    | "telephone"
    | "identite"
    | "examen_type"
    | "examen"
    | "disponibilite"
    | "creneau"
    | "site";
  statut: "compris" | "confirme" | "propose" | "refuse" | "choisi";
  valeur?: unknown;
};

export type Segment = {
  texte: string;
  entite?: { type: TypeEntite; origine: Origine; statut?: EntiteRobot["statut"] };
};

export type TourAnalyse = {
  /** Index dans `steps` brut (WaitSound compris), celui de `stats.entites`. */
  index: number;
  locuteur: Locuteur;
  heure: string | null;
  texte: string;
  segments: Segment[];
  /** Ce que Lyrae a retenu à ce tour sans qu'on le retrouve dans le texte. */
  horsTexte: EntiteRobot[];
};

// ── Lecture d'un tour ────────────────────────────────────────────────────────

const RE_TOUR = /^(Lyrae|Patient|WaitSound):\s*([\s\S]*?)\s*(?:\/(\d{2}:\d{2}:\d{2}))?\s*$/;

export function lireTour(
  brut: { speaker?: string; text?: string } | string,
  index: number
): { index: number; locuteur: Locuteur; heure: string | null; texte: string } {
  const ligne = typeof brut === "string" ? brut : String(brut?.text ?? "");
  const m = RE_TOUR.exec(ligne);
  if (m) return { index, locuteur: m[1] as Locuteur, texte: m[2], heure: m[3] ?? null };
  // Ancien format sans préfixe : on garde le locuteur calculé à l'écriture.
  const speaker = typeof brut === "string" ? undefined : brut?.speaker;
  return {
    index,
    locuteur: speaker === "Lyrae" ? "Lyrae" : "Patient",
    texte: ligne.replace(/\s*\/\d{2}:\d{2}:\d{2}\s*$/, ""),
    heure: /\/(\d{2}:\d{2}:\d{2})\s*$/.exec(ligne)?.[1] ?? null,
  };
}

// ── Motifs et lexiques ───────────────────────────────────────────────────────

const MOIS =
  "janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre";
const JOURS = "lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche";
const NOMBRES_JOUR =
  "premier|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|dix-sept|dix-huit|dix-neuf|vingt(?:-et-un|-deux|-trois|-quatre|-cinq|-six|-sept|-huit|-neuf| et un)?|trente(?:-et-un| et un)?";

type Motif = { type: TypeEntite; re: RegExp };

// Ordre sans importance : les chevauchements se règlent par la longueur, plus bas.
const MOTIFS: Motif[] = [
  // 4 mai 1990, mardi 2 octobre, le 1er mai, quatre mai
  {
    type: "date",
    re: new RegExp(
      `\\b(?:(?:${JOURS})\\s+)?(?:\\d{1,2}(?:er)?|${NOMBRES_JOUR})\\s+(?:${MOIS})(?:\\s+(?:\\d{4}|\\d{2}\\b))?`,
      "gi"
    ),
  },
  // 04/05/1990, 4-5-90, 04.05.1990
  { type: "date", re: /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g },
  // Une année de naissance seule (« en 1987 » arrive souvent en réponse isolée).
  { type: "date", re: /\b(?:19[0-9]{2}|20[0-2][0-9])\b/g },
  // 10 h 40, 10h, 14 heures 30, 9:15
  { type: "heure", re: /\b\d{1,2}\s?(?:h|heures?)(?:\s?\d{2})?\b|\b\d{1,2}:\d{2}\b/gi },
  // 06 12 34 56 78, 0612345678, +33 6 12 34 56 78
  {
    type: "telephone",
    re: /(?:\+33\s?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/g,
  },
  {
    type: "disponibilite",
    re: new RegExp(
      `\\b(?:le matin|l'apr[eè]s-midi|apr[eè]s-midi|en fin de journ[ée]e|en d[ée]but de matin[ée]e|(?:la )?semaine prochaine|le plus t[ôo]t possible|au plus vite|d[eè]s que possible|en (?:${MOIS})|(?:${JOURS}) prochain|(?:tous )?les (?:${JOURS})s?)\\b`,
      "gi"
    ),
  },
];

const EXAMENS = [
  "échographie doppler",
  "écho-doppler",
  "écho doppler",
  "échographie",
  "écho",
  "mammographie",
  "mammo",
  "radiographie",
  "radio",
  "arthroscanner",
  "uroscanner",
  "uro-scanner",
  "angioscan",
  "scanner",
  "IRM",
  "doppler",
  "panoramique dentaire",
  "panoramique",
  "cone beam",
  "ostéodensitométrie",
  "densitométrie osseuse",
  "densitométrie",
  "infiltration",
  "hystérosalpingographie",
  "cystographie",
  "biopsie",
  "ponction",
  "cyto-ponction",
];

// Repris de LyraeTalk (`sttKeyterms.js`, ANATOMY) : la même liste que celle qu'on pousse au STT.
const REGIONS = [
  "avant-bras",
  "colonne vertébrale",
  "rachis lombaire",
  "rachis cervical",
  "rachis dorsal",
  "rachis",
  "tendon d'Achille",
  "grille costale",
  "gril costal",
  "cheville",
  "coude",
  "genou",
  "épaule",
  "poignet",
  "hanche",
  "cou",
  "thorax",
  "abdomen",
  "abdominale",
  "bassin",
  "lombaire",
  "lombaires",
  "cervicale",
  "cervicales",
  "dorsale",
  "main",
  "pied",
  "doigt",
  "doigts",
  "orteil",
  "orteils",
  "jambe",
  "bras",
  "cuisse",
  "mollet",
  "talon",
  "clavicule",
  "omoplate",
  "sternum",
  "côtes",
  "crâne",
  "sinus",
  "mâchoire",
  "rotule",
  "tibia",
  "péroné",
  "fémur",
  "humérus",
  "sein",
  "seins",
  "rénale",
  "reins",
  "thyroïde",
  "prostate",
  "vésicule",
  "foie",
  "rate",
  "pelvienne",
  "pelvis",
  "vésicale",
  "inguinal",
  "aine",
  "tendon",
  "tendons",
  "cerveau",
  "dents",
  "mandibule",
];

const COTES = ["gauche", "droite", "droit", "des deux côtés", "les deux côtés", "bilatéral", "bilatérale"];

/** « échographie » doit aussi trouver « echographie » : le STT n'accentue pas toujours. */
function versMotif(mot: string): string {
  return mot
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/[eéèê]/gi, "[eéèê]")
    .replace(/[aàâ]/gi, "[aàâ]")
    .replace(/[iîï]/gi, "[iîï]")
    .replace(/[oô]/gi, "[oô]")
    .replace(/[uûù]/gi, "[uûù]")
    .replace(/'/g, "['’]")
    .replace(/ /g, "\\s+");
}

function lexique(type: TypeEntite, mots: string[]): Motif {
  const tries = [...mots].sort((a, b) => b.length - a.length).map(versMotif);
  // \b ne connaît pas les lettres accentuées : on borne à la main.
  return { type, re: new RegExp(`(?<![\\p{L}\\d])(?:${tries.join("|")})(?![\\p{L}\\d])`, "giu") };
}

const LEXIQUES: Motif[] = [lexique("examen", EXAMENS), lexique("region", REGIONS), lexique("cote", COTES)];

// ── Ce que Lyrae vient de demander ──────────────────────────────────────────

type Attente = "naissance" | "nom" | "prenom" | "telephone" | null;

function attenteDe(questionLyrae: string | null): Attente {
  if (!questionLyrae) return null;
  const q = questionLyrae.toLowerCase();
  if (/naissance|n[ée]e? le|votre [âa]ge/.test(q)) return "naissance";
  if (/pr[ée]nom/.test(q)) return "prenom";
  if (/nom de famille|votre nom|[ée]peler|[ée]pelez/.test(q)) return "nom";
  if (/t[ée]l[ée]phone|num[ée]ro/.test(q)) return "telephone";
  return null;
}

// Mots qui entourent un nom dans une réponse courte, et ne sont pas le nom.
const BRUIT_NOM =
  /^(?:oui|non|euh+|heu+|alors|donc|bon|ben|bah|voil[aà]|c'est|c’est|je|m'appelle|m’appelle|appelle|suis|moi|mon|nom|pr[ée]nom|est|madame|monsieur|mme|mr|m\.|mademoiselle|et|le|la|de|du|comme|s'[ée]crit|[ée]pel[ée]?|merci|bonjour|au revoir)$/i;

// ── Détection ────────────────────────────────────────────────────────────────

type Plage = { debut: number; fin: number; type: TypeEntite; origine: Origine; statut?: EntiteRobot["statut"] };

function plagesRepérees(texte: string, attente: Attente): Plage[] {
  const plages: Plage[] = [];
  for (const { type, re } of [...MOTIFS, ...LEXIQUES]) {
    re.lastIndex = 0;
    for (let m = re.exec(texte); m; m = re.exec(texte)) {
      if (!m[0]) {
        re.lastIndex++;
        continue;
      }
      let t: TypeEntite = type;
      // Une date donnée en réponse à « votre date de naissance » est une naissance.
      if (t === "date" && attente === "naissance") t = "naissance";
      // Une année seule n'est retenue que là où on l'attend : ailleurs c'est du bruit.
      if (type === "date" && /^\d{4}$/.test(m[0]) && attente !== "naissance") continue;
      plages.push({ debut: m.index, fin: m.index + m[0].length, type: t, origine: "repere" });
    }
  }

  // Un nom ou un prénom, seulement en réponse courte à la question qui le demande.
  if (attente === "nom" || attente === "prenom") {
    const mots = [...texte.matchAll(/[\p{L}][\p{L}'’-]*/gu)];
    const utiles = mots.filter((m) => !BRUIT_NOM.test(m[0]));
    if (utiles.length > 0 && utiles.length <= 4 && mots.length <= 12) {
      const premier = utiles[0];
      const dernier = utiles[utiles.length - 1];
      plages.push({
        debut: premier.index!,
        fin: dernier.index! + dernier[0].length,
        type: attente,
        origine: "repere",
      });
    }
  }
  return plages;
}

/** Les plus longues d'abord ; une plage qui en chevauche une déjà prise est écartée. */
function sansChevauchement(plages: Plage[]): Plage[] {
  const tries = [...plages].sort(
    (a, b) => (a.origine === b.origine ? 0 : a.origine === "retenu" ? -1 : 1) || b.fin - b.debut - (a.fin - a.debut) || a.debut - b.debut
  );
  const gardees: Plage[] = [];
  for (const p of tries) {
    if (!gardees.some((g) => p.debut < g.fin && g.debut < p.fin)) gardees.push(p);
  }
  return gardees.sort((a, b) => a.debut - b.debut);
}

function decouper(texte: string, plages: Plage[]): Segment[] {
  const segments: Segment[] = [];
  let curseur = 0;
  for (const p of plages) {
    if (p.debut > curseur) segments.push({ texte: texte.slice(curseur, p.debut) });
    segments.push({
      texte: texte.slice(p.debut, p.fin),
      entite: { type: p.type, origine: p.origine, statut: p.statut },
    });
    curseur = p.fin;
  }
  if (curseur < texte.length) segments.push({ texte: texte.slice(curseur) });
  return segments;
}

// Ce qu'une entité du robot vient confirmer parmi les plages repérées.
const CORRESPONDANCES: Record<EntiteRobot["type"], TypeEntite[]> = {
  nom: ["nom"],
  prenom: ["prenom"],
  naissance: ["naissance", "date"],
  telephone: ["telephone"],
  identite: [],
  examen_type: ["examen"],
  examen: ["examen", "region", "cote"],
  disponibilite: ["disponibilite", "date", "heure"],
  creneau: ["date", "heure"],
  site: [],
};

const TYPE_AFFICHE: Partial<Record<EntiteRobot["type"], TypeEntite>> = {
  examen_type: "examen",
  creneau: "creneau",
  naissance: "naissance",
};

/**
 * Analyse une conversation entière. `steps` est le tableau stocké (WaitSound compris),
 * `entites` le `stats.entites` de l'appel s'il existe.
 */
export function analyserConversation(
  steps: Array<{ speaker?: string; text?: string } | string>,
  entites?: EntiteRobot[] | null
): TourAnalyse[] {
  const parTour = new Map<number, EntiteRobot[]>();
  for (const e of Array.isArray(entites) ? entites : []) {
    if (!e || !Number.isInteger(e.tour)) continue;
    parTour.set(e.tour, [...(parTour.get(e.tour) ?? []), e]);
  }

  const tours = (steps ?? []).map((s, i) => lireTour(s, i));
  let derniereQuestion: string | null = null;
  const sortie: TourAnalyse[] = [];

  for (const tour of tours) {
    if (tour.locuteur === "WaitSound") continue;
    const attente = tour.locuteur === "Patient" ? attenteDe(derniereQuestion) : null;
    if (tour.locuteur === "Lyrae") derniereQuestion = tour.texte;

    let plages = plagesRepérees(tour.texte, attente);
    const horsTexte: EntiteRobot[] = [];

    for (const e of parTour.get(tour.index) ?? []) {
      if (e.type === "identite" || e.type === "site") {
        horsTexte.push(e);
        continue;
      }
      const cibles = CORRESPONDANCES[e.type] ?? [];
      const trouvees = plages.filter((p) => p.origine === "repere" && cibles.includes(p.type));
      if (trouvees.length) {
        for (const p of trouvees) {
          p.origine = "retenu";
          p.statut = e.statut;
          // Une heure reste une heure (icône d'horloge), même dans un créneau.
          if (p.type !== "heure") p.type = TYPE_AFFICHE[e.type] ?? p.type;
        }
      } else if (["nom", "prenom", "naissance", "telephone"].includes(e.type) && tour.texte.trim()) {
        // Sans valeur ni repère : c'est la réponse entière que Lyrae a retenue.
        const debut = tour.texte.length - tour.texte.trimStart().length;
        plages = [
          { debut, fin: tour.texte.trimEnd().length, type: e.type as TypeEntite, origine: "retenu", statut: e.statut },
        ];
      } else {
        horsTexte.push(e);
      }
    }

    sortie.push({
      ...tour,
      segments: decouper(tour.texte, sansChevauchement(plages)),
      horsTexte,
    });
  }
  return sortie;
}

// ── Mise en mots d'une entité du robot, pour le récapitulatif ────────────────

const MOIS_LONGS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

function dateCourte(iso: unknown): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return null;
  return `${Number(m[3])} ${MOIS_LONGS[Number(m[2]) - 1]}`;
}

/** Le texte d'une pastille du récapitulatif. Aucune donnée identifiante : le robot n'en envoie pas. */
export function libelleEntite(e: EntiteRobot, examLabelMap: Record<string, string> = {}): string {
  const v: any = e.valeur;
  switch (e.type) {
    case "nom":
      return "Nom";
    case "prenom":
      return "Prénom";
    case "naissance":
      return "Date de naissance";
    case "telephone":
      return "Téléphone";
    case "identite":
      return "Patient identifié";
    case "examen_type":
      return examLabelMap[String(v)] ?? String(v ?? "Type d'examen");
    case "examen":
      return v?.libelle || v?.code || "Examen";
    case "site":
      return `Site ${v ?? ""}`.trim();
    case "disponibilite": {
      const morceaux = [v?.periode, v?.moment === "morning" ? "matin" : v?.moment === "afternoon" ? "après-midi" : v?.moment];
      if (v?.pas_avant) morceaux.push(`après le ${dateCourte(v.pas_avant)}`);
      if (v?.pas_apres) morceaux.push(`avant le ${dateCourte(v.pas_apres)}`);
      return morceaux.filter(Boolean).join(", ") || "Disponibilités";
    }
    case "creneau": {
      const heure = /^(\d{1,2}):(\d{2})/.exec(String(v?.heure ?? ""));
      const quand = [dateCourte(v?.date), heure ? `à ${Number(heure[1])} h ${heure[2]}` : null]
        .filter(Boolean)
        .join(" ");
      return quand || "Créneau";
    }
    default:
      return String(e.type);
  }
}
