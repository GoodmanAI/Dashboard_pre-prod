/**
 * Tester les créneaux d'un examen : ce que le robot enverrait et ce qu'il garderait.
 * -----------------------------------------------------------------------------
 * Module PUR, importable par la route comme par l'écran. Plan
 * `plans/2026-10-tester-les-creneaux-depuis-le-dashboard.md` (28/10/2026).
 *
 * ⚠️ COPIES DE RÈGLES DU ROBOT, sans package partagé. Un changement de l'une d'elles
 * dans LyraeTalk doit toucher ce fichier, et inversement (commentaire posé là-bas) :
 *   - codes envoyés à Xplore : `getExamCodes.js` (code client, sinon code injecté ;
 *     type client, sinon type du référentiel) ;
 *   - sites interrogés : `retrieveSlots.js` (`site.risCode[rdv.internal_type]`, appel
 *     au premier, créneaux du groupe seulement : fait par AI2Xplore) ;
 *   - salles : `getExamCodes.js` + `sallesCreneaux.js` (salle imposée, sinon `postes`
 *     de l'examen réduits aux salles déclarées du type, vide = toutes).
 *
 * Ce que le test ne reproduit PAS, assumé (T5) : le délai minimum avant un créneau
 * (`getExamMinDelay.js`) et la préférence de centre.
 */

import { normaliserPoste, postesValides, sallesDuType, typePourSalles, type SallesParType } from "@/lib/sallesExamen";

export type LigneMapping = {
  codeExamen?: unknown;
  typeExamen?: unknown;
  libelle?: unknown;
  libelleClient?: unknown;
  typeExamenClient?: unknown;
  codeExamenClient?: unknown;
  codeExamenClientInject?: unknown;
  performed?: unknown;
  postes?: unknown;
};

