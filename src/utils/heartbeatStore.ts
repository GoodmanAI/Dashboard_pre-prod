export type HeartbeatEntry = {
  /** Nom du service (clé d'unicité), tel que reçu dans l'URL `/api/heartbeat/<appName>`. */
  app: string;
  /** Timestamp serveur du dernier heartbeat reçu (ISO). Source de vérité pour le statut alive/down. */
  lastSeen: string;
  /** Timestamp client envoyé par le service (ISO). Informatif uniquement (peut diverger). */
  clientTimestamp: string;
  /** PID du process côté service. */
  pid: number;
  /** Uptime du process côté service, en secondes. */
  uptime: number;
};

const GLOBAL_KEY = "__heartbeatStore__";

// Store RAM-only persisté sur `globalThis` pour survivre aux hot reloads dev (Next.js
// recharge les modules, mais pas globalThis). Se vide à chaque redéploiement / restart
// serveur — sans impact réel : les services réémettent toutes les 5s, l'état se
// reconstruit en quelques secondes. À migrer vers DB seulement si on veut un historique.
function getStore(): Map<string, HeartbeatEntry> {
  const g = globalThis as any;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new Map<string, HeartbeatEntry>();
  }
  return g[GLOBAL_KEY] as Map<string, HeartbeatEntry>;
}

export function recordHeartbeat(entry: HeartbeatEntry): void {
  getStore().set(entry.app, entry);
}

export function listHeartbeats(): HeartbeatEntry[] {
  return Array.from(getStore().values());
}
