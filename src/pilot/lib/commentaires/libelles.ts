import type { CrmCibleCommentaire, CrmDepartement } from "@prisma/client";
import { LIBELLES_DEPARTEMENT } from "@/pilot/lib/acces/departements";

/**
 * Qui un commentaire prévient, en clair (lot T). Pour l'écran : « Prévenus :
 * Projet ». Pour le journal : le `resume` se construit ici, avec des libellés
 * du code, jamais avec le texte du commentaire ni le nom d'une personne (C-22).
 */
export function libelleCible(cible: CrmCibleCommentaire, departement: CrmDepartement | null, personneNom: string | null): string {
  switch (cible) {
    case "AUCUN": return "Personne";
    case "TOUS": return "Toute l'équipe";
    case "DEPARTEMENT": return departement ? `Département ${LIBELLES_DEPARTEMENT[departement]}` : "Un département";
    case "PERSONNE": return personneNom ?? "Compte supprimé";
  }
}

export const RESUME_COMMENTAIRE_SUPPRIME = "Commentaire supprimé";

/** Le résumé du journal : la cible par son genre, jamais le nom de la personne ni le texte. */
export function resumeCommentaireEcrit(cible: CrmCibleCommentaire, departement: CrmDepartement | null): string {
  switch (cible) {
    case "AUCUN": return "Commentaire écrit, sans prévenir personne";
    case "TOUS": return "Commentaire écrit, toute l'équipe prévenue";
    case "DEPARTEMENT": return `Commentaire écrit, département ${departement ? LIBELLES_DEPARTEMENT[departement] : "inconnu"} prévenu`;
    case "PERSONNE": return "Commentaire écrit, une personne prévenue";
  }
}
