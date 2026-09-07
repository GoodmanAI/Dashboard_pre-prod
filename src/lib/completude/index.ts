/**
 * Point d'entrée du registre de complétude.
 *
 * **Le produit n'est jamais un paramètre d'appel.** Il se déduit du
 * `userProductId` via `UserProduct → Product`, exactement comme le fait déjà
 * `ProductConfig`. Le passer de l'extérieur rouvrirait la porte à deux vérités :
 * un appelant pourrait demander la complétude LyraeTalk d'un cabinet Konnect et
 * obtenir une réponse qui n'a aucun sens.
 */

import type { SlugProduit } from "@/lib/produits";
import { REGISTRE_TALK, type ConfigTalk } from "./talk";
import { REGISTRE_KONNECT, type ConfigKonnect } from "./konnect";
import { evaluer, type Completude, type ContexteLien } from "./types";

export * from "./types";
export * from "./validateurs";
export { REGISTRE_TALK, type ConfigTalk } from "./talk";
export { REGISTRE_KONNECT, type ConfigKonnect } from "./konnect";

/** L'instantané attendu par le registre d'un produit. */
export type ConfigProduit =
  | { produit: "talk"; config: ConfigTalk }
  | { produit: "konnect"; config: ConfigKonnect };

/** Combien d'exigences un produit déclare, sans rien lire en base. */
export function tailleRegistre(produit: SlugProduit): number {
  return produit === "talk" ? REGISTRE_TALK.length : REGISTRE_KONNECT.length;
}

/** Applique le bon registre à l'instantané d'un centre. */
export function evaluerCentre(
  entree: ConfigProduit,
  ctx: ContexteLien
): Completude {
  return entree.produit === "talk"
    ? evaluer(REGISTRE_TALK, entree.config, ctx)
    : evaluer(REGISTRE_KONNECT, entree.config, ctx);
}
