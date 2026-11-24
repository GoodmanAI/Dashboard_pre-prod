import type { CrmDepartement } from "@prisma/client";

/**
 * Qui un commentaire prévient (lot T). Fonction pure : le service lit l'équipe
 * au moment de l'écriture, la passe ici, et fige le résultat dans
 * `CrmDestinataireCommentaire`.
 *
 * - L'auteur ne fait jamais partie des destinataires.
 * - Un compte dont l'accès est retiré ne reçoit rien (C-64) : il ne se connecte
 *   plus, une alerte ne lui servirait à rien et resterait là s'il revenait.
 * - Un compte CLIENT n'est jamais de l'équipe.
 * - Une alerte à personne est refusée (département vide, équipe réduite à
 *   l'auteur) : mieux vaut le dire que d'afficher « prévenu » sans prévenir
 *   quiconque. Pour ne prévenir personne, la cible est AUCUN.
 */
export type CompteEquipe = {
  id: number;
  /** Pour un message de refus ; facultatif. */
  nom?: string | null;
  role: string;
  /** Null : département pas encore choisi. */
  departement: CrmDepartement | null;
  accesRetire: boolean;
};

export type CibleCommentaire =
  | { cible: "AUCUN" }
  | { cible: "TOUS" }
  | { cible: "DEPARTEMENT"; departement: CrmDepartement }
  | { cible: "PERSONNE"; personneId: number };

export type Destinataires =
  | { ok: true; destinataires: number[] }
  | { ok: false; statut: 400; message: string };

export const MESSAGE_PERSONNE_INCONNUE = "Choisissez une personne de l'équipe Lyrae.";
export const MESSAGE_SOI_MEME = "Choisissez une autre personne. Pour vous-même, gardez le commentaire sans prévenir personne.";
export const MESSAGE_DEPARTEMENT_VIDE = "Personne d'autre que vous n'est dans ce département.";
export const MESSAGE_EQUIPE_VIDE = "Personne d'autre que vous n'est dans l'équipe.";

const refus = (message: string): Destinataires => ({ ok: false, statut: 400, message });

const interne = (c: CompteEquipe) => c.role === "SUPER_ADMIN" || c.role === "ADMIN";
/** De l'équipe : un compte interne dont l'accès n'est pas retiré. Même règle que la connexion (`utilisateurCourant`). */
const actif = (c: CompteEquipe) => interne(c) && !c.accesRetire;

const trier = (ids: number[]) => [...new Set(ids)].sort((a, b) => a - b);

export function calculerDestinataires(cible: CibleCommentaire, auteurId: number, equipe: readonly CompteEquipe[]): Destinataires {
  switch (cible.cible) {
    case "AUCUN":
      return { ok: true, destinataires: [] };
    case "TOUS": {
      const ids = trier(equipe.filter((c) => actif(c) && c.id !== auteurId).map((c) => c.id));
      return ids.length ? { ok: true, destinataires: ids } : refus(MESSAGE_EQUIPE_VIDE);
    }
    case "DEPARTEMENT": {
      const ids = trier(equipe.filter((c) => actif(c) && c.id !== auteurId && c.departement === cible.departement).map((c) => c.id));
      return ids.length ? { ok: true, destinataires: ids } : refus(MESSAGE_DEPARTEMENT_VIDE);
    }
    case "PERSONNE": {
      if (cible.personneId === auteurId) return refus(MESSAGE_SOI_MEME);
      const personne = equipe.find((c) => c.id === cible.personneId && interne(c));
      if (!personne) return refus(MESSAGE_PERSONNE_INCONNUE);
      if (personne.accesRetire) return refus(`${personne.nom ?? "Ce collègue"} n'a plus accès à Pilot. Choisissez quelqu'un d'autre.`);
      return { ok: true, destinataires: [personne.id] };
    }
  }
}
