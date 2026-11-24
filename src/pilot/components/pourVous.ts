"use client";

/**
 * Ce qui relie, dans le navigateur, les actions qui changent « Pour vous » à
 * la pastille du menu et à la page Aujourd'hui (lot T).
 *
 * - `signalerPourVous()` émet l'événement « pour-vous-change » : la coquille
 *   relit alors le compte (`GET /api/pilot/pour-vous/compte`). À appeler après
 *   un marquage lu, une écriture, une suppression, une demande traitée.
 * - `noterCommentaireLu(id)` le fait aussi, et retient que la liste d'Aujourd'hui
 *   gardée par le routeur est périmée : le cache du routeur de Next 14.2 rend
 *   la page telle qu'elle était au retour arrière, et pendant 30 secondes à une
 *   navigation par le menu. Aujourd'hui se relit alors une fois à son arrivée
 *   (`consommerPerime`), et masque d'ici là les commentaires lus ici
 *   (`commentairesLusIci`), pour ne pas montrer, même un instant, ce qui vient
 *   d'être lu.
 *
 * L'état vit dans le module, le temps de l'onglet : il ne survit pas à un
 * rechargement complet, qui relit tout de toute façon.
 */
export const EVENEMENT_POUR_VOUS = "pour-vous-change";

const lusIci = new Set<number>();
let perime = false;

export function signalerPourVous(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENEMENT_POUR_VOUS));
}

export function noterCommentaireLu(id: number): void {
  lusIci.add(id);
  perime = true;
  signalerPourVous();
}

export function commentairesLusIci(): ReadonlySet<number> {
  return lusIci;
}

/** Vrai une seule fois après un marquage : la page qui le lit se relit. */
export function consommerPerime(): boolean {
  const etait = perime;
  perime = false;
  return etait;
}
