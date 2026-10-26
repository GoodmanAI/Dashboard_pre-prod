/**
 * Les salles d'un centre ouvertes au portail Konnect (domaine `konnect.salles`,
 * 26/10/2026). Plan : `lyrae/plans/2026-10-salles-ouvertes-konnect.md`.
 * -----------------------------------------------------------------------------
 * Module PUR : importé par l'écran d'installation, par la route du catalogue et par
 * `/api/product-config`.
 *
 * Konnect se facture PAR SALLE : l'équipe déclare les salles du centre, par type
 * d'examen, puis ouvre celles que le centre a prises. Deux données, deux
 * propriétaires :
 *
 *   | Donnée                     | Où                               | Qui la règle |
 *   |----------------------------|----------------------------------|--------------|
 *   | salles et salles ouvertes  | `ProductConfig` konnect.salles   | l'admin      |
 *   | `postes` d'un examen       | `KonnectExamens.postes`          | le centre    |
 *
 * La déclaration a la forme et la validation de `talk.site.sallesParType`
 * (`sallesExamen.ts`) : même clé de salle, le `numeroPoste` d'Xplore normalisé.
 * Elle n'est pas lue chez Talk : un centre Konnect n'a pas toujours le robot, et
 * `talk.site` est fermé à la clé de Konnect (décision K1 du plan).
 *
 * ── CE QUE KONNECT REÇOIT ────────────────────────────────────────────────────
 * Konnect ne connaît ni la déclaration ni les salles fermées : le Dashboard calcule,
 * examen par examen, la liste des postes où chercher (`postesPourKonnect`).
 *   - type sans salle déclarée : `[]`, aucun filtre (comportement d'avant) ;
 *   - sinon : salles ouvertes du type, réduites au choix de l'examen s'il en a un ;
 *   - rien d'ouvert : `null`, l'examen passe au rappel (`reservable_en_ligne: false`).
 */

import { EXAM_TYPES, type ExamType } from "@/lib/examTypes";
import {
  lireSallesParType,
  normaliserPoste,
  sallesDuType,
  typePourSalles,
  validerSallesParType,
  type Salle,
  type SallesParType,
} from "@/lib/sallesExamen";

export const DOMAINE_SALLES_KONNECT = "konnect.salles";

export type SallesKonnect = {
  sallesParType: SallesParType;
  /** Postes ouverts au portail, chacun déclaré dans `sallesParType`. */
  ouvertes: string[];
};

function postesDeclares(salles: SallesParType): Set<string> {
  const sortie = new Set<string>();
  for (const liste of Object.values(salles)) for (const s of liste ?? []) sortie.add(s.poste);
  return sortie;
}

/**
 * Lecture tolérante de la valeur stockée. Une salle ouverte qui n'est plus déclarée
 * est ignorée, comme les `postes` d'un examen de Talk (D7 du plan des salles).
 */
export function lireSallesKonnect(brut: unknown): SallesKonnect {
  const objet =
    brut && typeof brut === "object" && !Array.isArray(brut)
      ? (brut as Record<string, unknown>)
      : {};
  const sallesParType = lireSallesParType(objet.sallesParType);
  const declares = postesDeclares(sallesParType);
  const ouvertes: string[] = [];
  if (Array.isArray(objet.ouvertes)) {
    for (const p of objet.ouvertes) {
      const poste = normaliserPoste(p);
      if (poste && declares.has(poste) && !ouvertes.includes(poste)) ouvertes.push(poste);
    }
  }
  return { sallesParType, ouvertes };
}

/** Validation à l'écriture (`PUT /api/product-config`). */
export function validerSallesKonnect(
  brut: unknown
): { valeur: SallesKonnect } | { erreur: string } {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) {
    return { erreur: "Salles du portail : la valeur doit être un objet." };
  }
  const objet = brut as Record<string, unknown>;
  const salles = validerSallesParType(objet.sallesParType ?? {});
  if ("erreur" in salles) return salles;

  // Un même poste dans deux types ferait deux lignes pour une seule salle, et deux
  // façons de la facturer.
  const vus = new Map<string, string>();
  for (const [type, liste] of Object.entries(salles.valeur)) {
    for (const s of liste ?? []) {
      const autre = vus.get(s.poste);
      if (autre) {
        return {
          erreur: `Salles du portail : ${s.poste} est déclaré en ${autre} et en ${type}. Une salle n'a qu'un type, gardez-en un.`,
        };
      }
      vus.set(s.poste, type);
    }
  }

  const brutes = objet.ouvertes ?? [];
  if (!Array.isArray(brutes)) {
    return { erreur: "Salles du portail : les salles ouvertes doivent être une liste." };
  }
  const ouvertes: string[] = [];
  for (const p of brutes) {
    const poste = normaliserPoste(p);
    if (!poste || ouvertes.includes(poste)) continue;
    if (!vus.has(poste)) {
      return {
        erreur: `Salles du portail : ${poste} est ouverte mais n'est pas déclarée. Ajoutez-la à la liste, ou décochez-la.`,
      };
    }
    ouvertes.push(poste);
  }
  return { valeur: { sallesParType: salles.valeur, ouvertes } };
}

