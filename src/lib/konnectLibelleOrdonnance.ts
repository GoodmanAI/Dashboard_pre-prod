/**
 * Nom de la piece jointe de l'ordonnance que Konnect depose dans Xplore
 * (domaine `konnect.libelle-ordonnance`, 26/10/2026).
 *
 * Xplore renomme tout libelle absent de sa liste de pieces jointes
 * (plans/2026-10-libelle-xplore-des-documents.md) : le client recopie le sien,
 * comme pour chaque questionnaire (`DocumentDemande.libelleXplore`). Vide :
 * Konnect garde son libelle d'avant (« Ordonnance 1/2 »...).
 * Plan : plans/2026-10-konnect-questionnaires-centre.md.
 */

/** Spec Xplore (SendOrdonnance) : 64 caracteres au plus, comme `LIBELLE_XPLORE_MAX`
 * de documentsDemandesApi.ts (non importe : ce fichier est lu par un ecran). */
export const LIBELLE_XPLORE_MAX = 64;

export const DOMAINE_LIBELLE_ORDONNANCE = "konnect.libelle-ordonnance";

export interface LibelleOrdonnance {
  libelle: string | null;
}

export function lireLibelleOrdonnance(raw: unknown): LibelleOrdonnance {
  const v =
    raw && typeof raw === "object" ? (raw as { libelle?: unknown }).libelle : undefined;
  if (typeof v !== "string") return { libelle: null };
  const propre = v.replace(/\s+/g, " ").trim().slice(0, LIBELLE_XPLORE_MAX);
  return { libelle: propre || null };
}

export function validerLibelleOrdonnance(
  raw: unknown
): { valeur: LibelleOrdonnance } | { erreur: string } {
  if (!raw || typeof raw !== "object") return { erreur: "Valeur absente." };
  const v = (raw as { libelle?: unknown }).libelle;
  if (v !== null && v !== undefined && typeof v !== "string") {
    return { erreur: "Le nom dans Xplore doit être un texte." };
  }
  return { valeur: lireLibelleOrdonnance(raw) };
}
