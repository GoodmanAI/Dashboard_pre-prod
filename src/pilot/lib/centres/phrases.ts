/** Ce que l'écran dit après une signature (C-90) : les produits ajoutés aux centres, et ceux qu'il reste à placer. */
export function phraseRattachements(crees: number, sansCentre: string | null): string {
  const ajoutes = crees ? ` ${crees} produit${crees > 1 ? "s" : ""} ajouté${crees > 1 ? "s" : ""} aux centres.` : "";
  return ajoutes + (sansCentre ? ` ${sansCentre}` : "");
}
