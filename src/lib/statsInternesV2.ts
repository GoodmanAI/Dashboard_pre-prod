/**
 * Agrégation des `stats.internal` en version 2 (LyraeTalk v2.62.0, 29/10/2026).
 *
 * Plan `2026-10-analyse-stats-internes.md` du workspace, point F. LyraeTalk n'écrit plus
 * que des sommes et des comptes ; on agrège donc en repartant des sommes, jamais en
 * moyennant des moyennes par appel. Les appels sans `internal.version === 2` (ancienne
 * forme) sont ignorés ici : l'écran les lit par ses sections historiques.
 *
 * Module pur : pas de Prisma, pas de Next. La route `api/admin/analytics-internal` lui
 * passe les appels déjà lus.
 */

export type AppelV2 = {
  /** `stats` de CallConversation (racine : transferReason, end_reason, duration…). */
  stats: Record<string, any>;
};

type ParProfil = {
  n: number;
  latenceMoyMs: number;
  llmMoyMs: number | null;
  /** Part du temps passée dans le modèle, le reste étant réseau et Function. */
  partLlmPct: number | null;
  neutresPct: number;
  relancesPct: number;
  entreeMoy: number;
  cachePct: number;
  sortieMoy: number;
};

export type StatsV2 = {
  appels: number;
  cerveau: {
    decisions: number;
    latenceMoyMs: number;
    llmMoyMs: number | null;
    profils: Record<string, ParProfil>;
  };
  accuses: {
    dit: number;
    ecarte: number;
    rejete: number;
    inutile: number;
    /** Rejets du texte rapportés aux accusés jugés sur leur texte (dit + rejeté). Cible : sous 5 %. */
    tauxRejetPct: number;
    /** Part des accusés écrits que le garde-fou de la décision écarte exprès. */
    tauxEcartePct: number;
    raisons: { raison: string; n: number }[];
    etats: { etat: string; dit: number; ecarte: number; rejete: number }[];
  };
  latence: {
    tours: number;
    tourMoyMs: number;
    /** Part des tours sous 1,5 s, 1,5-2,5 s, 2,5-4 s, au-delà. */
    tranchesTourPct: number[];
    voixTours: number;
    voixMoyMs: number;
    tranchesVoixPct: number[];
    etatsLents: { etat: string; n: number; moyMs: number }[];
  };
  creation: {
    etapes: { etape: string; n: number; moyMs: number; maxMs: number }[];
    echecs: number;
    relues: number;
    delaisDepasses: number;
  };
  transfert: {
    appelsTransferes: number;
    pontsTentes: number;
    pontsDecroches: number;
    pontsNonDecroches: number;
    /** Ponts non décrochés sur les ponts tentés. */
    nonDecrochePct: number;
    decrocheMoyMs: number | null;
    /** `full_planning_end` : le robot dit « pas de créneau », il ne transfère pas. */
    planningPlein: number;
    motifs: { motif: string; n: number }[];
  };
  creneaux: {
    appelsAvecProposition: number;
    propositionsMoy: number;
    /** Nombre de propositions refusées avant un accord : 0, 1, 2, 3 et plus. */
    iterations: { iterations: string; n: number }[];
    nouvellesRecherchesMoy: number;
  };
  accueil: {
    sansParolePct: number;
    questionLanguePct: number;
    premiereParoleMoyS: number | null;
  };
  demandes: { humainPct: number; urgencePct: number; multiExamenPct: number };
  cout: {
    caracteresTtsMoy: number;
    jetonsEntreeMoy: number;
    jetonsSortieMoy: number;
    cachePct: number;
    secondesMoy: number;
  };
};

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const arrondi = (v: number, d = 0) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};
const pct = (a: number, b: number) => (b > 0 ? arrondi((100 * a) / b, 1) : 0);
const moy = (s: number, c: number, d = 0) => (c > 0 ? arrondi(s / c, d) : 0);
const ajouter = (o: Record<string, number>, k: string, v = 1) => {
  o[k] = (o[k] ?? 0) + v;
};
const top = (o: Record<string, number>, k = 10) =>
  Object.entries(o)
    .sort((a, b) => b[1] - a[1])
    .slice(0, k);
const enPct = (tab: number[]) => {
  const total = tab.reduce((s, v) => s + v, 0);
  return tab.map((v) => pct(v, total));
};
const sommerTranches = (acc: number[], t: unknown) => {
  if (!Array.isArray(t)) return;
  t.forEach((v, i) => {
    acc[i] = (acc[i] ?? 0) + n(v);
  });
};

export function estV2(stats: any): boolean {
  return stats?.internal?.version === 2;
}

