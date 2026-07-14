/**
 * Export markdown des sections de la page /admin/analytics-internal.
 *
 * Le but : produire un fichier .md compact et self-contained, adapté à être
 * copié-collé dans une conversation Claude Code (structure YAML + tables
 * markdown + labels métier). Aucune requête réseau — on utilise les données
 * déjà chargées côté client.
 *
 * Chaque exporter (identification, transferts, features, timeseries, sections
 * détaillées, full) commence par un frontmatter YAML avec les filtres appliqués
 * (période, centres, statut RDV) + les compteurs macro (total calls, calls
 * avec internal), pour que Claude sache exactement quoi lire.
 *
 * Les types sont dupliqués depuis src/app/admin/analytics-internal/page.tsx —
 * commentaire MIRROR ci-dessous. À maintenir en sync si le shape API évolue.
 */

// ============================================================================
// MIRROR types (from src/app/admin/analytics-internal/page.tsx)
// ============================================================================

type TimeseriesPoint = {
  date: string;
  dayLabel: string;
  calls: number;
  identSuccessPct: number;
  avgDuration: number;
  azureAvgMs: number;
  ai2risAvgMs: number;
};

type Recommendation = "activate" | "watch" | "skip" | "insufficient";

type FeatureMetrics = {
  volume: number;
  confirmedCount: number;
  benefitAvgMs: number;
  benefitMaxMs: number;
  benefitTotalMs: number;
  benefitCount: number;
  costCount: number;
  costRatioPct: number;
  costAvgMs: number;
  costMaxMs: number;
  expectedPerEventMs: number;
  recommendation: Recommendation;
  extras: Record<string, number>;
};

type FeatureStateMetrics = FeatureMetrics & { state: string };

type DistributionBucket = { range: string; min: number; max: number; count: number };

type FeatureData = {
  global: FeatureMetrics;
  byState: FeatureStateMetrics[];
  distribution: DistributionBucket[] | null;
};

export type FeatureKey =
  | "eager"
  | "tts_streaming"
  | "buffered_utterance"
  | "mw_late_detection"
  | "wait_sound_overshoot";

export type FeatureMetaLite = {
  key: FeatureKey;
  label: string;
  benefitKind: "ms" | "count";
  costKind: "count" | "ms" | null;
  benefitLabel: string;
  costLabel: string;
  confirmedLabel: string;
  byStateLabel: string;
  eventLabel: string;
  caveat: string;
  extras?: { key: string; label: string; suffix?: string }[];
};

export type AnalyticsInternal = {
  period: { from: string; to: string };
  totalCalls: number;
  callsWithInternal: number;
  timeseries: TimeseriesPoint[];
  features: Record<FeatureKey, FeatureData>;
  transfers: {
    total: number;
    categoryDistribution: Record<string, number>;
    topFailedSteps: Array<{ step: string; label: string; count: number }>;
    serviceDisabledCount: number;
    timeseries: Array<Record<string, string | number>>;
    categoryKeys: string[];
  };
  identification: {
    finalStatusDistribution: Record<string, number>;
    errorsByStep: Record<string, number>;
    avgTotalAttempts: number;
    birthdate: {
      totalCount: number;
      resolvedByDistribution: Record<string, number>;
      autonomyPct: number;
      azureUsedPct: number;
      nodeCollectedPct: number;
      avgAttempts: number;
      avgCollections: number;
    };
    spell: {
      triggeredCount: number;
      recoveredExistingCount: number;
      confirmedNewCount: number;
      recoveryRatePct: number;
      reconstructSourceDistribution: Record<string, number>;
      avgAttempts: number;
      avgFieldsSpelled: number;
    };
    crossSpellByFinalStatus: Record<string, number>;
  };
  steps: {
    topRepeats: { state: string; count: number }[];
    topErrorsLogic: { state: string; count: number }[];
    topErrorsTimeout: { state: string; count: number }[];
    avgBargeIn: number;
    avgDurationMinutes: number;
    statesVisitedLengthDistribution: { bucket: string; count: number }[];
  };
  apiPerformance: {
    azureAvgMs: number;
    azureMaxMs: number;
    azureTotalCalls: number;
    ai2risAvgMs: number;
    ai2risMaxMs: number;
    ai2risTotalCalls: number;
    avgRetries: number;
    avgSlowCalls: number;
    timeoutsByEndpoint: { state: string; count: number }[];
  };
  stt: {
    avgFallbackRecognizing: number;
    avgTotalUtterances: number;
    languageDistribution: { language: string; count: number }[];
  };
  slot: {
    iterationsDistribution: { iterations: string; count: number }[];
    avgDispoExprimee: number;
    pctNoSlotsFlowTriggered: number;
    pctMultisiteQuestionAsked: number;
    pctMultisiteAccepted: number;
  };
  middlewares: {
    pctUrgence: number;
    pctHuman: number;
    pctMultiExam: number;
    pctEndConversation: number;
    avgRepeatIntent: number;
    avgRepeatSlowerIntent: number;
  };
};

