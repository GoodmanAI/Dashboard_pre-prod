/**
 * Plages privées du portail Konnect (15/10/2026).
 * Plan : `lyrae/plans/2026-10-konnect-plages-privees.md` ; décision : `DECISIONS.md`
 * du 15/10/2026.
 *
 * Domaine `konnect.plages-privees` de `ProductConfig`, réglé par le CLIENT (droit
 * Paramétrage de Konnect), lu par Konnect avec `KONNECT_API_KEY` :
 *
 *   {
 *     medecins:     [{ code: "DUPONT", consigne: "…" }],
 *     depassements: [{ valeur: "C" | "D" | "?", consigne: "…" }],
 *     priorite:     "les_deux" | "medecin" | "depassement",
 *   }
 *
 * Un créneau libre est une plage privée quand l'un de ses `codesMedecins` est une
 * ligne `medecins`, ou quand son `depComplHono` est une ligne `depassements`. `?` ne
 * correspond qu'à `?`. Quand il correspond aux deux sortes de lignes, `priorite`
 * décide des consignes montrées au patient. Aucune ligne : aucune plage privée.
 *
 * DISTINCT DE `specialMedecins` (`talk.site`) : celui-là est réglé par l'admin et
 * porte des phrases dites par le robot. Les deux ne se lisent pas l'un l'autre.
 *
 * Une seule implémentation pour l'écran et pour la route : le client ne doit jamais
 * voir accepté à l'écran ce que le serveur refuse.
 *
 * ⚠️ `priorite` est une énumération lue par Konnect (`contracts/shared/enums.md`) :
 * ajouter une valeur est sûr, en renommer une casse le calcul en silence.
 */

export const DOMAINE_PLAGES_PRIVEES = "konnect.plages-privees";

export const VALEURS_DEPASSEMENT: { valeur: ValeurDepassement; libelle: string }[] = [
  { valeur: "C", libelle: "C, complément" },
  { valeur: "D", libelle: "D, dépassement" },
  { valeur: "?", libelle: "?, l'un ou l'autre" },
];

export const PRIORITES: { valeur: Priorite; libelle: string; aide: string }[] = [
  {
    valeur: "les_deux",
    libelle: "Afficher les deux consignes",
    aide: "Celle du médecin, puis celle du dépassement.",
  },
  {
    valeur: "medecin",
    libelle: "La consigne du médecin prime",
    aide: "Seule la consigne du médecin s'affiche.",
  },
  {
    valeur: "depassement",
    libelle: "La consigne du dépassement prime",
    aide: "Seule la consigne du dépassement s'affiche.",
  },
];

export type ValeurDepassement = "C" | "D" | "?";
export type Priorite = "les_deux" | "medecin" | "depassement";

export type LigneMedecin = { code: string; consigne: string };
export type LigneDepassement = { valeur: ValeurDepassement; consigne: string };

export type PlagesPrivees = {
  medecins: LigneMedecin[];
  depassements: LigneDepassement[];
  priorite: Priorite;
};

/** Ce que lit un patient : la même borne que les consignes de planning complet. */
export const MAX_CONSIGNE = 400;
/** Un code médecin Xplore fait 6 caractères (`AAUB01`) ; on laisse de la marge. */
export const MAX_CODE = 20;
export const MAX_MEDECINS = 100;

export const VIDE: PlagesPrivees = { medecins: [], depassements: [], priorite: "les_deux" };

