/**
 * Appel d'AI2Xplore par le tunnel WireGuard du VPS (10.250.0.1 → 10.250.0.2).
 * -----------------------------------------------------------------------------
 * Seule route visée : `POST /api/test/creneaux`, la seule qu'AI2Xplore ouvre à
 * l'adresse du VPS (décision du 28/10/2026, `DECISIONS.md`). Serveur seulement : la
 * clé ne descend jamais dans le navigateur.
 *
 * Le certificat d'AI2Xplore est celui du réseau interne d'Univirtual
 * (`2184_unic_int`), qu'aucune autorité publique ne signe : on ne le vérifie pas.
 * L'authenticité de l'autre bout vient du tunnel, dont les deux pairs se
 * reconnaissent par leur clé WireGuard ; 10.250.0.2 n'est joignable que par lui.
 *
 * `AI2X_TUNNEL_URL` vide = fonction éteinte (le bouton n'apparaît pas).
 */
import https from "https";
import http from "http";

const DELAI_MS = 20000;

export function tunnelActif(): boolean {
  return Boolean(process.env.AI2X_TUNNEL_URL && process.env.DASHBOARD_AI2X_KEY);
}

export class TunnelInjoignable extends Error {}

/** POST JSON. Rend `{ status, corps }` ; lève `TunnelInjoignable` sur une panne réseau. */
export function postAi2x(chemin: string, corps: unknown): Promise<{ status: number; corps: any }> {
  const base = process.env.AI2X_TUNNEL_URL || "";
  const url = new URL(chemin, base);
  const donnees = JSON.stringify(corps);
  const client = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: "POST",
        timeout: DELAI_MS,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(donnees),
          "x-api-key": process.env.DASHBOARD_AI2X_KEY || "",
        },
        ...(url.protocol === "https:" ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        let texte = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (texte += c));
        res.on("end", () => {
          let json: any = null;
          try {
            json = texte ? JSON.parse(texte) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode ?? 0, corps: json });
        });
      }
    );
    req.on("timeout", () => req.destroy(new TunnelInjoignable("délai dépassé")));
    req.on("error", (e) => reject(e instanceof TunnelInjoignable ? e : new TunnelInjoignable(e.message)));
    req.end(donnees);
  });
}
