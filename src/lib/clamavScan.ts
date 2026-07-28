import { createConnection } from "node:net";

/**
 * Scanner un buffer en memoire via le daemon ClamAV local, sans dependance
 * NPM. Communique via le socket Unix `/var/run/clamav/clamd.ctl` en
 * utilisant le protocole INSTREAM natif de clamd :
 *
 *   1. Ouvre le socket
 *   2. Envoie "zINSTREAM\0"
 *   3. Envoie le buffer par chunks au format <size:uint32 big-endian><chunk>
 *   4. Termine par un marqueur <0:uint32 big-endian>
 *   5. Lit la reponse : chaine ASCII terminee par \0
 *
 * Reponses possibles :
 *   "stream: OK"                       → fichier clean
 *   "stream: <SIGNATURE> FOUND"        → infecte
 *   "stream: <message> ERROR"          → erreur scan
 *
 * Chemin socket surchargeable via env CLAMD_SOCKET (utile pour tests).
 */

const SOCKET_PATH = process.env.CLAMD_SOCKET ?? "/var/run/clamav/clamd.ctl";

/** Timeout total (connexion + envoi + reponse). Un scan de 10 MB prend
 *  typiquement < 2s ; 30s laisse une grosse marge sur une VM surchargee. */
const SCAN_TIMEOUT_MS = 30_000;

/** Taille des chunks envoyes a clamd. 64 KB = valeur recommandee CLAMD. */
const CHUNK_SIZE = 64 * 1024;

export type ScanResult =
  | { ok: true; clean: true }
  | { ok: true; clean: false; virus: string }
  | { ok: false; error: string };

export async function scanBuffer(buffer: Buffer): Promise<ScanResult> {
  return new Promise((resolve) => {
    const sock = createConnection(SOCKET_PATH);
    let responseBuffer = Buffer.alloc(0);
    let done = false;

    const finish = (r: ScanResult) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      sock.destroy();
      resolve(r);
    };

    const timeout = setTimeout(() => {
      finish({ ok: false, error: `scan timeout after ${SCAN_TIMEOUT_MS}ms` });
    }, SCAN_TIMEOUT_MS);

    sock.on("connect", () => {
      // 1. Commande INSTREAM en mode "z" (null-terminated)
      sock.write("zINSTREAM\0");

      // 2. Envoi chunks : <size:uint32 BE><chunk>
      let offset = 0;
      while (offset < buffer.length) {
        const chunkEnd = Math.min(offset + CHUNK_SIZE, buffer.length);
        const chunk = buffer.subarray(offset, chunkEnd);
        const sizePrefix = Buffer.alloc(4);
        sizePrefix.writeUInt32BE(chunk.length, 0);
        sock.write(sizePrefix);
        sock.write(chunk);
        offset = chunkEnd;
      }

      // 3. Marqueur de fin : uint32 = 0
      const endMarker = Buffer.alloc(4);
      endMarker.writeUInt32BE(0, 0);
      sock.write(endMarker);
    });

    sock.on("data", (chunk) => {
      responseBuffer = Buffer.concat([responseBuffer, chunk]);
    });

    sock.on("end", () => {
      // Reponse en ASCII, terminee par \0. On strip \0 et espaces.
      const resp = responseBuffer.toString("utf8").replace(/\0/g, "").trim();
      if (resp === "stream: OK") {
        finish({ ok: true, clean: true });
      } else if (resp.endsWith(" FOUND")) {
        const m = resp.match(/^stream:\s+(.+)\s+FOUND$/);
        finish({ ok: true, clean: false, virus: m?.[1] ?? "UNKNOWN" });
      } else if (resp.endsWith(" ERROR")) {
        finish({ ok: false, error: resp });
      } else {
        finish({ ok: false, error: `unexpected clamd response: ${resp}` });
      }
    });

    sock.on("error", (err) => {
      finish({ ok: false, error: `socket error: ${err.message}` });
    });
  });
}
