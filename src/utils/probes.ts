// Probes actives : URLs externes que le dashboard ping périodiquement.
// Contrairement aux heartbeats (push), ici c'est le dashboard qui tire — utile
// pour les services qui n'émettent pas eux-mêmes (Azure Functions, APIs tierces…).
//
// Le ping se fait côté serveur (évite les soucis CORS). Les résultats sont
// stockés en mémoire et exposés via /api/heartbeat/status.

export type ProbeConfig = {
  app: string;
  url: string;
  /** Intervalle entre deux probes, en millisecondes. */
  intervalMs: number;
  /** Timeout de la requête HTTP. */
  timeoutMs?: number;
};

export type ProbeState = {
  app: string;
  url: string;
  /** Timestamp ISO de la dernière tentative (succès ou échec). */
  lastCheckedAt: string | null;
  /** Timestamp ISO du dernier succès (HTTP 2xx). */
  lastSuccessAt: string | null;
  /** Code HTTP du dernier check. */
  lastHttpStatus: number | null;
  /** Latence du dernier check, en ms. */
  lastLatencyMs: number | null;
  /** Message d'erreur du dernier échec (timeout, DNS, etc.). */
  lastError: string | null;
};

export const PROBES: ProbeConfig[] = [
  {
    app: "lyrae-talk-functions",
    url: "https://lyrae-talk-functions.azurewebsites.net/api/health",
    intervalMs: 120_000, // 2 min
    timeoutMs: 8_000,
  },
];

const STORE_KEY = "__probeStore__";
const INFLIGHT_KEY = "__probeInFlight__";

function getStore(): Map<string, ProbeState> {
  const g = globalThis as any;
  if (!g[STORE_KEY]) {
    const map = new Map<string, ProbeState>();
    for (const p of PROBES) {
      map.set(p.app, {
        app: p.app,
        url: p.url,
        lastCheckedAt: null,
        lastSuccessAt: null,
        lastHttpStatus: null,
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
  if (inFlight.has(probe.app)) return; // évite le ping concurrent si plusieurs polls arrivent simultanément
  inFlight.add(probe.app);

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), probe.timeoutMs ?? 8_000);

  let httpStatus: number | null = null;
  let error: string | null = null;
  try {
    const res = await fetch(probe.url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    httpStatus = res.status;
  } catch (e: any) {
    error = e?.name === "AbortError" ? "timeout" : e?.message ?? "fetch error";
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - startedAt;
  const nowIso = new Date().toISOString();
  const ok = httpStatus !== null && httpStatus >= 200 && httpStatus < 300;

  const store = getStore();
  const prev = store.get(probe.app);
  store.set(probe.app, {
    app: probe.app,
    url: probe.url,
    lastCheckedAt: nowIso,
    lastSuccessAt: ok ? nowIso : prev?.lastSuccessAt ?? null,
    lastHttpStatus: httpStatus,
    lastLatencyMs: latencyMs,
    lastError: ok ? null : error,
  });

  inFlight.delete(probe.app);
}

/**
 * Lance en arrière-plan les probes dont l'intervalle est écoulé.
 * Appelée à chaque GET /api/heartbeat/status — pas besoin d'un cron : tant que
 * quelqu'un consulte /admin/monitoring (poll toutes les 10s), on garde les
 * probes à jour à leur cadence (2min).
 */
export function ensureProbesFresh(): void {
  const now = Date.now();
  const store = getStore();
  for (const probe of PROBES) {
    const state = store.get(probe.app);
    const lastCheckMs = state?.lastCheckedAt
      ? new Date(state.lastCheckedAt).getTime()
      : 0;
    if (now - lastCheckMs >= probe.intervalMs) {
      void runProbe(probe); // fire and forget — la réponse de /status ne l'attend pas
    }
  }
}

export function listProbes(): { config: ProbeConfig; state: ProbeState }[] {
  const store = getStore();
  return PROBES.map((p) => ({ config: p, state: store.get(p.app)! }));
}
