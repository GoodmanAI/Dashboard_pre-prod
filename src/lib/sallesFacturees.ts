/**
 * Les salles d'un client et celles qu'il paie, par produit (02/11/2026).
 * Plan : `lyrae/plans/2026-11-salles-facturees-talk-konnect.md`.
 * -----------------------------------------------------------------------------
 * Module PUR : pas de base, pas de React. La lecture vit dans `sallesFactureesLecture.ts`.
 *
 * Lyrae facture à la salle (Talk 325 €, Konnect 95 € TTC par mois et par salle) et un
 * produit ne prend de RDV que dans les salles payées. Une salle est déclarée UNE fois
 * au client (table `Salle`), avec une case par produit.
 *
 * ── LA RÈGLE, LA MÊME POUR LES DEUX PRODUITS ─────────────────────────────────
 *
 *   | Cases du produit cochées | Ce que fait le produit                              |
 *   |--------------------------|-----------------------------------------------------|
 *   | aucune (transition, S6)  | comme avant le chantier : toutes les salles         |
 *   |                          | déclarées servent au choix par examen, sans filtre  |
 *   | au moins une ("actif")   | seules les salles cochées existent ; une modalité   |
 *   |                          | sans salle cochée est fermée (Talk : transfert,     |
 *   |                          | Konnect : rappel) ; un examen sans salle choisie    |
 *   |                          | cherche dans toutes les salles cochées du type      |
 *
 * Les modules existants (`sallesExamen.ts` pour Talk, `konnectSalles.ts` pour Konnect)
 * gardent leurs formes : ce module les fabrique depuis la table, et tout ce qui les
 * lisait suit sans réécriture (priorités des doubles, salles imposées, catalogue).
 */

import { EXAM_TYPES, type ExamType } from "@/lib/examTypes";
import type { SallesKonnect } from "@/lib/konnectSalles";
import {
  LIBELLE_SALLE_MAX,
  normaliserPoste,
  typePourSalles,
  type SallesParType,
} from "@/lib/sallesExamen";

export type ProduitSalle = "talk" | "konnect";
export const PRODUITS_SALLE: readonly ProduitSalle[] = ["talk", "konnect"];

/** Une ligne de la table `Salle`. */
export type LigneSalle = {
  id: number;
  codeSite: string | null;
  poste: string;
  typeExamen: ExamType;
  libelle: string;
  talk: boolean;
  konnect: boolean;
};

/** Le prix mensuel TTC d'une salle, en centimes, par produit (table `TarifSalle`). */
export type Tarifs = Record<ProduitSalle, number>;

/** Repli si la table des tarifs est illisible : les prix donnés le 02/11/2026. */
export const TARIFS_PAR_DEFAUT: Tarifs = { talk: 32500, konnect: 9500 };

/** Le produit a-t-il au moins une salle cochée ? Sinon il garde l'ancien comportement. */
export function produitActif(lignes: readonly LigneSalle[], produit: ProduitSalle): boolean {
  return lignes.some((l) => l[produit]);
}

function parType(lignes: readonly LigneSalle[]): SallesParType {
  const sortie: SallesParType = {};
  for (const type of EXAM_TYPES) {
    const liste = lignes
      .filter((l) => l.typeExamen === type)
      .map((l) => ({ poste: l.poste, libelle: l.libelle }));
    if (liste.length > 0) sortie[type] = liste;
  }
  return sortie;
}

// ── Talk ────────────────────────────────────────────────────────────────────

export type SallesTalk = {
  /** Les salles que le centre peut choisir, par type : toutes, ou les seules payées. */
  sallesParType: SallesParType;
  /** Au moins une salle a la case Talk : le filtre et les fermetures s'appliquent. */
  actif: boolean;
};

export function sallesTalk(lignes: readonly LigneSalle[]): SallesTalk {
  const actif = produitActif(lignes, "talk");
  return {
    sallesParType: parType(actif ? lignes.filter((l) => l.talk) : lignes),
    actif,
  };
}

/**
 * Les modalités fermées au robot faute de salle payée. Vide quand Talk n'est pas
 * actif. Le Dashboard les envoie à `false` dans `examsAccepted` : le robot transfère
 * avec le motif `exam_type`, par le chemin qui ferme déjà l'IRM de Pontivy.
 */
export function typesFermesTalk(salles: SallesTalk): ExamType[] {
  if (!salles.actif) return [];
  return EXAM_TYPES.filter((t) => (salles.sallesParType[t] ?? []).length === 0);
}

/**
 * `examsAccepted` tel que le robot doit le lire : le réglage du centre, avec les
 * modalités sans salle payée forcées à `false`. Jamais l'inverse : une modalité que le
 * centre a fermée reste fermée, même payée.
 */
export function examsAcceptesEffectifs(
  examsAccepted: unknown,
  salles: SallesTalk
): unknown {
  const fermes = typesFermesTalk(salles);
  if (fermes.length === 0) return examsAccepted;
  const base =
    examsAccepted && typeof examsAccepted === "object" && !Array.isArray(examsAccepted)
      ? { ...(examsAccepted as Record<string, unknown>) }
      : {};
  for (const type of fermes) base[CLE_EXAMS_ACCEPTED[type]] = false;
  return base;
}

/** Les clés de `TalkSettings.examsAccepted`, lues par `getInitInfo.js` du robot. */
export const CLE_EXAMS_ACCEPTED: Record<ExamType, string> = {
  US: "echographie",
  MG: "mammo",
  RX: "radiographie",
  MR: "irm",
  CT: "scanner",
};

