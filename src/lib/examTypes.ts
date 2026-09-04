/**
 * Les cinq types d'examen, et comment retrouver celui d'une ligne `ExamMapping`.
 * -----------------------------------------------------------------------------
 * Module PUR : pas de React, pas de Prisma. Importable depuis une route serveur
 * comme depuis un ecran client.
 *
 * ── Pourquoi une fonction de recuperation ────────────────────────────────────
 * Trois chemins ont ecrit dans `ExamMapping`, avec trois conventions :
 *
 *   | Chemin                            | examCode      | fr           | labelFr    |
 *   |-----------------------------------|---------------|--------------|------------|
 *   | ecran diminutifs, avant le 06/08  | canonique     | "Scanner" x5 | "CT"       |
 *   | ecran diminutifs, apres le 06/08  | rang "0".."4" | par position | undefined  |
 *   | script de provisionnement Pontivy | code RIS      | correct      | canonique  |
 *
 * Audit du 2026-09-04 sur les treize centres : une seule ligne restait hors
 * nomenclature, la radio de Pontivy (`examCode = 'DX'`, `labelFr = 'RX'`). Elle
 * est normalisee par `2026_09_04_normalise_exam_code.sql`.
 *
 * `codeCanonique` existe pour que la lecture reste juste MEME si une ligne
 * revient un jour hors nomenclature : l'affichage ne doit plus jamais dependre
 * d'une migration passee.
 */

/** Les cinq types, dans l'ordre d'affichage. La cle fait foi. */
export const EXAM_TYPES = ["US", "MG", "RX", "MR", "CT"] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

const EST_TYPE = new Set<string>(EXAM_TYPES);

/**
 * Libelle stocke dans `ExamMapping.fr`.
 *
 * SANS accent et "Radio" plutot que "Radiographie" : ce sont les valeurs que la
 * table `examCodeMap` de `api/configuration/route.ts` sait retraduire en code.
 * Les remplacer par des variantes accentuees casse ce retour sans lever
 * d'erreur. Le libelle AFFICHE, lui, vient de `EXAM_TYPE_LABELS`
 * (`components/shared/ExamTypeBadge`), et peut etre accentue.
 */
export const LIBELLE_STOCKE: Record<ExamType, string> = {
  US: "Echographie",
  MG: "Mammographie",
  RX: "Radio",
  MR: "IRM",
  CT: "Scanner",
};

const TYPE_PAR_LIBELLE = new Map<string, ExamType>(
  EXAM_TYPES.map((code) => [LIBELLE_STOCKE[code].toLowerCase(), code])
);

export type LigneExamMapping = {
  examCode?: string | null;
  fr?: string | null;
  labelFr?: string | null;
  diminutif?: string | null;
};

/**
 * Le type canonique d'une ligne, ou `null` si elle est irrecuperable.
 *
 * Ordre des sources, du plus fiable au moins fiable :
 *   1. `examCode`, s'il est deja canonique ;
 *   2. `labelFr`, ou le script de provisionnement a mis le code canonique ;
 *   3. `fr`, en DERNIER recours seulement.
 *
 * `fr` est en dernier parce que c'est precisement la colonne qui a ete
 * corrompue : plusieurs centres l'ont eue a "Scanner" sur leurs cinq lignes. La
 * consulter plus tot ferait de tout examen un scanner, ce qu'on vient de
 * corriger.
 */
export function codeCanonique(ligne: LigneExamMapping): ExamType | null {
  const examCode = ligne.examCode?.trim().toUpperCase();
  if (examCode && EST_TYPE.has(examCode)) return examCode as ExamType;

  const labelFr = ligne.labelFr?.trim().toUpperCase();
  if (labelFr && EST_TYPE.has(labelFr)) return labelFr as ExamType;

  const fr = ligne.fr?.trim().toLowerCase();
  if (fr && TYPE_PAR_LIBELLE.has(fr)) return TYPE_PAR_LIBELLE.get(fr)!;

  return null;
}

/**
 * Les lignes d'un centre indexees par type canonique.
 * En cas de collision (deux lignes ramenees au meme type), la premiere gagne :
 * on prefere une valeur stable a une valeur arbitraire.
 */
export function indexerParType(
  lignes: LigneExamMapping[]
): Map<ExamType, LigneExamMapping> {
  const parType = new Map<ExamType, LigneExamMapping>();
  for (const ligne of lignes) {
    const code = codeCanonique(ligne);
    if (code && !parType.has(code)) parType.set(code, ligne);
  }
  return parType;
}

/**
 * Le code que le logiciel du centre emploie pour un type, c'est-a-dire ce que
 * LyraeTalk renvoie dans `stats.exam_type_id`. A defaut, le code canonique.
 */
export function diminutifDuType(
  parType: Map<ExamType, LigneExamMapping>,
  code: ExamType
): string {
  return parType.get(code)?.diminutif?.trim() || code;
}
