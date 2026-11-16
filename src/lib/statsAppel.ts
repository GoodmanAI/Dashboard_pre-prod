/**
 * Calcul des statistiques d'appels de LyraeTalk (16/11/2026).
 *
 * Sorti tel quel de l'écran `talk/stats_appel/Ecran.tsx`, qui téléchargeait chaque ligne
 * d'appel des deux périodes (plusieurs Mo pour 30 jours) pour faire ces calculs dans le
 * navigateur. Ils tournent désormais sur le serveur (`GET /api/stats-appel`), qui ne renvoie
 * que les résultats. Les règles ne changent pas : mêmes fonctions de `transferReasons`,
 * `hangupContext` et `languages`, mêmes comptes.
 *
 * Ce qui dépend du réglage du centre (libellés d'examen, filtre par type d'examen) reste dans
 * l'écran, à partir des agrégats `examens`, `typesVus` et `codesExamen`.
 *
 * Seul écart voulu : les heures et les jours de la semaine (cartes de chaleur, activité par
 * heure) sont lus en heure de Paris. Avant, le navigateur les lisait dans son propre fuseau,
 * qui est celui de Paris pour nos clients.
 *
 * Plan : `plans/2026-11-chargements-dashboard.md`.
 */
import {
  CATEGORY_ORDER,
  TransferCategory,
  estDemandeDeResultats,
  estExamenNonPris,
  estUnTransfert,
  getTransferMeta,
  isCounterTransfer,
} from "@/lib/transferReasons";
import { getLanguageMeta, LanguageCode } from "@/lib/languages";
import { getHangupContext, HangupContextKey } from "@/lib/hangupContext";
import { computeFunnel, AggregatedFunnel } from "@/lib/callFunnel";

/** Une ligne d'appel telle que la lit la route : `createdAt` et `stats` suffisent. */
export type LigneAppel = { createdAt: Date | string; stats: any };

export const RESO_KEYS = ["rdv", "info", "modification", "annulation", "urgence"] as const;
export type ResoKey = (typeof RESO_KEYS)[number];

export function normalizeReso(call: any): ResoKey | "autre" {
  const s = call?.stats;
  const intents: unknown[] = Array.isArray(s?.intents) ? s.intents : [];
  if (s?.rdv_booked != 0) return "rdv";
  if (intents.includes("renseignements")) return "info";
  if (intents.includes("modification_rdv")) return "modification";
  if (intents.includes("annulation_rdv")) return "annulation";
  if (s?.emergency == true) return "urgence";
  return "autre";
}

const nombre = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Les indicateurs des tuiles, calculés aussi sur la période précédente (deltas). */
export type IndicateursAppels = {
  totalAppels: number;
  nbRDV: number;
  nbUrgence: number;
  nbInfo: number;
  indicePerformance: number;
  /** Appels en erreur de logique (dénominateur de l'indice, pour additionner des centres). */
  erreurs: number;
  heuresSec: number;
  annulation: number;
  modification: number;
  notPerformed: number;
  radioInter: number;
  noSlotApi: number;
  confirmRDV: number;
  nbTransferts: number;
  resultats: number;
};

export function calculerIndicateurs(calls: LigneAppel[]): IndicateursAppels {
  const r: IndicateursAppels = {
    totalAppels: calls.length,
    nbRDV: 0,
    nbUrgence: 0,
    nbInfo: 0,
    indicePerformance: 0,
    erreurs: 0,
    heuresSec: 0,
    annulation: 0,
    modification: 0,
    notPerformed: 0,
    radioInter: 0,
    noSlotApi: 0,
    confirmRDV: 0,
    nbTransferts: 0,
    resultats: 0,
  };
  let erreursLogiques = 0;
  for (const c of calls) {
    const s = c?.stats ?? {};
    r.nbRDV += nombre(s.rdv_booked);
    const reso = normalizeReso(c);
    if (reso === "urgence") r.nbUrgence++;
    if (reso === "info") r.nbInfo++;
    if (s.error_logic && s.error_logic > 0) erreursLogiques++;
    r.heuresSec += Number(s.duration ?? 0) || 0;
    r.annulation += nombre(s.rdv_canceled);
    r.modification += nombre(s.rdv_modified);
    if (estExamenNonPris(s)) r.notPerformed++;
    if (s.transferReason == "exam_interv") r.radioInter++;
    if (s.no_slot_api_retrieve) r.noSlotApi++;
    if (s.rdv_status === "confirmed") r.confirmRDV++;
    if (isCounterTransfer(s)) r.nbTransferts++;
    if (estDemandeDeResultats(s)) r.resultats++;
  }
  r.erreurs = erreursLogiques;
  r.indicePerformance = indiceDePerformance(calls.length, erreursLogiques);
  return r;
}