export type ExportMeta = {
  periodFrom: Date;
  periodTo: Date;
  /** "all" ou liste explicite d'userProductIds. */
  centresScope: "all" | number[];
  /** Libellé humain des centres ciblés ("Tous les centres (18)" ou "Centre A, Centre B"). */
  centresLabels: string;
  /** Slug utilisable en nom de fichier ("all-centres", "centre-13", "centres-multi"). */
  centresSlug: string;
  /** Filtre statut RDV appliqué ("all", "success", "no_slot", "not_performed", "transferred"). */
  rdvStatus: string;
  totalCalls: number;
  callsWithInternal: number;
};

// ============================================================================
// Utils
// ============================================================================

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 10000) / 100 : 0;
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) {
    const s = ms / 1000;
    return s >= 10 ? `${Math.round(s)}s` : `${s.toFixed(1)}s`;
  }
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return sec === 0 ? `${min}min` : `${min}min ${sec}s`;
}

function formatMinutes(decimalMinutes: number): string {
  if (!Number.isFinite(decimalMinutes) || decimalMinutes <= 0) return "0s";
  let mins = Math.floor(decimalMinutes);
  let secs = Math.round((decimalMinutes - mins) * 60);
  if (secs === 60) { mins += 1; secs = 0; }
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}min`;
  return `${mins}min ${secs}s`;
}

function formatDateFR(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function periodLabel(from: Date, to: Date): string {
  const days = Math.max(
    1,
    Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
  );
  return `${formatDateFR(from)} → ${formatDateFR(to)} (${days} jour${days > 1 ? "s" : ""})`;
}

/** Échappe un pipe pour ne pas casser les tables markdown. */
function esc(v: string | number): string {
  return String(v).replace(/\|/g, "\\|");
}

function mdTable(headers: string[], rows: (string | number)[][]): string {
  const head = "| " + headers.map(esc).join(" | ") + " |";
  const sep = "| " + headers.map(() => "---").join(" | ") + " |";
  const body = rows.map((r) => "| " + r.map(esc).join(" | ") + " |").join("\n");
  return rows.length === 0 ? head + "\n" + sep : head + "\n" + sep + "\n" + body;
}

/** Table simple à 2 colonnes clé/valeur. */
function mdKv(rows: [string, string | number][]): string {
  return mdTable(["Métrique", "Valeur"], rows);
}

/** Distribution en 3 colonnes : label / count / % du total. */
function mdDistribution(
  entries: Array<[string, number]>,
  total: number,
  labels?: Record<string, string>
): string {
  const rows = entries
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => [labels?.[key] ?? key, count, `${pct(count, total)}%`]);
  return mdTable(["Item", "Nombre", "% du total"], rows);
}

// ============================================================================
// Frontmatter
// ============================================================================

function buildFrontmatter(
  section: string,
  meta: ExportMeta,
  extras: Record<string, string | number> = {}
): string {
  const centresScope =
    meta.centresScope === "all" ? "all" : `[${meta.centresScope.join(", ")}]`;
  const lines: string[] = [
    "---",
    `section: ${section}`,
    `period_from: ${meta.periodFrom.toISOString()}`,
    `period_to: ${meta.periodTo.toISOString()}`,
    `period_label: "${periodLabel(meta.periodFrom, meta.periodTo)}"`,
    `centres_scope: ${centresScope}`,
    `centres_labels: "${meta.centresLabels.replace(/"/g, '\\"')}"`,
    `rdv_status_filter: ${meta.rdvStatus}`,
    `generated_at: ${new Date().toISOString()}`,
    `total_calls: ${meta.totalCalls}`,
    `calls_with_internal: ${meta.callsWithInternal}`,
    `calls_with_internal_pct: ${pct(meta.callsWithInternal, meta.totalCalls)}`,
  ];
  for (const [k, v] of Object.entries(extras)) lines.push(`${k}: ${v}`);
  lines.push("---", "");
  return lines.join("\n");
}

