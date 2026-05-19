export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { listHeartbeats } from "@/utils/heartbeatStore";
import { ensureProbesFresh, listProbes } from "@/utils/probes";

// Seuil ~2.5× l'intervalle d'émission (2min) : tolère un beat raté + jitter.
// À ajuster si l'intervalle d'émission change côté services.
const HEARTBEAT_DOWN_AFTER_SECONDS = 300;

export async function GET() {
  // Déclenche en background les probes dont l'intervalle est écoulé. La réponse
  // ne les attend pas — on renvoie le dernier état connu.
  ensureProbesFresh();

  const now = Date.now();

  const heartbeats = listHeartbeats().map((h) => {
    const secondsAgo = Math.max(
      0,
      Math.floor((now - new Date(h.lastSeen).getTime()) / 1000)
    );
    return {
      kind: "push" as const,
      app: h.app,
      lastSeen: h.lastSeen,
      secondsAgo,
      status:
        secondsAgo < HEARTBEAT_DOWN_AFTER_SECONDS
          ? ("alive" as const)
          : ("down" as const),
      pid: h.pid,
      uptime: h.uptime,
    };
  });

  const probes = listProbes().map(({ config, state }) => {
    const lastSuccessSec = state.lastSuccessAt
      ? Math.max(
          0,
          Math.floor((now - new Date(state.lastSuccessAt).getTime()) / 1000)
        )
      : null;

    // Seuil ~2.5× l'intervalle de probe : tolère un check raté + jitter.
    const toleranceSec = Math.floor((config.intervalMs * 2.5) / 1000);
    const status: "alive" | "down" =
      lastSuccessSec !== null && lastSuccessSec < toleranceSec ? "alive" : "down";

    const lastSeenIso =
      state.lastSuccessAt ?? state.lastCheckedAt ?? new Date(0).toISOString();
    const secondsAgo = state.lastCheckedAt
      ? Math.max(
          0,
          Math.floor((now - new Date(state.lastCheckedAt).getTime()) / 1000)
        )
      : 0;

    return {
      kind: "probe" as const,
      probeKind: state.kind,
      app: config.app,
      lastSeen: lastSeenIso,
      secondsAgo,
      status,
      statusCode: state.lastStatusCode,
      latencyMs: state.lastLatencyMs,
      lastError: state.lastError,
      neverChecked: state.lastCheckedAt === null,
    };
  });

  return NextResponse.json([...heartbeats, ...probes]);
}
