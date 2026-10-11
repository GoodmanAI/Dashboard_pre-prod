/**
 * Pieces attendues d'un lien de depot : l'ordonnance, et les documents que le
 * client demande au patient (questionnaire IRM, questionnaire mineur...).
 *
 * Le Dashboard calcule seul la liste a l'init, a partir du type d'examen et
 * du booleen `mineur` envoyes par LyraeTalk ou Konnect : un client qui met un
 * document a disposition n'oblige a rien redeployer cote robot.
 * Plan : plans/2026-10-documents-demandes.md (workspace), DECISIONS.md du
 * 11/10/2026.
 *
 * Tables manuelles "DocumentDemande" et "PieceAttendue"
 * (prisma/migrations/manual/2026_10_11_documents_demandes.sql).
 */

import type { PoolClient } from "pg";
import { db } from "@/lib/db";
import { EXAM_TYPE_KEYS, ExamTypeKey } from "@/lib/smsConfirmationConfig";

/** Documents recus au plus par piece (une ordonnance de plusieurs pages...). */
export const MAX_DOCUMENTS_PAR_PIECE = 5;

/** Modele PDF depose par l'admin : 5 Mo au plus. */
export const MAX_MODELE_OCTETS = 5 * 1024 * 1024;

export type SortePiece = "ordonnance" | "document";

export const LIBELLE_ORDONNANCE = "Ordonnance";

/** Une piece a demander, avant insertion. */
export interface PieceACreer {
  piece: SortePiece;
  documentDemandeId: number | null;
  libelle: string;
  avecModele: boolean;
  ordre: number;
}

/** Ce que l'init renvoie a l'appelant pour composer son message. */
export interface PieceRenvoyee {
  piece: SortePiece;
  libelle: string;
  avecModele: boolean;
}

/** Ne garde que les cles d'examen canoniques, sans doublon. */
export function normaliserTypesExamen(raw: unknown): ExamTypeKey[] {
  if (!Array.isArray(raw)) return [];
  const connus = EXAM_TYPE_KEYS as readonly string[];
  return Array.from(
    new Set(raw.filter((v): v is ExamTypeKey => connus.includes(v as string)))
  );
}

/**
 * Documents mis a disposition par le client qui valent pour cet examen et ce
 * patient. Un document « mineurs seulement » ne vaut que si `mineur` est vrai.
 */
export async function documentsApplicables(
  userProductId: number,
  examType: string,
  mineur: boolean
): Promise<PieceACreer[]> {
  const res = await db.query<{
    id: number;
    libelle: string;
    typesExamen: unknown;
    mineursSeulement: boolean;
    avecModele: boolean;
    ordre: number;
  }>(
    `SELECT "id", "libelle", "typesExamen", "mineursSeulement",
            ("modeleContenu" IS NOT NULL) AS "avecModele", "ordre"
       FROM "DocumentDemande"
      WHERE "userProductId" = $1
        AND "disponible" = true
        AND "archivedAt" IS NULL
      ORDER BY "ordre" ASC, "id" ASC`,
    [userProductId]
  );
  return res.rows
    .filter((d) =>
      (normaliserTypesExamen(d.typesExamen) as string[]).includes(examType)
    )
    .filter((d) => !d.mineursSeulement || mineur)
    .map((d) => ({
      piece: "document" as const,
      documentDemandeId: d.id,
      libelle: d.libelle,
      avecModele: d.avecModele,
      ordre: d.ordre + 1,
    }));
}

/** La piece « ordonnance », toujours en tete. */
export function pieceOrdonnance(): PieceACreer {
  return {
    piece: "ordonnance",
    documentDemandeId: null,
    libelle: LIBELLE_ORDONNANCE,
    avecModele: false,
    ordre: 0,
  };
}

/**
 * Ajoute les pieces manquantes a un lien. N'en retire jamais : un patient qui
 * a recu un lien pour un questionnaire le garde meme si le client coupe
 * l'interrupteur ensuite.
 */
