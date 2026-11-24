import { Prisma } from "@prisma/client";
import { ErreurMetier } from "@/pilot/lib/erreurs";

/**
 * Ce qu'une erreur de la base devient à l'écriture (lot T, généralisé). Le
 * message d'une erreur Prisma peut recopier les valeurs envoyées, donc un texte
 * libre (« Failing row contains (…) », arguments d'une requête invalide) : il
 * n'est jamais repris, ni dans la réponse ni dans un log (C-22, C-27). La ligne
 * de log ne porte que le code et le nom de la contrainte, filtré pour n'être
 * qu'un identifiant.
 *
 * - contrainte non tenue (CHECK, NOT NULL, valeur trop longue) : 400 ;
 * - clé étrangère disparue (une ligne liée supprimée entre-temps), ligne
 *   introuvable : 409, « Rechargez la page » ;
 * - doublon, sérialisation : 409, « Rechargez la page » ;
 * - toute autre erreur Prisma : une erreur neutre, sans le message d'origine,
 *   qui reste une 500 pour le serveur ;
 * - une `ErreurMetier` ou une erreur qui ne vient pas de Prisma passe telle quelle.
 *
 * Chaque service donne ses phrases (`MessagesErreurBase`) : commentaires,
 * concurrents, grilles tarifaires, propositions. Un doublon qui a son propre
 * message (nom de concurrent, date de grille) se traduit avant, dans le service.
 */
export type MessagesErreurBase = {
  /** Une contrainte non tenue : 400. */
  contrainte: string;
  /** Une ligne liée disparue : 409. */
  disparu: string;
  /** Un doublon ou une écriture concurrente : 409. */
  conflit: string;
  /** Toute autre panne : une erreur neutre (500). */
  panne: string;
  /** Le début de la ligne de log, tiré du code : « Écriture d'un commentaire ». */
  ecriture: string;
};

const CODES_CONTRAINTE = new Set(["P2000", "P2004", "P2011", "P2012", "P2023"]);
const CODES_DISPARU = new Set(["P2003", "P2014", "P2015", "P2018", "P2025"]);
const CODES_CONFLIT = new Set(["P2002", "P2034"]);
/** Codes PostgreSQL lus dans une erreur que Prisma ne classe pas. */
const SQL_CONTRAINTE = new Set(["23514", "23502", "22001"]);
const SQL_DISPARU = new Set(["23503"]);
const SQL_CONFLIT = new Set(["23505", "40001", "40P01"]);

/** Un identifiant SQL, rien d'autre : une valeur qui se serait glissée là n'en ressort pas. */
const identifiant = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const nom = v.replace(/\s*\(index\)$/, "").trim();
  return /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(nom) ? nom : null;
};

function journaliserRefus(messages: MessagesErreurBase, code: string, contrainte: string | null) {
  console.error(JSON.stringify({ niveau: "erreur", message: `${messages.ecriture} refusée par la base`, code, contrainte, ts: new Date().toISOString() }));
}

export function traduireErreurBase(erreur: unknown, messages: MessagesErreurBase): unknown {
  if (erreur instanceof ErreurMetier) return erreur;
  if (erreur instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = (erreur.meta ?? {}) as Record<string, unknown>;
    const contrainte = identifiant(meta.constraint) ?? identifiant(meta.field_name) ?? identifiant(meta.database_error_code_name) ?? null;
    journaliserRefus(messages, erreur.code, contrainte);
    if (CODES_DISPARU.has(erreur.code)) return new ErreurMetier(messages.disparu, 409);
    if (CODES_CONFLIT.has(erreur.code)) return new ErreurMetier(messages.conflit, 409);
    if (CODES_CONTRAINTE.has(erreur.code)) return new ErreurMetier(messages.contrainte, 400);
    return new Error(messages.panne);
  }
  if (erreur instanceof Prisma.PrismaClientUnknownRequestError) {
    // Le code SQL et le nom de la contrainte sont lus dans le message, qui n'est jamais recopié.
    const sql = /\bcode:\s*\\?"?(\d{5}|[0-9A-Z]{5})\\?"?/.exec(erreur.message)?.[1] ?? null;
    const contrainte = identifiant(/constraint \\?"([A-Za-z0-9_]+)\\?"/.exec(erreur.message)?.[1]);
    journaliserRefus(messages, sql ? `SQL ${sql}` : "inconnu", contrainte);
    if (sql && SQL_DISPARU.has(sql)) return new ErreurMetier(messages.disparu, 409);
    if (sql && SQL_CONFLIT.has(sql)) return new ErreurMetier(messages.conflit, 409);
    if ((sql && SQL_CONTRAINTE.has(sql)) || /check constraint/i.test(erreur.message)) return new ErreurMetier(messages.contrainte, 400);
    return new Error(messages.panne);
  }
  if (erreur instanceof Prisma.PrismaClientValidationError || erreur instanceof Prisma.PrismaClientRustPanicError
    || erreur instanceof Prisma.PrismaClientInitializationError) {
    journaliserRefus(messages, erreur.name, null);
    return new Error(messages.panne);
  }
  return erreur;
}

/** Une écriture dont l'erreur de base sort traduite, jamais brute : le service l'enroule autour de sa transaction. */
export async function sansErreurBrute<T>(ecriture: () => Promise<T>, messages: MessagesErreurBase): Promise<T> {
  try { return await ecriture(); } catch (erreur) { throw traduireErreurBase(erreur, messages); }
}