// ============================================================================
// Filename helper
// ============================================================================

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Nom de fichier : analytics_<section>_<from>_<to>_<centres>.md */
export function buildFilename(
  section: string,
  meta: ExportMeta,
  extra?: string
): string {
  const from = isoDateOnly(meta.periodFrom);
  const to = isoDateOnly(meta.periodTo);
  const extraPart = extra ? `-${extra}` : "";
  return `analytics_${section}${extraPart}_${from}_${to}_${meta.centresSlug}.md`;
}

// ============================================================================
// Section formatters
// ============================================================================

const FINAL_STATUS_LABELS: Record<string, string> = {
  success: "Succès",
  new_patient: "Nouveau patient",
  failed_transfer: "Transfert (échec identification)",
  null_or_other: "Autre / null",
};

const RESOLVED_BY_LABELS: Record<string, string> = {
  node: "Node (direct)",
  node_collected: "Node (collecte progressive)",
  azure: "Azure (fallback NLP)",
  null_or_other: "Non résolu",
};

const RECONSTRUCT_LABELS: Record<string, string> = {
  node: "Node",
  azure: "Azure",
  null_or_other: "—",
};

const RECO_LABELS: Record<Recommendation, string> = {
  activate: "Activer",
  watch: "À surveiller",
  skip: "Ne pas activer",
  insufficient: "Volume insuffisant",
};

// ---------- Timeseries ----------

export function exportTimeseriesMd(
  data: AnalyticsInternal,
  meta: ExportMeta
): string {
  const fm = buildFrontmatter("timeseries", meta);
  const rows = data.timeseries.map((p) => [
    p.date,
    p.dayLabel,
    p.calls,
    `${p.identSuccessPct}%`,
    formatMinutes(p.avgDuration),
    `${p.azureAvgMs}ms`,
    `${p.ai2risAvgMs}ms`,
  ]);
  return (
    fm +
    [
      "# Évolution temporelle",
      "",
      "Une ligne par jour de la période sélectionnée. Métriques agrégées par jour :",
      "- **Appels** : nombre total d'appels reçus",
      "- **Ident. succès** : % d'appels avec `identification.final_status = success`",
      "- **Durée moy.** : durée moyenne des appels (minutes:secondes)",
      "- **Azure moy.** : latence moyenne des appels à Azure NLP (fallback identification, etc.)",
      "- **AI2RIS moy.** : latence moyenne des appels à AI2RIS (backend Xplore)",
      "",
      mdTable(
        ["Date", "Jour", "Appels", "Ident. succès", "Durée moy.", "Azure moy.", "AI2RIS moy."],
        rows
      ),
    ].join("\n") +
    "\n"
  );
}

