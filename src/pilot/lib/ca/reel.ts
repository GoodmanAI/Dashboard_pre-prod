import type { Compteurs } from "./compteurs";
import type { FormationCa } from "@/pilot/lib/facturation/calendrier";
import { contratCompteLeMois, decalerMois, debutContrat, factureeUneFois, type ContratProjection } from "./projeter";

/**
 * Le réel d'un mois, calcul pur (ARCHITECTURE §8.9). Aucun accès à la base ni à
 * l'horloge : `figerMois` et `moisCourant` lui passent les contrats, les
 * rattachements et les compteurs lus par l'adaptateur. Les contrats comptés le
 * sont par `contratCompteLeMois`, la règle même de la projection (C-45).
 */
export type Unite = keyof Compteurs;
export type LigneContratReel = {
  /** null : ligne hors catalogue (lot S), comptée sous le produit `0` de la clé. */
  id: number; productId: number | null; centreId: number | null;
  /** PRESTATION (lot S) : comptée au début, dans `miseEnServiceCentimes`, comme une installation. */
  type: "ABONNEMENT" | "MISE_EN_SERVICE" | "PART_VARIABLE" | "PRESTATION";
  montantCentimes: number; unite: Unite | null; volumeInclus: number | null;
};
export type ContratReel = Pick<ContratProjection, "statut" | "debuteLe" | "signeLe" | "termineLe"> & {
  organisationId: number; lignes: LigneContratReel[];
};
/** Un centre rattaché à un accès Dashboard : seule source des compteurs. */
export type RattachementReel = { organisationId: number; productId: number; centreId: number; userProductId: number };
export type LigneReel = {
  cle: string; mois: Date; organisationId: number; productId: number | null; centreId: number | null;
  /** Les montants facturés une fois ce mois : installations et prestations (lot S). */
  recurrentCentimes: number; variableCentimes: number; miseEnServiceCentimes: number;
  volumeVariable: number | null; uniteVariable: Unite | null;
};

export const MOTIF_SMS = "Compteur de SMS non disponible";
export const MOTIF_SANS_UNITE = "Part variable sans unité";
export const MOTIF_SANS_PRODUIT = "Part à l'usage hors catalogue : aucun compteur ne la mesure";

/** « 2026-10 » : le mois UTC, tel que l'écrivent la clé, le cron et l'export. */
export function moisIso(mois: Date): string {
  return decalerMois(mois, 0).toISOString().slice(0, 7);
}
/**
 * Clé sans le mois : ce qui relie un mois figé à une ligne de contrat. Une ligne
 * sans produit (lot S) a le produit `0`, comme une ligne sans centre.
 */
export function cleLigne(organisationId: number, productId: number | null, centreId: number | null): string {
  return `${organisationId}|${productId ?? 0}|${centreId ?? 0}`;
}
/** Clé unique de CrmCaMensuel (§3.3), indépendante d'un NULL. */
export function cleCa(mois: Date, organisationId: number, productId: number | null, centreId: number | null): string {
  return `${moisIso(mois)}|${cleLigne(organisationId, productId, centreId)}`;
}

type Cumul = LigneReel & { unites: Set<Unite>; volumes: Array<number | null> };

/**
 * `volumeProjete` sert au mois en cours : le volume, et non le montant, est porté
 * à fin de mois avant de retirer le volume inclus (§8.9). Sans lui, le volume
 * compté est le volume réel.
 */