/** Indice de performance : part des appels sans erreur de logique, arrondie vers le bas. */
export function indiceDePerformance(total: number, erreurs: number): number {
  return total === 0 ? 0 : Math.floor((1 - erreurs / total) * 100);
}

/* ===== Heure de Paris ===== */

const PARIS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris",
  weekday: "short",
  hour: "2-digit",
  hourCycle: "h23",
});
const JOURS: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** Jour (lundi = 0) et heure d'un instant, à Paris. */
function jourHeureParis(d: Date): { jour: number; heure: number } {
  let jour = 0;
  let heure = 0;
  for (const p of PARIS.formatToParts(d)) {
    if (p.type === "weekday") jour = JOURS[p.value] ?? 0;
    else if (p.type === "hour") heure = Number(p.value) % 24;
  }
  return { jour, heure };
}

export type CarteChaleur = { matrix: number[][]; max: number; total: number };

function carteVide(): CarteChaleur {
  return { matrix: Array.from({ length: 7 }, () => Array(24).fill(0)), max: 0, total: 0 };
}
function compter(carte: CarteChaleur, jour: number, heure: number) {
  carte.matrix[jour][heure]++;
  carte.total++;
  if (carte.matrix[jour][heure] > carte.max) carte.max = carte.matrix[jour][heure];
}

/** Tout ce que l'écran affiche pour la période demandée. */
export type StatsAppels = {
  indicateurs: IndicateursAppels;
  cartes: { calls: CarteChaleur; rdv: CarteChaleur; planning: CarteChaleur; transfer: CarteChaleur };
  /** Examens des RDV pris : codes bruts (libellés posés par l'écran) et nombre de RDV. */
  examens: { codes: string[]; rdv: number }[];
  /** Types d'examen vus sur la période (`stats.exam_type_id`). */
  typesVus: string[];
  /** RDV pris par code d'examen, avec leurs types : l'écran filtre par type choisi. */
  codesExamen: { types: string[]; code: string; n: number }[];
  transferts: Record<TransferCategory, number>;
  raisonsTransfert: { reason: string; label: string; category: TransferCategory; count: number }[];
  langues: { code: LanguageCode; count: number }[];
  raccrochages: { cle: HangupContextKey; count: number }[];
  /** Raccrochages expliqués (dénominateur des pourcentages). */
  raccrochagesTotal: number;
  resolutions: Record<ResoKey | "autre", number>;
  /** Sept derniers jours (jour UTC, comme avant) : total et transferts. */
  histogramme: { jour: string; total: number; redirect: number }[];
  /** Appels par heure de Paris, sur la période (l'écran divise par le nombre de jours). */
  parHeure: number[];
  /** Durée cumulée et nombre d'appels par intention (durée moyenne). */
  dureesParIntention: Record<ResoKey, { total: number; n: number }>;
};

