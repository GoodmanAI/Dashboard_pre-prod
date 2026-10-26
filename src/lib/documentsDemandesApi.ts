/**
 * Lecture des documents demandes pour les ecrans (admin et client), sans le
 * contenu du modele. Partage par les routes /api/documents-demandes/*.
 * Plan : plans/2026-10-documents-demandes.md (workspace).
 */

import { db } from "@/lib/db";
import { FORMULAIRE_VALABLE_SQL, normaliserTypesExamen } from "@/lib/piecesAttendues";
import type { ExamTypeKey } from "@/lib/smsConfirmationConfig";

export interface DocumentDemandeVue {
  id: number;
  userProductId: number;
  libelle: string;
  /** Libelle de la piece jointe dans Xplore, tel que le client l'a saisi. */
  libelleXplore: string | null;
  typesExamen: ExamTypeKey[];
  mineursSeulement: boolean;
  grossesseSeulement: boolean;
  /** Mis a disposition des patients de LyraeTalk. */
  disponible: boolean;
  /** Mis a disposition des patients de Konnect (26/10/2026). */
  disponibleKonnect: boolean;
  ordre: number;
  modele: { nom: string | null; octets: number; maj: string | null } | null;
  /**
   * Questionnaire en ligne (plans/2026-10-questionnaires-en-ligne.md) :
   * `actif` s'il est prepare sur le modele actuel ; `coupe` s'il a ete prepare
   * sur un modele remplace depuis (le patient retombe sur le telechargement).
   */
  enLigne: "actif" | "coupe" | null;
  archive: boolean;
}

export const LIBELLE_MAX = 120;

/** Spec Xplore (SendOrdonnance) : 64 caracteres au plus. */
export const LIBELLE_XPLORE_MAX = 64;

export async function lireDocumentsDemandes(
  userProductId: number,
  avecArchives = false
): Promise<DocumentDemandeVue[]> {
  const res = await db.query<{
    id: number;
    userProductId: number;
    libelle: string;
    libelleXplore: string | null;
    typesExamen: unknown;
    mineursSeulement: boolean;
    grossesseSeulement: boolean;
    disponible: boolean;
    disponibleKonnect: boolean;
    ordre: number;
    modeleNom: string | null;
    modeleOctets: number | null;
    modeleMaj: Date | null;
    archivedAt: Date | null;
    formulairePrepare: boolean;
    formulaireValable: boolean;
  }>(
    `SELECT "id", "userProductId", "libelle", "libelleXplore", "typesExamen", "mineursSeulement",
            "grossesseSeulement", "disponible", "disponibleKonnect", "ordre", "modeleNom",
            octet_length("modeleContenu") AS "modeleOctets", "modeleMaj",
            "archivedAt",
            ("formulaire" IS NOT NULL) AS "formulairePrepare",
            ${FORMULAIRE_VALABLE_SQL} AS "formulaireValable"
       FROM "DocumentDemande" dd
      WHERE "userProductId" = $1
        AND ($2::boolean OR "archivedAt" IS NULL)
      ORDER BY ("archivedAt" IS NOT NULL), "ordre" ASC, "id" ASC`,
    [userProductId, avecArchives]
  );
  return res.rows.map((r) => ({
    id: r.id,
    userProductId: r.userProductId,
    libelle: r.libelle,
    libelleXplore: r.libelleXplore,
    typesExamen: normaliserTypesExamen(r.typesExamen),
    mineursSeulement: r.mineursSeulement,
    grossesseSeulement: r.grossesseSeulement,
    disponible: r.disponible,
    disponibleKonnect: r.disponibleKonnect,
    ordre: r.ordre,
    modele:
      r.modeleOctets !== null
        ? {
            nom: r.modeleNom,
            octets: Number(r.modeleOctets),
            maj: r.modeleMaj ? r.modeleMaj.toISOString() : null,
          }
        : null,
    enLigne: r.formulaireValable ? "actif" : r.formulairePrepare ? "coupe" : null,
    archive: r.archivedAt !== null,
  }));
}

/** Le userProductId d'un document, ou null s'il n'existe pas. */
export async function proprietaireDocument(id: number): Promise<number | null> {
  const res = await db.query<{ userProductId: number }>(
    `SELECT "userProductId" FROM "DocumentDemande" WHERE "id" = $1`,
    [id]
  );
  return res.rows[0]?.userProductId ?? null;
}

/** Libelle propre : espaces resserres, borne, ou null s'il est vide. */
export function libelleValide(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.replace(/\s+/g, " ").trim().slice(0, LIBELLE_MAX);
  return v.length > 0 ? v : null;
}

/**
 * Libelle Xplore saisi par le client : espaces resserres, borne a 64. Vide =>
 * null (non renseigne, AI2Xplore depose alors sous `libelle`). `undefined` si
 * la valeur n'est pas une chaine ni null.
 */
export function libelleXploreValide(raw: unknown): string | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const v = raw.replace(/\s+/g, " ").trim().slice(0, LIBELLE_XPLORE_MAX);
  return v.length > 0 ? v : null;
}