/**
 * Les salles ouvertes, par type, dans l'ordre de la déclaration. Ce que l'écran
 * des examens propose au centre.
 */
export function sallesOuvertesParType(config: SallesKonnect): SallesParType {
  const ouvertes = new Set(config.ouvertes);
  const sortie: SallesParType = {};
  for (const type of EXAM_TYPES) {
    const liste = (config.sallesParType[type] ?? []).filter((s) => ouvertes.has(s.poste));
    if (liste.length > 0) sortie[type] = liste;
  }
  return sortie;
}

/**
 * Les types qui ont des salles déclarées mais aucune d'ouverte : leurs examens
 * passent au rappel. L'écran des examens le dit au centre.
 */
export function typesSansSalleOuverte(config: SallesKonnect): ExamType[] {
  const ouvertes = new Set(config.ouvertes);
  return EXAM_TYPES.filter((type) => {
    const liste = config.sallesParType[type] ?? [];
    return liste.length > 0 && !liste.some((s) => ouvertes.has(s.poste));
  });
}

/**
 * Le type dont un examen du mapping Konnect prend les salles : le type NEURACORP,
 * sinon celui du logiciel du centre. Le scanner injecté de Menton (`CI` chez
 * Xplore) est un `CT` chez nous : il prend les salles de scanner.
 */
export function typeSallesExamen(
  typeExamen: string | null | undefined,
  typeExamenClient: string | null | undefined
): ExamType | null {
  return typePourSalles(typeExamen) ?? typePourSalles(typeExamenClient);
}

/**
 * Les postes où Konnect cherche les créneaux d'un examen.
 *
 *   `[]`   aucun filtre : aucune salle déclarée pour ce type ;
 *   liste  les seules salles autorisées ;
 *   `null` aucune salle ouverte pour cet examen : il passe au rappel.
 *
 * Le choix de l'examen est réduit aux salles ouvertes. S'il n'en garde aucune (le
 * centre avait choisi RX2, que l'équipe a fermée), l'examen n'a plus de salle :
 * le rappel, jamais un créneau dans une salle non ouverte.
 */
export function postesPourKonnect(
  config: SallesKonnect,
  type: ExamType | null,
  postesExamen: readonly string[] | null | undefined
): string[] | null {
  if (!type) return [];
  const declarees = sallesDuType(config.sallesParType, type);
  if (declarees.length === 0) return [];
  const ouvertes = new Set(config.ouvertes);
  const choisis = new Set((postesExamen ?? []).map(normaliserPoste).filter(Boolean));
  const postes = declarees
    .map((s) => s.poste)
    .filter((p) => ouvertes.has(p) && (choisis.size === 0 || choisis.has(p)));
  return postes.length > 0 ? postes : null;
}

/** `postes` d'une ligne du mapping, à l'écriture : textes normalisés, sans doublon. */
export function normaliserPostesExamen(brut: unknown): string[] {
  if (!Array.isArray(brut)) return [];
  const sortie: string[] = [];
  for (const p of brut) {
    const poste = normaliserPoste(p);
    if (poste && !sortie.includes(poste)) sortie.push(poste);
  }
  return sortie;
}

// ── Le relevé collé depuis Xplore ───────────────────────────────────────────

/** Une salle lue dans un relevé, avec son type quand le code le dit. */
export type SalleRelevee = Salle & { type: ExamType | null };

const TYPE_DANS_CODE = new RegExp(`(${EXAM_TYPES.join("|")})\\d*$`);

/**
 * Lit la liste `postesOpenRVE` de `GetInfos` (« ME-CT1;ME-MG1;ME-RX1 »), ou toute
 * liste de postes séparés par des points-virgules, virgules, espaces ou retours à
 * la ligne.
 *
 * Le type se devine quand le code finit par une modalité suivie d'un numéro
 * (`ME-RX1` → RX) ; sinon il reste à choisir (Pontivy : `R2`, `E1`). Le nom proposé
 * est la fin du code, après le dernier tiret (`ME-RX1` → « RX1 »).
 */
export function lireReleve(texte: string): SalleRelevee[] {
  const sortie: SalleRelevee[] = [];
  for (const morceau of texte.split(/[;,\s]+/)) {
    const poste = normaliserPoste(morceau);
    if (!poste || sortie.some((s) => s.poste === poste)) continue;
    const fin = poste.split("-").pop() || poste;
    const type = TYPE_DANS_CODE.exec(fin)?.[1] as ExamType | undefined;
    sortie.push({ poste, libelle: fin, type: type ?? null });
  }
  return sortie;
}