// ---------- Identification ----------

export function exportIdentificationMd(
  data: AnalyticsInternal,
  meta: ExportMeta
): string {
  const id = data.identification;
  const fm = buildFrontmatter("identification", meta);
  const finalStatusTotal = Object.values(id.finalStatusDistribution).reduce(
    (a, b) => a + b,
    0
  );
  const failedTransferPct = pct(
    id.finalStatusDistribution.failed_transfer ?? 0,
    finalStatusTotal
  );

  const parts: string[] = [];

  parts.push("# Identification patient");
  parts.push("");
  parts.push(
    "Analyse du bloc identification (date de naissance → recherche → épellation si non trouvé → statut final)."
  );
  parts.push("");

  // KPI hero
  parts.push("## Indicateurs clés");
  parts.push("");
  parts.push(
    mdKv([
      ["Doublons patients évités (spell.recovered_existing)", id.spell.recoveredExistingCount],
      ["Résolution date naissance sans Azure (autonomyPct)", `${id.birthdate.autonomyPct}%`],
      ["Taux de transfert pour échec d'identification", `${failedTransferPct}%`],
      ["Tentatives moy. totales avant statut final", id.avgTotalAttempts],
    ])
  );
  parts.push("");

  // Date de naissance
  parts.push("## Date de naissance");
  parts.push("");
  parts.push(
    mdKv([
      ["Appels avec birthdate mesuré", id.birthdate.totalCount],
      ["Résolu par Node (direct + collecte)", `${id.birthdate.autonomyPct}%`],
      ["Collecte progressive (nodeCollectedPct)", `${id.birthdate.nodeCollectedPct}%`],
      ["Bascule sur Azure (azureUsedPct)", `${id.birthdate.azureUsedPct}%`],
      ["Tentatives moyennes", id.birthdate.avgAttempts],
      ["Collections moyennes", id.birthdate.avgCollections],
    ])
  );
  parts.push("");
  parts.push("### Répartition `resolved_by`");
  parts.push("");
  parts.push(
    mdDistribution(
      Object.entries(id.birthdate.resolvedByDistribution),
      id.birthdate.totalCount,
      RESOLVED_BY_LABELS
    )
  );
  parts.push("");

  // Épellation
  parts.push("## Épellation du nom");
  parts.push("");
  parts.push(
    "Déclenchée quand le bot ne trouve aucun dossier avec les premières infos. La star métrique : nombre de doublons évités (dossier retrouvé après épellation)."
  );
  parts.push("");
  parts.push(
    mdKv([
      ["Épellations déclenchées", id.spell.triggeredCount],
      ["Dossiers existants retrouvés (doublons évités)", id.spell.recoveredExistingCount],
      ["Nouveaux patients confirmés", id.spell.confirmedNewCount],
      ["Taux de récupération", `${id.spell.recoveryRatePct}%`],
      ["Tentatives moyennes", id.spell.avgAttempts],
      ["Champs épelés moyens", id.spell.avgFieldsSpelled],
    ])
  );
  parts.push("");
  parts.push("### Source de reconstruction");
  parts.push("");
  parts.push(
    mdDistribution(
      Object.entries(id.spell.reconstructSourceDistribution),
      id.spell.triggeredCount,
      RECONSTRUCT_LABELS
    )
  );
  parts.push("");

  // Statut final
  parts.push("## Statut final d'identification");
  parts.push("");
  parts.push(
    mdDistribution(
      Object.entries(id.finalStatusDistribution),
      finalStatusTotal,
      FINAL_STATUS_LABELS
    )
  );
  parts.push("");

  // Cross spell × final status
  parts.push("## Croisement : doublons évités → statut final");
  parts.push("");
  parts.push(
    "Idéalement, tous les doublons évités (`spell.recovered_existing = true`) terminent en `success`."
  );
  parts.push("");
  parts.push(
    mdDistribution(
      Object.entries(id.crossSpellByFinalStatus),
      id.spell.recoveredExistingCount,
      FINAL_STATUS_LABELS
    )
  );
  parts.push("");

  // Erreurs par étape
  parts.push("## Erreurs par étape (cumulé sur la période)");
  parts.push("");
  const errorsRows = Object.entries(id.errorsByStep)
    .sort((a, b) => b[1] - a[1])
    .map(([state, count]) => [state, count]);
  parts.push(mdTable(["Étape", "Nombre d'erreurs"], errorsRows));
  parts.push("");

  return fm + parts.join("\n");
}