const texte = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Les lignes enregistrées, que `TalkSettings.exams` soit un tableau ou un objet. */
export function lignesEnregistrees(exams: unknown): LigneMapping[] {
  const brut = typeof exams === "string" ? safeJson(exams) : exams;
  if (Array.isArray(brut)) return brut.filter((l) => l && typeof l === "object");
  if (brut && typeof brut === "object") {
    return Object.entries(brut as Record<string, any>).map(([code, l]) => ({ ...l, codeExamen: l?.codeExamen ?? code }));
  }
  return [];
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Règle de `getExamCodes.js`. `null` quand la ligne n'a aucun code client. */
export function codesEnvoyes(ligne: LigneMapping): { typeExamen: string; codeExamen: string; injecte: boolean } | null {
  const client = texte(ligne.codeExamenClient);
  const injecte = texte(ligne.codeExamenClientInject);
  const codeExamen = client || injecte;
  if (!codeExamen) return null;
  const typeExamen = texte(ligne.typeExamenClient) || texte(ligne.typeExamen);
  return { typeExamen, codeExamen, injecte: !client };
}

/** La clé de `risCode` : le type robot de l'examen (`USMAM` → `US`, comme les salles). */
export function typeRobot(typeExamen: unknown): string {
  return typePourSalles(typeExamen) ?? texte(typeExamen).toUpperCase();
}

export type SourceSites = "reglage" | "identifiants";

/**
 * Les sites que le robot interroge pour ce type.
 *
 * `talk.site.risCode` est fusionné type par type par-dessus une table codée dans le
 * robot (`getInitInfo.js`), que le Dashboard ne voit pas. Quand le réglage porte le
 * type, c'est la vérité, y compris une liste vide (type fermé au robot). Sinon on se
 * replie sur les codes de l'écran « Identifiants externes », juste pour un centre
 * mono-site, approchés pour un groupe : la source est rendue pour le dire.
 */
export function sitesDuType(
  risCode: unknown,
  type: string,
  identifiants: string[]
): { codes: string[]; source: SourceSites } | { codes: []; source: "reglage"; ferme: true } | null {
  if (risCode && typeof risCode === "object" && !Array.isArray(risCode)) {
    const liste = (risCode as Record<string, unknown>)[type];
    if (Array.isArray(liste)) {
      const codes = [...new Set(liste.map((c) => texte(c).toUpperCase()).filter(Boolean))];
      if (codes.length === 0) return { codes: [], source: "reglage", ferme: true };
      return { codes, source: "reglage" };
    }
  }
  const codes = [...new Set(identifiants.map((c) => texte(c).toUpperCase()).filter(Boolean))];
  return codes.length > 0 ? { codes, source: "identifiants" } : null;
}

/** Salles du robot pour cet examen : `[]` = toutes. */
export function sallesRetenues(
  ligne: LigneMapping,
  salles: SallesParType,
  exceptions: { codeExamen: string; poste: string }[]
): { postes: string[]; imposee: string | null } {
  const code = texte(ligne.codeExamen);
  const regle = exceptions.find((e) => e.codeExamen === code);
  const imposee = regle ? normaliserPoste(regle.poste) || null : null;
  if (imposee) return { postes: [imposee], imposee };
  return { postes: postesValides(ligne.postes, salles, ligne.typeExamen), imposee: null };
}

/** `{ CHKRX2: "R2" }` : le nom que le centre donne à ses salles du type. */
export function libellesDesSalles(salles: SallesParType, typeExamen: unknown): Record<string, string> {
  const sortie: Record<string, string> = {};
  for (const s of sallesDuType(salles, typeExamen)) sortie[s.poste] = s.libelle || s.poste;
  return sortie;
}

// ── Ce que rend AI2Xplore (`POST /api/test/creneaux`, contrat d'AI2Xplore) ──────
export type CreneauXplore = { id: unknown; date: string; heure: string; codeSite: string; poste: string };
export type ResultatAi2x = {
  etat: "ok" | "aucun" | "refus" | "panne" | "site_inconnu";
  motifs: string[];
  codeSiteInterroge: string | null;
  sitesInconnus: string[];
  total?: number;
  horsGroupe?: number;
  parSite?: Record<string, number>;
  fenetre?: {
    type: "deux_semaines" | "premiers";
    jusquau: string;
    creneaux: CreneauXplore[];
    tronque: boolean;
    dansLaFenetre: number;
  };
};

export type CreneauMarque = CreneauXplore & { propose: boolean };

/** Même règle que `filtrerParPostes` du robot. */
export function marquer(creneaux: CreneauXplore[], postes: string[]): CreneauMarque[] {
  const autorises = new Set(postes.map(normaliserPoste).filter(Boolean));
  return creneaux.map((c) => ({
    ...c,
    propose: autorises.size === 0 || autorises.has(normaliserPoste(c.poste)),
  }));
}

// ── Ce que la route rend à l'écran ───────────────────────────────────────────
export type EtatTest =
  | "ok" // des créneaux, au moins un proposé
  | "tous_ecartes" // des créneaux, aucun dans une salle retenue
  | "aucun" // Xplore accepte l'examen, rien d'ouvert
  | "refus" // Xplore refuse type ou code
  | "panne" // Xplore injoignable
  | "injoignable" // le tunnel ou AI2Xplore ne répond pas
  | "site_inconnu" // code site inconnu de la passerelle
  | "sans_site" // aucun code Xplore pour le centre
  | "type_ferme" // risCode[type] vide : le robot ne prend pas ce type
  | "sans_code" // la ligne n'a aucun code client
  | "non_enregistre"; // la ligne n'est pas dans le mapping enregistré

export type ReponseTest = {
  etat: EtatTest;
  examen?: { codeExamen: string; libelle: string; typeEnvoye: string; codeEnvoye: string; injecte: boolean; pratique: boolean };
  sites?: { codes: string[]; source: SourceSites; interroge: string | null; inconnus: string[]; parSite: Record<string, number> };
  salles?: { postes: string[]; imposee: string | null; libelles: Record<string, string> };
  fenetre?: { type: "deux_semaines" | "premiers"; jusquau: string; tronque: boolean; dansLaFenetre: number };
  creneaux?: CreneauMarque[];
  proposes?: number;
  motifs?: string[];
};

/** Combine la réponse d'AI2Xplore et les salles en un état pour l'écran. */
export function etatFinal(r: ResultatAi2x, postes: string[]): Pick<ReponseTest, "etat" | "creneaux" | "proposes" | "fenetre" | "motifs"> {
  if (r.etat !== "ok" || !r.fenetre) {
    return { etat: r.etat === "ok" ? "aucun" : r.etat, motifs: r.motifs ?? [] };
  }
  const creneaux = marquer(r.fenetre.creneaux ?? [], postes);
  const proposes = creneaux.filter((c) => c.propose).length;
  const { creneaux: _c, ...fenetre } = r.fenetre;
  return {
    etat: proposes === 0 ? "tous_ecartes" : "ok",
    creneaux,
    proposes,
    fenetre,
    motifs: [],
  };
}
