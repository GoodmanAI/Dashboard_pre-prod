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
 *   }
 *
 * Une seule implémentation pour l'écran (aperçu, compteur) et pour la route
 * (validation) : le client ne doit jamais voir un aperçu accepté que le serveur
 * refuse, ni l'inverse.
 *
 * **Recopié côté robot** (`lyraetalk`, aucun package partagé) : la liste des
 * variables, le rendu et la translittération GSM-7 doivent y rester identiques.
 */

export const CLE_CONSIGNE = "rdvInstructionSentence";
export const CLE_CONSIGNE_PAR_EXAMEN = "rdvInstructionParExamen";
export const CLE_GABARIT_SMS = "smsConfirmationGabarit";
export const CLE_GABARIT_DEPOT = "smsDepotGabarit";
export const CLE_DEPOT_AVANT = "smsDepotAvantConfirmation";

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
      erreur: "L'ordre des SMS doit valoir vrai (dépôt avant) ou faux (dépôt après).",
    };

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