// ---------- Transferts ----------

export function exportTransfersMd(
  data: AnalyticsInternal,
  meta: ExportMeta
): string {
  const t = data.transfers;
  const fm = buildFrontmatter("transfers", meta);

  const parts: string[] = [];
  parts.push("# Transferts vers secrétariat");
  parts.push("");
  parts.push(
    "Chaque transfert = un appel où le bot n'a pas pu conclure et a passé la main au secrétariat humain."
  );
  parts.push("");
  parts.push("## Volumes");
  parts.push("");
  parts.push(
    mdKv([
      ["Total transferts sur la période", t.total],
      ["Appels avec service désactivé (kill switch)", t.serviceDisabledCount],
    ])
  );
  parts.push("");
  if (t.serviceDisabledCount > 0) {
    parts.push(
      `> ⚠️ **Attention** : ${t.serviceDisabledCount} appel(s) sur la période ont déclenché le kill switch (\`transferReason = service_disabled\`).`
    );
    parts.push("");
  }

  // Catégories
  parts.push("## Répartition par catégorie de motif");
  parts.push("");
  parts.push(
    "La catégorie regroupe plusieurs `transferReason` sémantiquement proches (cf. `src/lib/transferReasons.ts`)."
  );
  parts.push("");
  parts.push(
    mdDistribution(Object.entries(t.categoryDistribution), t.total)
  );
  parts.push("");

  // Top étapes
  parts.push("## Top étapes d'incompréhension avant transfert");
  parts.push("");
  parts.push(
    "Étape (`stats.state`) sur laquelle le bot a échoué juste avant de transférer. Utile pour prioriser les fixes STT/reformulation."
  );
  parts.push("");
  const topRows = t.topFailedSteps.map((s) => [s.step, s.label, s.count]);
  parts.push(mdTable(["State (technique)", "Label métier", "Nombre"], topRows));
  parts.push("");

  // Timeseries transferts
  if (t.timeseries && t.timeseries.length > 0 && t.categoryKeys.length > 0) {
    parts.push("## Évolution temporelle par catégorie");
    parts.push("");
    parts.push(
      "Une ligne par jour, une colonne par catégorie. Utile pour repérer des pics ou une catégorie qui monte progressivement."
    );
    parts.push("");
    const headers = ["Jour", ...t.categoryKeys];
    const rows = t.timeseries.map((p) => [
      String(p.dayLabel ?? p.date ?? ""),
      ...t.categoryKeys.map((k) => Number(p[k] ?? 0)),
    ]);
    parts.push(mdTable(headers, rows));
    parts.push("");
  }

  return fm + parts.join("\n");
}

// ---------- Feature Monitoring ----------

function formatBenefit(m: FeatureMetrics, kind: "ms" | "count"): string {
  return kind === "ms" ? formatMs(m.benefitAvgMs) : String(m.benefitCount);
}
function formatCost(m: FeatureMetrics, kind: "count" | "ms" | null): string {
  if (kind === null) return "n/a";
  if (kind === "ms") return `${formatMs(m.costAvgMs)} (max ${formatMs(m.costMaxMs)})`;
  return `${m.costCount} (${m.costRatioPct}%)`;
}

