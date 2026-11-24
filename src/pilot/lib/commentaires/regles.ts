/**
 * Qui fait quoi sur un commentaire (lot T). Fonctions pures : la garde serveur
 * et l'écran lisent les mêmes. Un commentaire ne se modifie pas : on le
 * supprime et on en écrit un autre.
 */
import { pouvoirsPilot } from "@/pilot/lib/autorisations";

type Acteur = { id: number; role: string; administrateurPilot?: boolean };

export const MESSAGE_SUPPRESSION_REFUSEE = "Seule la personne qui a écrit le commentaire, ou un administrateur de Pilot, peut le supprimer.";
export const MESSAGE_PAS_DESTINATAIRE = "Ce commentaire ne vous était pas adressé.";

/** L'auteur, ou un super-administrateur. Un commentaire dont l'auteur a disparu (`auteurId` nul) n'a plus que le super-administrateur. */
export function peutSupprimerCommentaire(auteurId: number | null, acteur: Acteur): boolean {
  return pouvoirsPilot(acteur) || (auteurId !== null && auteurId === acteur.id);
}
