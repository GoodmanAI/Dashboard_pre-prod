/**
 * Questionnaires du centre remplis dans le parcours de Konnect.
 *
 * Konnect fait remplir au patient, apres le choix du creneau, les documents
 * demandes que le client a mis a disposition de Konnect (`disponibleKonnect`)
 * et qui se remplissent en ligne (formulaire prepare sur le modele actuel). Le
 * Dashboard reste la seule source des modeles, des formulaires et du PDF :
 * Konnect lit la liste, fait produire le PDF ici, puis l'envoie lui-meme dans
 * Xplore avec l'ordonnance. Rien n'est garde ici : ni reponse, ni PDF.
 *
 * Plan : plans/2026-10-konnect-questionnaires-centre.md (workspace),
 * DECISIONS.md du 26/10/2026.
 */

import { db } from "@/lib/db";
import { documentsApplicables } from "@/lib/piecesAttendues";
import { formulaireSchema, type Formulaire } from "@/lib/formulaires";
import { empreinteModele } from "@/lib/formulairesPdf";
import { EXAM_TYPE_KEYS } from "@/lib/smsConfirmationConfig";

/** Le type d'examen recu, s'il est une cle canonique du Dashboard. */
export function typeExamenValide(raw: unknown): string | null {
  return typeof raw === "string" && (EXAM_TYPE_KEYS as readonly string[]).includes(raw)
    ? raw
    : null;
}

/** Le userProductId du centre, par son code de site Xplore (comme /init). */
export async function centreDuCode(externalCenterCode: unknown): Promise<number | null> {
  if (typeof externalCenterCode !== "string" || !externalCenterCode) return null;
  const res = await db.query<{ userProductId: number }>(
    `SELECT up."id" AS "userProductId"
       FROM "ExternalCenterMapping" m
       JOIN "UserProduct" up ON up."id" = m."userProductId"
      WHERE m."externalCenterCode" = $1
        AND up."removedAt" IS NULL
      LIMIT 1`,
    [externalCenterCode]
  );
  return res.rows[0]?.userProductId ?? null;
}

export interface QuestionnaireKonnect {
  id: number;
  libelle: string;
  /** Libelle de la piece jointe dans Xplore ; null : Konnect prend `libelle`. */
  libelleXplore: string | null;
  formulaire: Formulaire;
  modele: Buffer;
}

/**
 * Un document du client mis a disposition de Konnect, avec un formulaire
 * valable (prepare sur le modele actuellement en base), sinon null. Un
 * document qui ne se remplit pas en ligne reste au lien de depot.
 */
export async function questionnaireDuDocument(
  userProductId: number,
  id: number
): Promise<QuestionnaireKonnect | null> {
  const res = await db.query<{
    libelle: string;
    libelleXplore: string | null;
    formulaire: unknown;
    formulaireEmpreinte: string | null;
    modeleContenu: Buffer | null;
  }>(
    `SELECT "libelle", "libelleXplore", "formulaire", "formulaireEmpreinte", "modeleContenu"
       FROM "DocumentDemande"
      WHERE "id" = $1
        AND "userProductId" = $2
        AND "disponibleKonnect" = true
        AND "archivedAt" IS NULL
      LIMIT 1`,
    [id, userProductId]
  );
  const row = res.rows[0];
  if (!row?.formulaire || !row.modeleContenu || !row.formulaireEmpreinte) return null;
  if (empreinteModele(row.modeleContenu) !== row.formulaireEmpreinte) return null;
  const lu = formulaireSchema.safeParse(row.formulaire);
  if (!lu.success) {
    console.error("[konnect-questionnaires] formulaire illisible pour le document", id);
    return null;
  }
  return {
    id,
    libelle: row.libelle,
    libelleXplore: row.libelleXplore,
    formulaire: lu.data,
    modele: row.modeleContenu,
  };
}

/**
 * Les questionnaires a faire remplir pour cet examen et ce patient : memes
 * regles que les pieces d'un lien (`documentsApplicables`, canal Konnect),
 * limitees a ceux qui se remplissent en ligne, dans l'ordre du client.
 */
export async function questionnairesApplicables(
  userProductId: number,
  examType: string,
  mineur: boolean,
  grossessePossible: boolean
): Promise<QuestionnaireKonnect[]> {
  const docs = await documentsApplicables(
    userProductId,
    examType,
    mineur,
    grossessePossible,
    "konnect"
  );
  const out: QuestionnaireKonnect[] = [];
  for (const d of docs) {
    if (d.documentDemandeId === null) continue;
    const q = await questionnaireDuDocument(userProductId, d.documentDemandeId);
    if (q) out.push(q);
  }
  return out;
}
