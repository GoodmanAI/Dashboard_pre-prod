import type { FocusEvent } from "react";

/**
 * Un champ de montant ou de pourcentage : clavier décimal sur mobile, et la
 * valeur entière sélectionnée au focus, pour que la saisie la remplace au lieu
 * de s'ajouter au bout (« 0,00450,50 »).
 */
export const CHAMP_DECIMAL = {
  inputMode: "decimal" as const,
  onFocus: (e: FocusEvent<HTMLInputElement>) => e.currentTarget.select(),
};
