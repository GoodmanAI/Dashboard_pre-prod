// Probes actives : checks périodiques exécutés par le dashboard sur des
// ressources externes (HTTP endpoints, BDD…). Contrairement aux heartbeats
// (push), ici c'est le dashboard qui tire.
//
// Tous les checks s'exécutent côté serveur (évite les soucis CORS et permet
// d'accéder à des protocoles non-HTTP comme Postgres).

import prisma from "@/utils/prisma";

export type ProbeKind = "http" | "postgres";

export type ProbeOutcome = {
  ok: boolean;
  /** Code de statut court à afficher (ex: "200", "OK", "ERR"). */
  statusCode: string | null;
  /** Détail optionnel (message d'erreur, etc.). */
  info?: string | null;
};

export type ProbeConfig = {
  app: string;
  kind: ProbeKind;
  intervalMs: number;
  timeoutMs?: number;
  /** Fonction de check : doit terminer avant `timeoutMs` (la probe abort sinon). */
  check: (signal: AbortSignal) => Promise<ProbeOutcome>;
};

export type ProbeState = {
  app: string;
  kind: ProbeKind;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastStatusCode: string | null;
  lastLatencyMs: number | null;
  lastError: string | null;
};

// ---------- Factories de checks ----------

function httpCheck(url: string) {
  return async (signal: AbortSignal): Promise<ProbeOutcome> => {
    try {
      const res = await fetch(url, {
        method: "GET",
        signal,
        cache: "no-store",
      });
      const ok = res.status >= 200 && res.status < 300;
      return {
        ok,
        statusCode: String(res.status),
        info: ok ? null : `HTTP ${res.status}`,
      };
    } catch (e: any) {
      return {
        ok: false,
        statusCode: null,
        info: e?.name === "AbortError" ? "timeout" : e?.message ?? "fetch error",
      };
    }
  };
}

// Check Postgres via le client Prisma partagé de l'app (DATABASE_URL).
// Prisma ne supporte pas AbortSignal nativement sur $queryRaw, donc on fait
// une race entre la requête et un timer aligné sur le signal d'abort.
function postgresCheck() {
  return async (signal: AbortSignal): Promise<ProbeOutcome> => {
    const queryPromise = prisma
      .$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`
      .then(() => ({ ok: true, statusCode: "OK", info: null } as ProbeOutcome))
      .catch((e: any) => ({
        ok: false,
        statusCode: "ERR",
        info: (e?.message ?? "query error").slice(0, 120),
      }));

    const timeoutPromise = new Promise<ProbeOutcome>((resolve) => {
      const onAbort = () =>
        resolve({ ok: false, statusCode: "TIMEOUT", info: "timeout" });
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    });

    return Promise.race([queryPromise, timeoutPromise]);
  };
}

// ---------- Configuration des probes ----------

function buildProbes(): ProbeConfig[] {
  return [
    {
      app: "lyrae-talk-functions",
      kind: "http",
      intervalMs: 120_000,
      timeoutMs: 8_000,
      check: httpCheck("https://lyrae-talk-functions.azurewebsites.net/api/health"),
    },
    {
      // BDD principale du dashboard (DATABASE_URL).
      app: "postgres",
      kind: "postgres",
      intervalMs: 120_000,
      timeoutMs: 8_000,
      check: postgresCheck(),
    },
  ];
}

const PROBES_KEY = "__probeConfigs__";
function getProbes(): ProbeConfig[] {
  const g = globalThis as any;
  if (!g[PROBES_KEY]) g[PROBES_KEY] = buildProbes();
  return g[PROBES_KEY] as ProbeConfig[];
}

// ---------- Store & runner ----------

const STORE_KEY = "__probeStore__";
const INFLIGHT_KEY = "__probeInFlight__";

function getStore(): Map<string, ProbeState> {
  const g = globalThis as any;
  if (!g[STORE_KEY]) {
    const map = new Map<string, ProbeState>();
    for (const p of getProbes()) {
      map.set(p.app, {
        app: p.app,
        kind: p.kind,
        lastCheckedAt: null,
        lastSuccessAt: null,
        lastStatusCode: null,
        lastLatencyMs: null,
        lastError: null,
      });
    }
    g[STORE_KEY] = map;
  }
  return g[STORE_KEY] as Map<string, ProbeState>;
}

function getInFlight(): Set<string> {
  const g = globalThis as any;
  if (!g[INFLIGHT_KEY]) g[INFLIGHT_KEY] = new Set<string>();
  return g[INFLIGHT_KEY] as Set<string>;
}

async function runProbe(probe: ProbeConfig): Promise<void> {
  const inFlight = getInFlight();
  if (inFlight.has(probe.app)) return;
  inFlight.add(probe.app);

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), probe.timeoutMs ?? 8_000);

  let outcome: ProbeOutcome;
  try {
    outcome = await probe.check(controller.signal);
  } catch (e: any) {
    outcome = {
      ok: false,
      statusCode: null,
      info: e?.message ?? "unexpected error",
    };
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - startedAt;
  const nowIso = new Date().toISOString();

  const store = getStore();
  const prev = store.get(probe.app);
  store.set(probe.app, {
    app: probe.app,
    kind: probe.kind,
    lastCheckedAt: nowIso,
    lastSuccessAt: outcome.ok ? nowIso : prev?.lastSuccessAt ?? null,
    lastStatusCode: outcome.statusCode,
    lastLatencyMs: latencyMs,
    lastError: outcome.ok ? null : outcome.info ?? null,
  });

  inFlight.delete(probe.app);
}

/**
 * Lance en arrière-plan les probes dont l'intervalle est écoulé. Appelée à
 * chaque GET /api/heartbeat/status — tant que quelqu'un consulte la page de
 * monitoring (poll 10s), les probes restent à jour à leur cadence (2min).
 */
export function ensureProbesFresh(): void {
  const now = Date.now();
  const store = getStore();
  for (const probe of getProbes()) {
    const state = store.get(probe.app);
    const lastCheckMs = state?.lastCheckedAt
      ? new Date(state.lastCheckedAt).getTime()
      : 0;
    if (now - lastCheckMs >= probe.intervalMs) {
      void runProbe(probe);
    }
  }
}

export function listProbes(): { config: ProbeConfig; state: ProbeState }[] {
  const store = getStore();
  return getProbes().map((p) => ({ config: p, state: store.get(p.app)! }));
}