export async function ajouterPieces(
  uploadId: number,
  pieces: PieceACreer[],
  client: Pick<PoolClient, "query"> = db
): Promise<void> {
  for (const p of pieces) {
    await client.query(
      `INSERT INTO "PieceAttendue"
         ("uploadId", "piece", "documentDemandeId", "libelle", "avecModele", "ordre")
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ("uploadId", "piece", COALESCE("documentDemandeId", 0)) DO NOTHING`,
      [uploadId, p.piece, p.documentDemandeId, p.libelle, p.avecModele, p.ordre]
    );
  }
}

/** Les pieces d'un lien, dans l'ordre d'affichage. */
export async function piecesDuLien(uploadId: number): Promise<
  {
    id: number;
    piece: SortePiece;
    documentDemandeId: number | null;
    libelle: string;
    avecModele: boolean;
    recueAt: Date | null;
  }[]
> {
  // `avecModele` se lit sur le document du jour, pas sur la piece : un modele
  // depose ou retire apres l'envoi du lien vaut aussi pour lui.
  const res = await db.query(
    `SELECT p."id", p."piece", p."documentDemandeId", p."libelle",
            (dd."modeleContenu" IS NOT NULL) AS "avecModele", p."recueAt"
       FROM "PieceAttendue" p
       LEFT JOIN "DocumentDemande" dd ON dd."id" = p."documentDemandeId"
      WHERE p."uploadId" = $1
      ORDER BY p."ordre" ASC, p."id" ASC`,
    [uploadId]
  );
  return res.rows;
}

/**
 * Fragment SQL : le lien `pu` a-t-il une piece de cette sorte encore ouverte
 * (ni recue, ni classee) ? `$sorte` est interpole depuis une constante, jamais
 * depuis une entree utilisateur.
 */
export function pieceOuverteSql(sorte: SortePiece | null): string {
  const filtre = sorte ? `AND p."piece" = '${sorte}'` : "";
  return `EXISTS (
    SELECT 1 FROM "PieceAttendue" p
     WHERE p."uploadId" = pu."id"
       ${filtre}
       AND p."recueAt" IS NULL
       AND p."alertResolvedAt" IS NULL
  )`;
}

/** Section de l'ecran secretaire, depuis le parametre `section`. */
export function sortieDeSection(raw: string | null): SortePiece {
  return raw === "documents" ? "document" : "ordonnance";
}

/**
 * Pour le robot (`GET /api/configuration`, cle `documentsDemandes`) : par type
 * d'examen, les libelles des documents mis a disposition, pour tous les
 * patients (`tous`) ou pour les mineurs seulement (`mineurs`). Seuls les
 * types qui ont un document y figurent ; aucun modele n'y descend.
 * Le robot s'en sert pour savoir s'il doit appeler /init hors ordonnance, et
 * quoi dire a un patient sans portable ni mail.
 */
export async function documentsParType(
  userProductId: number
): Promise<Partial<Record<ExamTypeKey, { tous: string[]; mineurs: string[] }>>> {
  const res = await db.query<{
    libelle: string;
    typesExamen: unknown;
    mineursSeulement: boolean;
  }>(
    `SELECT "libelle", "typesExamen", "mineursSeulement"
       FROM "DocumentDemande"
      WHERE "userProductId" = $1
        AND "disponible" = true
        AND "archivedAt" IS NULL
      ORDER BY "ordre" ASC, "id" ASC`,
    [userProductId]
  );
  const out: Partial<Record<ExamTypeKey, { tous: string[]; mineurs: string[] }>> = {};
  for (const d of res.rows) {
    for (const t of normaliserTypesExamen(d.typesExamen)) {
      const entree = (out[t] ??= { tous: [], mineurs: [] });
      (d.mineursSeulement ? entree.mineurs : entree.tous).push(d.libelle);
    }
  }
  return out;
}
