import { ErreurMetier } from "@/pilot/lib/erreurs";

/**
 * Gardes sur la requête elle-même, avant tout travail (lot T). Fonctions sans
 * dépendance à Next : le middleware (Edge) et les routes (Node) les lisent, et
 * leurs tests les tiennent.
 */

/** Les méthodes qui ne modifient rien : elles passent sans contrôle d'origine. */
const METHODES_SURES = new Set(["GET", "HEAD"]);

/**
 * Une requête qui modifie (ni GET ni HEAD) vers `/api/` est refusée quand son
 * en-tête `Origin` est présent et n'est pas l'origine de Pilot. Sans `Origin`
 * (scripts, outils, vérifications Node), elle passe : un navigateur en envoie
 * toujours un sur une requête qui modifie, et c'est lui qu'on protège d'une
 * page tierce. `Origin: null` (cadre isolé, redirection) n'est pas une origine
 * de Pilot : refusé.
 */
export function origineRefusee(r: { methode: string; chemin: string; origine: string | null; attendues: readonly (string | null | undefined)[] }): boolean {
  if (!r.chemin.startsWith("/api/") || METHODES_SURES.has(r.methode.toUpperCase())) return false;
  if (r.origine === null) return false;
  return !r.attendues.some((a) => a && a.toLowerCase() === r.origine!.toLowerCase());
}

/** L'origine `protocole://hôte` déduite d'en-têtes, ou null s'il manque l'un des deux. Un hôte étrange donne null. */
export function origineDe(protocole: string | null | undefined, hote: string | null | undefined): string | null {
  const p = protocole?.split(",")[0]?.trim().replace(/:$/, "");
  const h = hote?.split(",")[0]?.trim();
  if (!p || !h || !/^https?$/i.test(p) || !/^[A-Za-z0-9.\-:[\]]+$/.test(h)) return null;
  return `${p}://${h}`;
}

export const MESSAGE_TROP_LONG = "Commentaire trop long.";

/**
 * Le corps maximal d'une requête qui porte du texte libre (C-79) : 64 Kio. Une
 * seule constante pour toutes les routes qui la lisent (commentaires, concurrents
 * et relevés, grilles et tarifs, propositions, organisations, prospects, centres).
 * Le plus long corps légitime (une proposition de 50 lignes aux libellés saisis,
 * ses notes et la réponse du client) tient dedans avec de la marge.
 */
export const CORPS_MAXIMUM = 64 * 1024;
export const MESSAGE_CORPS_TROP_GROS = "Les textes saisis sont trop longs. Raccourcissez-les.";

/** Vrai quand `Content-Length` annonce plus que `maximum` octets. Absent ou illisible : faux, la lecture bornée prend le relais. */
export function tailleAnnonceeDepasse(contentLength: string | null, maximum: number): boolean {
  if (contentLength === null || !/^\d+$/.test(contentLength.trim())) return false;
  return Number(contentLength.trim()) > maximum;
}

/**
 * Lit le corps JSON d'une requête sans jamais garder plus de `maximum` octets :
 * refus 413 sur un `Content-Length` trop grand, avant toute lecture, puis
 * arrêt de la lecture dès que le flux le dépasse (corps sans longueur annoncée).
 * Un corps illisible rend null : la validation zod dit alors pourquoi.
 */
export async function lireJsonBorne(requete: Request, maximum: number, message = MESSAGE_TROP_LONG): Promise<unknown> {
  if (tailleAnnonceeDepasse(requete.headers.get("content-length"), maximum)) throw new ErreurMetier(message, 413);
  if (!requete.body) return null;
  const lecteur = requete.body.getReader();
  const morceaux: Uint8Array[] = [];
  let taille = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    taille += value.byteLength;
    if (taille > maximum) {
      await lecteur.cancel().catch(() => undefined);
      throw new ErreurMetier(message, 413);
    }
    morceaux.push(value);
  }
  const octets = new Uint8Array(taille);
  let position = 0;
  for (const m of morceaux) { octets.set(m, position); position += m.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: false }).decode(octets)); }
  catch { return null; }
}

/** Le corps JSON d'une route qui reçoit du texte libre, borné à `CORPS_MAXIMUM` (413 au-delà). */
export function lireCorps(requete: Request): Promise<unknown> {
  return lireJsonBorne(requete, CORPS_MAXIMUM, MESSAGE_CORPS_TROP_GROS);
}