export function agregerV2(appels: AppelV2[]): StatsV2 {
  const v2 = appels.filter((a) => estV2(a.stats));
  const N = v2.length;

  const profils: Record<string, { n: number; ms: number; neutres: number; nLlm: number; llm: number; relances: number; entree: number; cache: number; sortie: number }> = {};
  const ac = { dit: 0, ecarte: 0, rejete: 0, inutile: 0 };
  const raisons: Record<string, number> = {};
  const etatsAcc: Record<string, { dit: number; ecarte: number; rejete: number }> = {};
  let tours = 0, tourSomme = 0, voixTours = 0, voixSomme = 0;
  const tranchesTour: number[] = [], tranchesVoix: number[] = [];
  const etatsLat: Record<string, { n: number; s: number }> = {};
  const etapes: Record<string, { n: number; s: number; max: number }> = {};
  let echecs = 0, relues = 0, delais = 0;
  let transferes = 0, tentes = 0, decroches = 0, nonDecroches = 0, decrocheSomme = 0, decrocheN = 0, planningPlein = 0;
  const motifs: Record<string, number> = {};
  let avecProposition = 0, propositions = 0, recherches = 0;
  const iterations: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3+": 0 };
  let sansParole = 0, questionLangue = 0, paroleSomme = 0, paroleN = 0;
  let humain = 0, urgence = 0, multi = 0;
  let caracteres = 0, jEntree = 0, jCache = 0, jSortie = 0, secondes = 0;

  for (const { stats } of v2) {
    const i = stats.internal;

    for (const [profil, p] of Object.entries<any>(i.v2?.brain?.profils ?? {})) {
      const a = (profils[profil] ??= { n: 0, ms: 0, neutres: 0, nLlm: 0, llm: 0, relances: 0, entree: 0, cache: 0, sortie: 0 });
      a.n += n(p.n);
      a.ms += n(p.somme_ms);
      a.neutres += n(p.neutres);
      a.nLlm += n(p.n_llm);
      a.llm += n(p.somme_llm_ms);
      a.relances += n(p.relances);
      a.entree += n(p.entree);
      a.cache += n(p.cache);
      a.sortie += n(p.sortie);
    }

    const acc = i.v2?.accuses;
    if (acc) {
      ac.dit += n(acc.dit);
      ac.ecarte += n(acc.ecarte);
      ac.rejete += n(acc.rejete);
      ac.inutile += n(acc.inutile);
      for (const [r, c] of Object.entries<any>(acc.raisons ?? {})) ajouter(raisons, r, n(c));
      for (const [etat, e] of Object.entries<any>(acc.par_etat ?? {})) {
        const x = (etatsAcc[etat] ??= { dit: 0, ecarte: 0, rejete: 0 });
        x.dit += n(e.dit);
        x.ecarte += n(e.ecarte);
        x.rejete += n(e.rejete);
      }
    }

    const L = i.latency;
    if (L) {
      tours += n(L.turn_count);
      tourSomme += n(L._turn_sum);
      sommerTranches(tranchesTour, L.tranches);
      for (const [etat, s] of Object.entries<any>(L.by_state ?? {})) {
        const x = (etatsLat[etat] ??= { n: 0, s: 0 });
        x.n += n(s.count);
        x.s += n(s.turn_sum);
      }
    }
    if (i.voix) {
      voixTours += n(i.voix.tours);
      voixSomme += n(i.voix.somme_ms);
      sommerTranches(tranchesVoix, i.voix.tranches);
    }

    const C = i.creation;
    if (C) {
      for (const [etape, e] of Object.entries<any>(C.etapes ?? {})) {
        const x = (etapes[etape] ??= { n: 0, s: 0, max: 0 });
        x.n += n(e.n);
        x.s += n(e.somme_ms);
        x.max = Math.max(x.max, n(e.max_ms));
      }
      echecs += n(C.echecs);
      relues += n(C.relue);
      delais += n(C.delai_depasse);
    }

    const T = i.transfert;
    // Le motif du planning plein vit selon le chemin dans `end_reason`, `transferReason` ou
    // le funnel (`transfer_reason`) ; `transferReason` reste souvent vide (getPeriod ne
    // le pose que sur `call.info`).
    const planning =
      stats.end_reason === "full_planning_end" ||
      stats.transferReason === "full_planning_end" ||
      stats.funnel?.transfer_reason === "full_planning_end";
    if (planning) planningPlein++;
    else if (T?.motif || stats.end_reason === "transfer") {
      transferes++;
      ajouter(motifs, T?.motif || stats.transferReason || "sans_motif");
    }
    if (T) {
      tentes += n(T.tentes);
      decroches += n(T.decroches);
      nonDecroches += n(T.non_decroches);
      if (typeof T.decroche_ms === "number") {
        decrocheSomme += T.decroche_ms;
        decrocheN++;
      }
    }

    const S = i.slot;
    if (S && n(S.propositions) > 0) {
      avecProposition++;
      propositions += n(S.propositions);
      recherches += n(S.nouvelles_recherches);
      const it = S.iterations_to_accept;
      if (typeof it === "number") ajouter(iterations, it >= 3 ? "3+" : String(it));
    }

    if (i.accueil?.sans_parole) sansParole++;
    if (i.accueil?.question_langue) questionLangue++;
    if (typeof i.accueil?.premiere_parole_s === "number") {
      paroleSomme += i.accueil.premiere_parole_s;
      paroleN++;
    }

    if (i.middlewares?.human_requested) humain++;
    if (i.middlewares?.urgence_triggered) urgence++;
    if (i.middlewares?.multi_exam_detected) multi++;

    caracteres += n(i.cout?.caracteres_tts);
    jEntree += n(i.cout?.jetons_entree);
    jCache += n(i.cout?.jetons_cache);
    jSortie += n(i.cout?.jetons_sortie);
    secondes += n(i.cout?.secondes);
  }

  const decisions = Object.values(profils).reduce((s, p) => s + p.n, 0);
  const msTotal = Object.values(profils).reduce((s, p) => s + p.ms, 0);
  const nLlm = Object.values(profils).reduce((s, p) => s + p.nLlm, 0);
  const llmTotal = Object.values(profils).reduce((s, p) => s + p.llm, 0);

  return {
    appels: N,
    cerveau: {
      decisions,
      latenceMoyMs: moy(msTotal, decisions),
      llmMoyMs: nLlm > 0 ? moy(llmTotal, nLlm) : null,
      profils: Object.fromEntries(
        Object.entries(profils)
          .sort((a, b) => b[1].n - a[1].n)
          .map(([k, p]) => {
            const llm = p.nLlm > 0 ? p.llm / p.nLlm : null;
            const lat = p.n > 0 ? p.ms / p.n : 0;
            return [
              k,
              {
                n: p.n,
                latenceMoyMs: arrondi(lat),
                llmMoyMs: llm === null ? null : arrondi(llm),
                partLlmPct: llm === null || lat === 0 ? null : arrondi((100 * llm) / lat, 1),
                neutresPct: pct(p.neutres, p.n),
                relancesPct: pct(p.relances, p.n),
                entreeMoy: moy(p.entree, p.n),
                cachePct: pct(p.cache, p.entree),
                sortieMoy: moy(p.sortie, p.n),
              },
            ];
          })
      ),
    },
    accuses: {
      ...ac,
      tauxRejetPct: pct(ac.rejete, ac.dit + ac.rejete),
      tauxEcartePct: pct(ac.ecarte, ac.dit + ac.rejete + ac.ecarte),
      raisons: top(raisons).map(([raison, c]) => ({ raison, n: c })),
      etats: Object.entries(etatsAcc)
        .map(([etat, e]) => ({ etat, ...e }))
        .sort((a, b) => b.rejete + b.ecarte - (a.rejete + a.ecarte))
        .slice(0, 8),
    },
    latence: {
      tours,
      tourMoyMs: moy(tourSomme, tours),
      tranchesTourPct: enPct(tranchesTour),
      voixTours,
      voixMoyMs: moy(voixSomme, voixTours),
      tranchesVoixPct: enPct(tranchesVoix),
      etatsLents: Object.entries(etatsLat)
        .filter(([, e]) => e.n >= 20)
        .map(([etat, e]) => ({ etat, n: e.n, moyMs: moy(e.s, e.n) }))
        .sort((a, b) => b.moyMs - a.moyMs)
        .slice(0, 8),
    },
    creation: {
      etapes: Object.entries(etapes).map(([etape, e]) => ({ etape, n: e.n, moyMs: moy(e.s, e.n), maxMs: e.max })),
      echecs,
      relues,
      delaisDepasses: delais,
    },
    transfert: {
      appelsTransferes: transferes,
      pontsTentes: tentes,
      pontsDecroches: decroches,
      pontsNonDecroches: nonDecroches,
      nonDecrochePct: pct(nonDecroches, tentes),
      decrocheMoyMs: decrocheN > 0 ? moy(decrocheSomme, decrocheN) : null,
      planningPlein,
      motifs: top(motifs).map(([motif, c]) => ({ motif, n: c })),
    },
    creneaux: {
      appelsAvecProposition: avecProposition,
      propositionsMoy: moy(propositions, avecProposition, 2),
      iterations: Object.entries(iterations).map(([k, c]) => ({ iterations: k, n: c })),
      nouvellesRecherchesMoy: moy(recherches, avecProposition, 2),
    },
    accueil: {
      sansParolePct: pct(sansParole, N),
      questionLanguePct: pct(questionLangue, N),
      premiereParoleMoyS: paroleN > 0 ? moy(paroleSomme, paroleN, 1) : null,
    },
    demandes: { humainPct: pct(humain, N), urgencePct: pct(urgence, N), multiExamenPct: pct(multi, N) },
    cout: {
      caracteresTtsMoy: moy(caracteres, N),
      jetonsEntreeMoy: moy(jEntree, N),
      jetonsSortieMoy: moy(jSortie, N),
      cachePct: pct(jCache, jEntree),
      secondesMoy: moy(secondes, N),
    },
  };
}