/**
 * Les `postes` d'un examen envoyés au robot. Sans salle payée active, l'ancienne règle
 * (`postesValides`) : le choix de l'examen réduit aux salles déclarées, vide = aucun
 * filtre. Talk actif : un choix vide (ou qui ne garde rien de payé) devient toutes les
 * salles payées du type, pour qu'aucun créneau ne tombe dans une salle non payée.
 */
export function postesTalk(
  postesExamen: unknown,
  salles: SallesTalk,
  typeExamen: unknown
): string[] {
  const type = typePourSalles(typeExamen);
  const duType = type ? (salles.sallesParType[type] ?? []).map((s) => s.poste) : [];
  const choisis = Array.isArray(postesExamen)
    ? new Set(postesExamen.map(normaliserPoste).filter(Boolean))
    : new Set<string>();
  const retenus = duType.filter((p) => choisis.has(p));
  if (!salles.actif) return retenus;
  return retenus.length > 0 ? retenus : duType;
}

// ── Konnect ─────────────────────────────────────────────────────────────────

/**
 * La forme que lit déjà le catalogue de Konnect (`postesPourKonnect`). Konnect non
 * actif : rien de déclaré, donc aucun filtre (`[]`), comme avant le chantier. Sans
 * cette garde, un centre qui a déclaré ses salles pour Talk verrait tous ses examens
 * Konnect passer au rappel (« déclarées, aucune ouverte »).
 */
export function sallesKonnect(lignes: readonly LigneSalle[]): SallesKonnect {
  if (!produitActif(lignes, "konnect")) return { sallesParType: {}, ouvertes: [] };
  return {
    sallesParType: parType(lignes),
    ouvertes: lignes.filter((l) => l.konnect).map((l) => l.poste),
  };
}

// ── Facturation ─────────────────────────────────────────────────────────────

export type LigneFacture = {
  codeSite: string | null;
  salles: Record<ProduitSalle, number>;
  montantCts: Record<ProduitSalle, number>;
  totalCts: number;
};

/** Le compte des salles payées d'un client, par site Xplore, et son montant mensuel. */
export function facturer(lignes: readonly LigneSalle[], tarifs: Tarifs): LigneFacture[] {
  const parSite = new Map<string, LigneFacture>();
  for (const l of lignes) {
    if (!l.talk && !l.konnect) continue;
    const cle = l.codeSite ?? "";
    let f = parSite.get(cle);
    if (!f) {
      f = {
        codeSite: l.codeSite,
        salles: { talk: 0, konnect: 0 },
        montantCts: { talk: 0, konnect: 0 },
        totalCts: 0,
      };
      parSite.set(cle, f);
    }
    for (const p of PRODUITS_SALLE) {
      if (!l[p]) continue;
      f.salles[p] += 1;
      f.montantCts[p] += tarifs[p];
      f.totalCts += tarifs[p];
    }
  }
  return [...parSite.values()].sort((a, b) => comparerSites(a.codeSite, b.codeSite));
}

/** Tri des sites : par code, « site non précisé » (nul) en dernier. */
export function comparerSites(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b, "fr");
}

/** « 325 € », « 1 015 € », « 95,50 € ». */
export function euros(cts: number): string {
  return (cts / 100).toLocaleString("fr-FR", {
    minimumFractionDigits: cts % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }) + " €";
}

// ── Écriture ────────────────────────────────────────────────────────────────

export type SalleEcrite = {
  codeSite: string | null;
  poste: string;
  typeExamen: ExamType;
  libelle: string;
  talk: boolean;
  konnect: boolean;
};

const EST_TYPE = new Set<string>(EXAM_TYPES);

/**
 * Validation de la liste complète des salles d'un client, envoyée par l'écran admin.
 * La liste remplace l'ancienne : une salle absente est retirée.
 */
export function validerSalles(brut: unknown): { valeur: SalleEcrite[] } | { erreur: string } {
  if (!Array.isArray(brut)) return { erreur: "La liste des salles est mal formée. Rechargez la page." };
  const sortie: SalleEcrite[] = [];
  for (const s of brut) {
    const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const poste = normaliserPoste(o.poste);
    if (!poste) return { erreur: "Une salle n'a pas de code. Saisissez le code du poste, ou retirez la ligne." };
    if (poste.length > 40) return { erreur: `Le code ${poste} est trop long (40 caractères au plus).` };
    if (sortie.some((x) => x.poste === poste)) {
      return { erreur: `La salle ${poste} apparaît deux fois. Gardez-en une.` };
    }
    const type = typeof o.typeExamen === "string" ? o.typeExamen.trim().toUpperCase() : "";
    if (!EST_TYPE.has(type)) {
      return { erreur: `Choisissez la modalité de la salle ${poste}.` };
    }
    const libelle = typeof o.libelle === "string" ? o.libelle.trim() : "";
    if (!libelle) return { erreur: `Donnez un nom à la salle ${poste}.` };
    if (libelle.length > LIBELLE_SALLE_MAX) {
      return { erreur: `Le nom de la salle ${poste} dépasse ${LIBELLE_SALLE_MAX} caractères.` };
    }
    const codeSite =
      typeof o.codeSite === "string" && o.codeSite.trim() ? o.codeSite.trim().toUpperCase() : null;
    if (codeSite && codeSite.length > 20) return { erreur: `Le code site ${codeSite} est trop long.` };
    sortie.push({
      codeSite,
      poste,
      typeExamen: type as ExamType,
      libelle,
      talk: o.talk === true,
      konnect: o.konnect === true,
    });
  }
  return { valeur: sortie };
}

/** Validation d'un prix saisi en euros (« 325 », « 95,50 ») → centimes. */
export function centimesDepuisSaisie(v: unknown): number | null {
  const texte = typeof v === "number" ? String(v) : typeof v === "string" ? v : "";
  const n = Number(texte.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100000) return null;
  return Math.round(n * 100);
}
