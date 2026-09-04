import { EXAM_TYPE_LABELS } from "@/components/shared/ExamTypeBadge";

/**
 * Traduction d'un `stats.exam_type_id` en libellé affichable.
 * -----------------------------------------------------------------------------
 * LyraeTalk remonte dans `stats.exam_type_id` le code que le logiciel de gestion
 * du centre utilise pour le type d'examen : le « diminutif ». Chez RIM29SUD une
 * radio vaut `DX`, ailleurs elle vaut `RX`. Pour l'afficher, il faut donc la
 * table `ExamMapping` du centre.
 *
 * DEUX RÈGLES, nées d'un incident réel (groupe Quimper, constaté le 2026-09-04 :
 * six rendez-vous, quatre mammographies et deux échographies, tous affichés
 * « Scanner ») :
 *
 *   1. Le libellé vient du CODE CANONIQUE de la ligne (US/MG/RX/MR/CT), jamais
 *      de sa colonne `fr`. L'ancien écran de saisie déduisait `fr` du rang de la
 *      ligne et écrivait "Scanner" sur les cinq. Les lignes fautives sont encore
 *      en base sur les centres configurés avant le 2026-09-04.
 *   2. Le code canonique reste toujours reconnu, en plus du diminutif : un
 *      centre dont le RIS utilise les codes standards remonte `US`, pas un
 *      diminutif propre.
 */

/** Ce que renvoie `GET /api/configuration/mapping/type_exam`. */
export type MappingTypeExam = Record<
  string,
  { fr?: string; diminutif?: string } | undefined
>;

function entreesConnues(mapping: MappingTypeExam | null | undefined) {
  return Object.entries(mapping ?? {}).filter(
    ([code, val]) => EXAM_TYPE_LABELS[code] && val && typeof val === "object"
  ) as Array<[string, { fr?: string; diminutif?: string }]>;
}

/**
 * Diminutif (et code canonique) → libellé français.
 * Le code canonique gagne sur un diminutif qui lui ressemblerait.
 */
export function construireExamLabelMap(
  mapping: MappingTypeExam | null | undefined
): Record<string, string> {
  const map: Record<string, string> = {};
  const entrees = entreesConnues(mapping);

  for (const [code, val] of entrees) {
    if (val.diminutif) map[val.diminutif] = EXAM_TYPE_LABELS[code];
  }
  for (const [code] of entrees) {
    map[code] = EXAM_TYPE_LABELS[code];
  }
  return map;
}

/**
 * Une entrée par type d'examen, pour les listes déroulantes.
 * `valeur` est ce qu'il faut comparer à `stats.exam_type_id`, donc le diminutif
 * du centre, et à défaut le code canonique.
 */
export function listerTypesExamen(
  mapping: MappingTypeExam | null | undefined
): Array<{ code: string; valeur: string; label: string }> {
  return entreesConnues(mapping).map(([code, val]) => ({
    code,
    valeur: val.diminutif || code,
    label: EXAM_TYPE_LABELS[code],
  }));
}