export function reelDuMois(p: {
  mois: Date; contrats: ContratReel[]; rattachements: RattachementReel[]; usage: Map<number, Compteurs>;
  formations?: Array<FormationCa & { organisationId: number }>;
  volumeProjete?: (volume: number) => number;
}): { lignes: LigneReel[]; motifs: string[] } {
  const mois = decalerMois(p.mois, 0);
  const cumuls = new Map<string, Cumul>();
  const motifs = new Set<string>();
  // Volume d'une unité sur les accès de l'organisation pour ce produit, et pour
  // ce centre seulement quand la ligne en désigne un. null : compteur absent.
  function volume(unite: Unite, organisationId: number, productId: number, centreId: number | null): number | null {
    let total = 0;
    for (const r of p.rattachements) {
      if (r.organisationId !== organisationId || r.productId !== productId || (centreId !== null && r.centreId !== centreId)) continue;
      const compteurs = p.usage.get(r.userProductId);
      if (!compteurs) continue;
      const compte = compteurs[unite];
      if (compte === null) return null;
      total += compte;
    }
    return total;
  }
  for (const c of p.contrats) {
    if (!contratCompteLeMois(c, mois)) continue;
    const moisDeDebut = +decalerMois(debutContrat(c)!, 0) === +mois;
    for (const l of c.lignes) {
      // Une prestation hors de son mois n'ouvre pas de clé : seule sur sa clé, elle n'écrirait qu'une ligne à zéro.
      if (l.type === "PRESTATION" && !moisDeDebut) continue;
      const cle = cleCa(mois, c.organisationId, l.productId, l.centreId);
      const cumul: Cumul = cumuls.get(cle) ?? { cle, mois, organisationId: c.organisationId, productId: l.productId, centreId: l.centreId,
        recurrentCentimes: 0, variableCentimes: 0, miseEnServiceCentimes: 0, volumeVariable: null, uniteVariable: null,
        unites: new Set(), volumes: [] };
      cumuls.set(cle, cumul);
      if (l.type === "ABONNEMENT") cumul.recurrentCentimes += l.montantCentimes;
      if (factureeUneFois(l.type) && moisDeDebut) cumul.miseEnServiceCentimes += l.montantCentimes;
      if (l.type !== "PART_VARIABLE") continue;
      if (l.unite === null) { motifs.add(MOTIF_SANS_UNITE); continue; }
      if (l.productId === null) { motifs.add(MOTIF_SANS_PRODUIT); continue; }
      const reel = volume(l.unite, c.organisationId, l.productId, l.centreId);
      const v = reel === null || !p.volumeProjete ? reel : p.volumeProjete(reel);
      cumul.unites.add(l.unite); cumul.volumes.push(v);
      if (v === null) { if (l.unite === "SMS_ENVOYE") motifs.add(MOTIF_SMS); continue; }
      cumul.variableCentimes += Math.max(0, v - (l.volumeInclus ?? 0)) * l.montantCentimes;
    }
  }
  for (const f of p.formations ?? []) {
    if (f.montantCentimes === null || +decalerMois(f.debuteLe, 0) !== +mois) continue;
    const cle = cleCa(mois, f.organisationId, null, null);
    const cumul: Cumul = cumuls.get(cle) ?? { cle, mois, organisationId: f.organisationId, productId: null, centreId: null,
      recurrentCentimes: 0, variableCentimes: 0, miseEnServiceCentimes: 0, volumeVariable: null, uniteVariable: null, unites: new Set(), volumes: [] };
    cumul.miseEnServiceCentimes += f.montantCentimes;
    cumuls.set(cle, cumul);
  }
  const lignes = [...cumuls.values()].map(({ unites, volumes, ...ligne }) => {
    // Même clé et même unité : même périmètre, donc le même volume. Deux unités
    // sur une clé ne s'additionnent pas : limite connue tant que Q1 est ouverte.
    const unique = unites.size === 1 ? [...unites][0] : null;
    return { ...ligne, uniteVariable: unique, volumeVariable: unique === null ? null : volumes[0] };
  }).sort((a, b) => a.organisationId - b.organisationId || (a.productId ?? 0) - (b.productId ?? 0) || (a.centreId ?? 0) - (b.centreId ?? 0));
  for (const l of lignes) if (!Number.isSafeInteger(l.variableCentimes)) throw new Error("Part variable hors des entiers sûrs.");
  return { lignes, motifs: [...motifs] };
}

export function totalLigne(l: Pick<LigneReel, "recurrentCentimes" | "variableCentimes" | "miseEnServiceCentimes">): number {
  return l.recurrentCentimes + l.variableCentimes + l.miseEnServiceCentimes;
}

/** Moyenne entière, arrondie au centime le plus proche, demis vers le haut. */
export function moyenneEntiere(valeurs: number[]): number {
  if (!valeurs.length) return 0;
  const somme = valeurs.reduce((a, b) => a + BigInt(b), 0n);
  const n = BigInt(valeurs.length);
  const double = somme * 2n;
  return Number(double >= 0n ? (double + n) / (2n * n) : -((-double + n) / (2n * n)));
}

export type VariableFigee = { mois: Date; organisationId: number; productId: number | null; centreId: number | null; variableCentimes: number };
/**
 * Moyenne de la part variable sur les `nbMois` derniers mois figés (§8.8), par
 * clé (organisation, produit, centre). Une clé absente d'un de ces mois n'y est
 * pas comptée : la moyenne porte sur ses mois figés disponibles, un à trois.
 */
export function moyenneDesMoisFiges(figees: VariableFigee[], nbMois = 3): { parCle: Map<string, number>; mois: Date[] } {
  const retenus = [...new Set(figees.map((f) => +decalerMois(f.mois, 0)))].sort((a, b) => b - a).slice(0, nbMois);
  const valeurs = new Map<string, number[]>();
  for (const f of figees) {
    if (!retenus.includes(+decalerMois(f.mois, 0))) continue;
    const cle = cleLigne(f.organisationId, f.productId, f.centreId);
    valeurs.set(cle, [...valeurs.get(cle) ?? [], f.variableCentimes]);
  }
  return { parCle: new Map([...valeurs].map(([cle, v]) => [cle, moyenneEntiere(v)])),
    mois: retenus.sort((a, b) => a - b).map((t) => new Date(t)) };
}
/**
 * La moyenne d'une clé va à la première ligne PART_VARIABLE (identifiant le plus
 * petit) des contrats comptés ce mois-ci : une clé ne compte qu'une fois dans la
 * projection, même si plusieurs lignes la portent.
 */
export function variableParLigne(contrats: Array<Omit<ContratReel, "lignes"> & {
  lignes: Array<Pick<LigneContratReel, "id" | "type" | "productId" | "centreId">>;
}>, moyennes: Map<string, number>, mois: Date): Map<number, number> {
  const lignes = contrats.filter((c) => contratCompteLeMois(c, mois))
    .flatMap((c) => c.lignes.filter((l) => l.type === "PART_VARIABLE").map((l) => ({ ...l, cle: cleLigne(c.organisationId, l.productId, l.centreId) })))
    .sort((a, b) => a.id - b.id);
  const resultat = new Map<number, number>();
  const servies = new Set<string>();
  for (const l of lignes) {
    const moyenne = moyennes.get(l.cle);
    if (moyenne === undefined || servies.has(l.cle)) continue;
    servies.add(l.cle); resultat.set(l.id, moyenne);
  }
  return resultat;
}