/** Comme Xplore l'écrit : majuscules, sans espace. Comparé tel quel par Konnect. */
export function normaliserCode(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

function estValeur(v: unknown): v is ValeurDepassement {
  return v === "C" || v === "D" || v === "?";
}

function estPriorite(v: unknown): v is Priorite {
  return v === "les_deux" || v === "medecin" || v === "depassement";
}

/**
 * Lecture tolérante d'une valeur stockée, pour l'écran : ce qui ne se lit pas est
 * ignoré plutôt que de bloquer l'affichage.
 */
export function lirePlagesPrivees(brut: unknown): PlagesPrivees {
  const o = brut && typeof brut === "object" ? (brut as Record<string, unknown>) : {};
  const medecins = Array.isArray(o.medecins)
    ? o.medecins
        .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
        .map((l) => ({
          code: typeof l.code === "string" ? l.code : "",
          consigne: typeof l.consigne === "string" ? l.consigne : "",
        }))
    : [];
  const depassements = Array.isArray(o.depassements)
    ? o.depassements
        .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
        .filter((l) => estValeur(l.valeur))
        .map((l) => ({
          valeur: l.valeur as ValeurDepassement,
          consigne: typeof l.consigne === "string" ? l.consigne : "",
        }))
    : [];
  return { medecins, depassements, priorite: estPriorite(o.priorite) ? o.priorite : "les_deux" };
}

/**
 * Validation stricte, pour la route et pour le bouton de l'écran. Rend la valeur à
 * écrire (codes normalisés, consignes sans espaces autour), ou la première erreur, dite
 * comme le client doit la corriger.
 */
export function validerPlagesPrivees(
  brut: unknown
): { valeur: PlagesPrivees } | { erreur: string } {
  const o = brut && typeof brut === "object" ? (brut as Record<string, unknown>) : {};

  if (o.medecins !== undefined && !Array.isArray(o.medecins)) {
    return { erreur: "La liste des médecins est illisible. Rechargez la page." };
  }
  if (o.depassements !== undefined && !Array.isArray(o.depassements)) {
    return { erreur: "La liste des dépassements est illisible. Rechargez la page." };
  }
  if (o.priorite !== undefined && !estPriorite(o.priorite)) {
    return { erreur: "Choisissez quelle consigne s'affiche quand les deux règles s'appliquent." };
  }

  const brutsMedecins = (o.medecins as unknown[] | undefined) ?? [];
  if (brutsMedecins.length > MAX_MEDECINS) {
    return { erreur: `${MAX_MEDECINS} médecins au plus.` };
  }

  const medecins: LigneMedecin[] = [];
  const vus = new Set<string>();
  for (const l of brutsMedecins) {
    const ligne = l && typeof l === "object" ? (l as Record<string, unknown>) : {};
    const code = normaliserCode(typeof ligne.code === "string" ? ligne.code : "");
    const consigne = typeof ligne.consigne === "string" ? ligne.consigne.trim() : "";
    const erreur = erreurLigneMedecin(code, consigne, vus);
    if (erreur) return { erreur };
    vus.add(code);
    medecins.push({ code, consigne });
  }

  const depassements: LigneDepassement[] = [];
  const valeursVues = new Set<string>();
  for (const l of (o.depassements as unknown[] | undefined) ?? []) {
    const ligne = l && typeof l === "object" ? (l as Record<string, unknown>) : {};
    if (!estValeur(ligne.valeur)) {
      return { erreur: "Choisissez la valeur de dépassement : C, D ou ?." };
    }
    const consigne = typeof ligne.consigne === "string" ? ligne.consigne.trim() : "";
    const erreur = erreurLigneDepassement(ligne.valeur, consigne, valeursVues);
    if (erreur) return { erreur };
    valeursVues.add(ligne.valeur);
    depassements.push({ valeur: ligne.valeur, consigne });
  }

  return {
    valeur: {
      medecins,
      depassements,
      priorite: estPriorite(o.priorite) ? o.priorite : "les_deux",
    },
  };
}

/** L'erreur d'une ligne médecin, ou `null`. Partagée avec l'écran, ligne par ligne. */
export function erreurLigneMedecin(
  code: string,
  consigne: string,
  dejaVus: Set<string>
): string | null {
  if (!code) return "Saisissez le code du médecin, tel qu'il figure dans votre logiciel de gestion.";
  if (code.length > MAX_CODE) return `Le code ${code} est trop long (${MAX_CODE} caractères au plus).`;
  if (dejaVus.has(code)) return `Le code ${code} figure deux fois. Gardez une seule ligne.`;
  if (!consigne) return `Écrivez la consigne que le patient lira pour le médecin ${code}.`;
  if (consigne.length > MAX_CONSIGNE)
    return `La consigne du médecin ${code} dépasse ${MAX_CONSIGNE} caractères.`;
  return null;
}

export function erreurLigneDepassement(
  valeur: ValeurDepassement,
  consigne: string,
  dejaVues: Set<string>
): string | null {
  if (dejaVues.has(valeur)) return `La valeur ${valeur} figure deux fois. Gardez une seule ligne.`;
  if (!consigne) return `Écrivez la consigne que le patient lira pour la valeur ${valeur}.`;
  if (consigne.length > MAX_CONSIGNE)
    return `La consigne de la valeur ${valeur} dépasse ${MAX_CONSIGNE} caractères.`;
  return null;
}
