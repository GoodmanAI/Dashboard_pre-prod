import type { DonneesCa, ScenarioCa } from "./donnees";
import { decalerMois, projeter } from "./projeter";

export type ChoixScenario = ScenarioCa["opportunites"];
export function chargerChoix(opportunites: DonneesCa["opportunites"], scenario?: ScenarioCa): ChoixScenario {
  const enregistrees = new Map(scenario?.opportunites.map((o) => [o.opportuniteId, o]));
  return opportunites.map((o) => enregistrees.get(o.id) ?? { opportuniteId: o.id, cochee: true, demarrageDecaleLe: null });
}
export function signatureChoix(choix: ChoixScenario): string {
  return JSON.stringify([...choix].sort((a, b) => a.opportuniteId - b.opportuniteId)
    .map((o) => [o.opportuniteId, o.cochee, o.demarrageDecaleLe]));
}
export function projectionDepuisDonnees(d: DonneesCa, choix: ChoixScenario, moisDepart: Date, nbMois = 24) {
  const date = (s: string | null) => s === null ? null : new Date(s);
  return projeter({
    formations: d.formations.map((f) => ({ ...f, debuteLe: new Date(f.debuteLe) })),
    contrats: d.contrats.map((c) => ({ ...c, debuteLe: date(c.debuteLe), signeLe: date(c.signeLe), termineLe: date(c.termineLe) })),
    opportunites: d.opportunites.map((o) => ({ ...o, demarrageAttenduLe: date(o.demarrageAttenduLe), gagneeLe: date(o.gagneeLe), perdueLe: date(o.perdueLe) })),
    scenario: { cochees: new Set(choix.filter((o) => o.cochee).map((o) => o.opportuniteId)),
      decalages: new Map(choix.flatMap((o) => o.demarrageDecaleLe ? [[o.opportuniteId, new Date(o.demarrageDecaleLe)] as const] : [])) },
    variableMensuelleParLigne: new Map(d.variableMensuelleParLigne), moisDepart, nbMois,
  });
}
/** Écart rapporté à la base, en pour-mille entier arrondi ; null sans base. */
export function pourMille(ecart: number, base: number): number | null {
  if (base === 0) return null;
  const n = BigInt(ecart) * 2000n, b = BigInt(Math.abs(base));
  const arrondi = (n >= 0n ? n + b : n - b) / (2n * b);
  return Number(base < 0 ? -arrondi : arrondi);
}
export type LigneComparaison = { mois: string; reel: number; projete: number; ecart: number; ecartPourMille: number | null };
/**
 * Le réel figé de chaque mois contre la projection pondérée du scénario,
 * rejouée sur l'état actuel des contrats et des opportunités à partir du
 * premier mois figé. Pur : le navigateur le recalcule à chaque coche.
 */
export function comparaisonAuReel(d: DonneesCa, choix: ChoixScenario): LigneComparaison[] {
  if (!d.reel.length) return [];
  const premier = decalerMois(new Date(d.reel[0].mois), 0);
  const dernier = new Date(d.reel[d.reel.length - 1].mois);
  const nbMois = (dernier.getUTCFullYear() - premier.getUTCFullYear()) * 12 + dernier.getUTCMonth() - premier.getUTCMonth() + 1;
  const projete = new Map(projectionDepuisDonnees(d, choix, premier, nbMois).map((m) => [m.mois.toISOString(), m.pondere]));
  return d.reel.map((r) => {
    const p = projete.get(r.mois) ?? 0;
    return { mois: r.mois, reel: r.totalCentimes, projete: p, ecart: r.totalCentimes - p, ecartPourMille: pourMille(r.totalCentimes - p, p) };
  });
}
