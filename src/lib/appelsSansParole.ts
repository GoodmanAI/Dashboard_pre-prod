/**
 * Appels où le patient n'a dit aucun mot (22/11/2026, décision d'Enzo).
 *
 * Un appel de plus de 15 s sans aucune ligne `Patient:` dans sa transcription ne compte
 * plus nulle part dans les écrans du client : ni dans la liste des appels, ni dans les
 * totaux, ni dans les pourcentages. Il est seulement compté à part, dans la tuile
 * « Appels sans parole » des statistiques. Mesuré le 22/11 sur 30 jours, appels de plus de
 * 15 s : 740 à Pontivy, dont 701 n'ont que l'accueil (un tour) et étaient déjà écartés par la
 * règle « plus d'un échange » ; ce changement en retire 39 de plus (Menton 8, Cognac 15).
 * Cause à Pontivy : l'accueil long (plan, « Pourquoi »).
 *
 * Le nombre de tours du patient est écrit dans `CallConversation."nbToursPatient"` à
 * l'arrivée de l'appel (`/api/calls/summary`), parce que la transcription est effacée au
 * bout de trois mois (rétention) et que les statistiques couvrent l'année. NULL = ligne
 * anonymisée avant que la colonne existe : on ne sait pas, l'appel reste compté.
 *
 * Seulement « aucun mot » : un patient qui n'a dit que « Allô ? » reste compté (choix
 * d'Enzo). Le rapport du matin de Daily Report applique la même règle.
 *
 * Plan : `plans/2026-11-appels-sans-parole.md`.
 */
import { Prisma } from "@prisma/client";
import { lireTour } from "@/lib/entitesTranscription";

/** Nombre de lignes du patient qui portent au moins un caractère. */
export function compterToursPatient(steps: unknown[]): number {
  let n = 0;
  steps.forEach((brut, i) => {
    const tour = lireTour(brut as any, i);
    if (tour.locuteur === "Patient" && tour.texte.trim() !== "") n++;
  });
  return n;
}

/** Vrai si la ligne lue doit être comptée (NULL = inconnu = comptée). */
export function patientAParle(ligne: { nbToursPatient?: number | null }): boolean {
  return ligne?.nbToursPatient == null || ligne.nbToursPatient > 0;
}

/** Condition SQL : le patient a parlé, ou on ne sait pas. */
export const SQL_PATIENT_A_PARLE = Prisma.sql`COALESCE("nbToursPatient", 1) > 0`;

/** Condition SQL : le patient n'a dit aucun mot. */
export const SQL_SANS_PAROLE = Prisma.sql`"nbToursPatient" = 0`;