export function calculerStatsAppels(calls: LigneAppel[], maintenant = new Date()): StatsAppels {
  const cartes = {
    calls: carteVide(),
    rdv: carteVide(),
    planning: carteVide(),
    transfer: carteVide(),
  };
  const examens = new Map<string, { codes: string[]; rdv: number }>();
  const typesVus = new Set<string>();
  const codesExamen = new Map<string, { types: string[]; code: string; n: number }>();
  const transferts = Object.fromEntries(
    [...CATEGORY_ORDER, "non_transfert", "autre"].map((k) => [k, 0]),
  ) as Record<TransferCategory, number>;
  const raisons = new Map<string, { reason: string; label: string; category: TransferCategory; count: number }>();
  const langues = new Map<LanguageCode, number>();
  const raccrochages = new Map<HangupContextKey, number>();
  let raccrochagesTotal = 0;
  const resolutions: Record<ResoKey | "autre", number> = {
    rdv: 0, info: 0, modification: 0, annulation: 0, urgence: 0, autre: 0,
  };
  const parHeure = Array.from({ length: 24 }, () => 0);
  const durees: Record<ResoKey, { total: number; n: number }> = {
    rdv: { total: 0, n: 0 },
    info: { total: 0, n: 0 },
    modification: { total: 0, n: 0 },
    annulation: { total: 0, n: 0 },
    urgence: { total: 0, n: 0 },
  };

  // Histogramme : les sept derniers jours, clé UTC comme le faisait l'écran.
  const jourCle = (d: Date) => d.toISOString().slice(0, 10);
  const histo = new Map<string, { total: number; redirect: number }>();
  for (let i = 6; i >= 0; i--) {
    histo.set(jourCle(new Date(maintenant.getTime() - i * 86_400_000)), { total: 0, redirect: 0 });
  }

  for (const c of calls) {
    const s = c?.stats ?? {};
    const quand = c?.createdAt ? new Date(c.createdAt) : null;

    if (quand) {
      const { jour, heure } = jourHeureParis(quand);
      compter(cartes.calls, jour, heure);
      if (Number(s.rdv_booked ?? 0) > 0) compter(cartes.rdv, jour, heure);
      if (s.no_slot_api_retrieve) compter(cartes.planning, jour, heure);
      if (isCounterTransfer(s)) compter(cartes.transfer, jour, heure);
      parHeure[heure]++;
      const h = histo.get(jourCle(quand));
      if (h) {
        h.total++;
        if (estUnTransfert(s)) h.redirect++;
      }
    }

    // Examens des RDV pris.
    const rawExam = s.exam_type_id;
    const rdv = Number(s.rdv_booked ?? 0);
    if (rawExam && rdv !== 0) {
      const codes = (Array.isArray(rawExam) ? rawExam : [rawExam]).map(String);
      const cle = codes.join(" ");
      const e = examens.get(cle);
      if (e) e.rdv += rdv;
      else examens.set(cle, { codes, rdv });
    }
    if (rawExam) for (const t of Array.isArray(rawExam) ? rawExam : [rawExam]) typesVus.add(String(t));

    // Codes d'examen des RDV pris, avec leurs types (filtre de l'écran).
    const examCode = s.exam_code;
    if (rawExam && examCode && rdv !== 0) {
      const types = (Array.isArray(rawExam) ? rawExam : [rawExam]).map(String);
      for (const code of Array.isArray(examCode) ? examCode : [examCode]) {
        const cle = `${types.join("\u0001")}\u0002${code}`;
        const e = codesExamen.get(cle);
        if (e) e.n++;
        else codesExamen.set(cle, { types, code: String(code), n: 1 });
      }
    }

    // Transferts.
    if (isCounterTransfer(s)) {
      const meta = getTransferMeta(s.transferReason);
      transferts[meta.category]++;
      const reason = s.transferReason as string | undefined;
      if (reason) {
        const r = raisons.get(reason);
        if (r) r.count++;
        else raisons.set(reason, { reason, label: meta.label, category: meta.category, count: 1 });
      }
    }

    // Langue.
    const lang = getLanguageMeta((s.language as string | undefined) ?? "fr");
    langues.set(lang.code, (langues.get(lang.code) ?? 0) + 1);

    // Raccrochages.
    const ctx = getHangupContext(s);
    if (ctx) {
      raccrochagesTotal++;
      raccrochages.set(ctx.key, (raccrochages.get(ctx.key) ?? 0) + 1);
    }

    // Intention et durée.
    const reso = normalizeReso(c);
    resolutions[reso]++;
    if (reso !== "autre") {
      durees[reso].total += Number(s.duration ?? 0) || 0;
      durees[reso].n += 1;
    }
  }

  return {
    indicateurs: calculerIndicateurs(calls),
    cartes,
    examens: [...examens.values()],
    typesVus: [...typesVus],
    codesExamen: [...codesExamen.values()],
    transferts,
    raisonsTransfert: [...raisons.values()].sort((a, b) => b.count - a.count).slice(0, 12),
    langues: [...langues.entries()].map(([code, count]) => ({ code, count })),
    raccrochages: [...raccrochages.entries()].map(([cle, count]) => ({ cle, count })),
    raccrochagesTotal,
    resolutions,
    histogramme: [...histo.entries()].map(([jour, v]) => ({ jour, ...v })),
    parHeure,
    dureesParIntention: durees,
  };
}

/**
 * Carte d'un centre de la vue d'ensemble admin (`/admin/overview`) : ses chiffres, ses
 * appels par jour (clé UTC, comme avant) et par heure de Paris, et son entonnoir. Avant,
 * la page recevait chaque ligne d'appel de chaque centre.
 */
export type ApercuCentre = {
  indicateurs: IndicateursAppels;
  parJour: Record<string, number>;
  parHeure: number[];
  entonnoir: AggregatedFunnel | null;
};

export function calculerApercu(calls: LigneAppel[]): ApercuCentre {
  const parJour: Record<string, number> = {};
  const parHeure = Array.from({ length: 24 }, () => 0);
  for (const c of calls) {
    if (!c?.createdAt) continue;
    const quand = new Date(c.createdAt);
    const iso = quand.toISOString().slice(0, 10);
    parJour[iso] = (parJour[iso] ?? 0) + 1;
    parHeure[jourHeureParis(quand).heure]++;
  }
  return {
    indicateurs: calculerIndicateurs(calls),
    parJour,
    parHeure,
    entonnoir: computeFunnel(calls),
  };
}