export function exportFeatureMd(
  data: AnalyticsInternal,
  featureKey: FeatureKey,
  featureMeta: FeatureMetaLite,
  meta: ExportMeta
): string {
  const feat = data.features[featureKey];
  const fm = buildFrontmatter("feature_monitoring", meta, {
    feature_key: featureKey,
    feature_label: `"${featureMeta.label.replace(/"/g, '\\"')}"`,
  });

  const parts: string[] = [];
  parts.push(`# Monitoring feature — ${featureMeta.label}`);
  parts.push("");
  parts.push("## Caveat métier (important pour l'interprétation)");
  parts.push("");
  parts.push(`> ${featureMeta.caveat}`);
  parts.push("");

  const g = feat.global;
  parts.push("## KPI globaux");
  parts.push("");
  const kv: [string, string | number][] = [
    ["Volume total (events)", g.volume],
    [featureMeta.confirmedLabel, g.confirmedCount],
  ];
  if (featureMeta.costKind === "count") {
    kv.push([`${featureMeta.costLabel} (count)`, g.costCount]);
    kv.push([`${featureMeta.costLabel} (ratio %)`, `${g.costRatioPct}%`]);
  } else if (featureMeta.costKind === "ms") {
    kv.push([`${featureMeta.costLabel} (moy.)`, formatMs(g.costAvgMs)]);
    kv.push([`${featureMeta.costLabel} (max)`, formatMs(g.costMaxMs)]);
  }
  if (featureMeta.benefitKind === "ms") {
    kv.push([featureMeta.benefitLabel, formatMs(g.benefitAvgMs)]);
    kv.push(["Bénéfice max observé", formatMs(g.benefitMaxMs)]);
    kv.push(["Bénéfice total potentiel", formatMs(g.benefitTotalMs)]);
    if (featureMeta.costKind === "count") {
      kv.push([
        `Bénéfice attendu pondéré / ${featureMeta.eventLabel}`,
        formatMs(g.expectedPerEventMs),
      ]);
    }
  } else {
    kv.push(["Total récupérable (count)", g.benefitCount]);
  }
  if (featureMeta.extras) {
    for (const ex of featureMeta.extras) {
      const v = g.extras[ex.key] ?? 0;
      const display =
        ex.suffix === "ms" ? formatMs(v) : `${v}${ex.suffix ? " " + ex.suffix : ""}`;
      kv.push([ex.label, display]);
    }
  }
  kv.push(["Recommandation globale", RECO_LABELS[g.recommendation]]);
  parts.push(mdKv(kv));
  parts.push("");

  // by state
  parts.push(`## Ventilation par ${featureMeta.byStateLabel.toLowerCase()}`);
  parts.push("");
  parts.push(
    `Triée par ${featureMeta.benefitKind === "ms" ? "bénéfice total" : "volume récupérable"} décroissant.`
  );
  parts.push("");
  const headers: string[] = [featureMeta.byStateLabel, "Volume"];
  if (featureMeta.costKind === "count") {
    headers.push(featureMeta.costLabel, "Taux");
  } else if (featureMeta.costKind === "ms") {
    headers.push(`${featureMeta.costLabel} moy.`, `${featureMeta.costLabel} max`);
  }
  if (featureMeta.benefitKind === "ms") {
    headers.push("Bénéfice moy.", "Bénéfice max", "Bénéfice total");
    if (featureMeta.costKind === "count") {
      headers.push(`Attendu / ${featureMeta.eventLabel}`);
    }
  } else {
    headers.push("Récupérables");
  }
  headers.push("Reco");

  const rows = feat.byState.map((s) => {
    const row: (string | number)[] = [s.state, s.volume];
    if (featureMeta.costKind === "count") {
      row.push(s.costCount, `${s.costRatioPct}%`);
    } else if (featureMeta.costKind === "ms") {
      row.push(formatMs(s.costAvgMs), formatMs(s.costMaxMs));
    }
    if (featureMeta.benefitKind === "ms") {
      row.push(formatMs(s.benefitAvgMs), formatMs(s.benefitMaxMs), formatMs(s.benefitTotalMs));
      if (featureMeta.costKind === "count") {
        row.push(formatMs(s.expectedPerEventMs));
      }
    } else {
      row.push(s.benefitCount);
    }
    row.push(RECO_LABELS[s.recommendation]);
    return row;
  });
  parts.push(mdTable(headers, rows));
  parts.push("");

  // Distribution
  if (feat.distribution && feat.distribution.length > 0) {
    parts.push(`## Distribution (${featureMeta.eventLabel}s)`);
    parts.push("");
    parts.push(
      mdTable(
        ["Range", "Min", "Max", "Count"],
        feat.distribution.map((b) => [b.range, b.min, b.max, b.count])
      )
    );
    parts.push("");
  }

  return fm + parts.join("\n");
}

// ---------- Sections détaillées (bloc masonry du bas) ----------

export function exportDetailedSectionsMd(
  data: AnalyticsInternal,
  meta: ExportMeta
): string {
  const fm = buildFrontmatter("detailed", meta);
  const parts: string[] = [];

  parts.push("# Sections détaillées");
  parts.push("");
  parts.push(
    "Regroupe : Qualité par étape · Performance API · STT · Slot · Middlewares. Utile pour un audit large sur la santé du bot."
  );
  parts.push("");

  // Steps
  parts.push("## Qualité par étape");
  parts.push("");
  parts.push(
    mdKv([
      ["Barge-in moyen par appel", data.steps.avgBargeIn],
      ["Durée moyenne d'un appel", formatMinutes(data.steps.avgDurationMinutes)],
    ])
  );
  parts.push("");
  parts.push("### Top répétitions par état");
  parts.push("");
  parts.push(mdTable(["État", "Répétitions"], data.steps.topRepeats.map((r) => [r.state, r.count])));
  parts.push("");
  parts.push("### Top erreurs logiques");
  parts.push("");
  parts.push(mdTable(["État", "Erreurs"], data.steps.topErrorsLogic.map((r) => [r.state, r.count])));
  parts.push("");
  parts.push("### Top timeouts par état");
  parts.push("");
  parts.push(mdTable(["État", "Timeouts"], data.steps.topErrorsTimeout.map((r) => [r.state, r.count])));
  parts.push("");
  parts.push("### Longueur du parcours (nb états visités)");
  parts.push("");
  parts.push(
    mdTable(
      ["Bucket (nb états)", "Nb d'appels"],
      data.steps.statesVisitedLengthDistribution.map((d) => [d.bucket, d.count])
    )
  );
  parts.push("");

  // API
  const api = data.apiPerformance;
  parts.push("## Performance API");
  parts.push("");
  parts.push(
    mdKv([
      ["Azure — latence moyenne", `${api.azureAvgMs}ms`],
      ["Azure — latence max", `${api.azureMaxMs}ms`],
      ["Azure — total d'appels", api.azureTotalCalls],
      ["AI2RIS — latence moyenne", `${api.ai2risAvgMs}ms`],
      ["AI2RIS — latence max", `${api.ai2risMaxMs}ms`],
      ["AI2RIS — total d'appels", api.ai2risTotalCalls],
      ["Retries moyens par appel", api.avgRetries],
      ["Slow calls moyens par appel", api.avgSlowCalls],
    ])
  );
  parts.push("");
  parts.push("### Timeouts par endpoint");
  parts.push("");
  parts.push(
    mdTable(
      ["Endpoint", "Timeouts"],
      api.timeoutsByEndpoint.map((r) => [r.state, r.count])
    )
  );
  parts.push("");

  // STT
  parts.push("## STT (Speech-to-Text)");
  parts.push("");
  parts.push(
    mdKv([
      ["Utterances moyennes par appel", data.stt.avgTotalUtterances],
      ["Fallback `recognizing` moyen par appel", data.stt.avgFallbackRecognizing],
    ])
  );
  parts.push("");
  parts.push("### Langues détectées");
  parts.push("");
  parts.push(
    mdTable(
      ["Langue", "Nb d'appels"],
      data.stt.languageDistribution.map((d) => [d.language, d.count])
    )
  );
  parts.push("");

  // Slot
  parts.push("## Slot (créneaux)");
  parts.push("");
  parts.push(
    mdKv([
      ["Dispo exprimées moyennes", data.slot.avgDispoExprimee],
      ["No-slots flow déclenché (%)", `${data.slot.pctNoSlotsFlowTriggered}%`],
      ["Multisite proposé (%)", `${data.slot.pctMultisiteQuestionAsked}%`],
      ["Multisite accepté (%)", `${data.slot.pctMultisiteAccepted}%`],
    ])
  );
  parts.push("");
  parts.push("### Itérations avant acceptation d'un créneau");
  parts.push("");
  parts.push(
    mdTable(
      ["Nb itérations", "Nb d'appels"],
      data.slot.iterationsDistribution.map((d) => [d.iterations, d.count])
    )
  );
  parts.push("");

  // Middlewares
  const mw = data.middlewares;
  parts.push("## Middlewares (détections d'intentions)");
  parts.push("");
  parts.push(
    mdKv([
      ["Urgence détectée (%)", `${mw.pctUrgence}%`],
      ["Demande humaine (%)", `${mw.pctHuman}%`],
      ["Multi-examen (%)", `${mw.pctMultiExam}%`],
      ["Fin de conversation déclenchée (%)", `${mw.pctEndConversation}%`],
      ["Demandes de répétition (moy.)", mw.avgRepeatIntent],
      ["Demandes de ralentissement (moy.)", mw.avgRepeatSlowerIntent],
    ])
  );
  parts.push("");

  return fm + parts.join("\n");
}

// ---------- Full report ----------

/**
 * Rapport complet — concatène toutes les sections avec un frontmatter unique
 * et des séparateurs `---` visuels entre chaque bloc.
 *
 * `featureRegistry` est passé en arg pour ne pas dupliquer la config des
 * features entre page.tsx (source of truth) et ce module.
 */
export function exportFullMd(
  data: AnalyticsInternal,
  meta: ExportMeta,
  featureRegistry: FeatureMetaLite[]
): string {
  const fm = buildFrontmatter("full", meta);
  const parts: string[] = [];

  parts.push("# Rapport complet analytics-internal");
  parts.push("");
  parts.push(
    "Concatène toutes les sections dans un seul fichier. Ordre : Évolution temporelle → Identification → Transferts → Feature monitoring (toutes) → Sections détaillées."
  );
  parts.push("");
  parts.push("---");
  parts.push("");

  // Chaque exporter individuel produit son propre frontmatter — on skip juste
  // le préfixe --- YAML pour ne garder que le body.
  const stripFrontmatter = (md: string): string => md.replace(/^---[\s\S]*?---\n+/, "");

  parts.push(stripFrontmatter(exportTimeseriesMd(data, meta)));
  parts.push("---");
  parts.push("");
  parts.push(stripFrontmatter(exportIdentificationMd(data, meta)));
  parts.push("---");
  parts.push("");
  parts.push(stripFrontmatter(exportTransfersMd(data, meta)));
  parts.push("---");
  parts.push("");

  for (const fmeta of featureRegistry) {
    parts.push(stripFrontmatter(exportFeatureMd(data, fmeta.key, fmeta, meta)));
    parts.push("---");
    parts.push("");
  }

  parts.push(stripFrontmatter(exportDetailedSectionsMd(data, meta)));

  return fm + parts.join("\n");
}

// ============================================================================
// Download helper (browser only — Blob + programmatic <a> click)
// ============================================================================

export function downloadMarkdown(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
