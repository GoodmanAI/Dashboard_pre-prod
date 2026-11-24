import { grillePourActeur, exigerTarifVisible } from "@/pilot/lib/tarifs/confidentialite";
import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { identifiant } from "@/pilot/lib/validation/commun";
import { messageTarif, modificationTarif, suppressionTarif } from "@/pilot/lib/validation/tarif";
import { modifierTarif, supprimerTarif } from "@/pilot/lib/tarifs/gerer";
import { lireCorps } from "@/pilot/lib/requete";

function lireIds(params: { id: string; tarifId: string }) {
  const grille = identifiant.safeParse(Number(params.id)), tarif = identifiant.safeParse(Number(params.tarifId));
  if (!grille.success || !tarif.success) throw new ErreurMetier("Identifiant invalide.", 400);
  return { grilleId: grille.data, tarifId: tarif.data };
}

export async function PATCH(requete: Request, { params }: { params: { id: string; tarifId: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierLesMontants(utilisateur));
    const { grilleId, tarifId } = lireIds(params);
    await exigerTarifVisible(tarifId, utilisateur);
    const analyse = modificationTarif.safeParse(await lireCorps(requete));
    if (!analyse.success) throw new ErreurMetier(messageTarif(analyse.error), 400);
    const resultat = await modifierTarif(grilleId, tarifId, analyse.data, utilisateur.id);
    return NextResponse.json({ ...resultat, grille: grillePourActeur(resultat.grille, utilisateur) });
  } catch (erreur) { return reponseErreur(erreur); }
}

/** Le corps porte la version lue de la grille : `{ "majLe": "…" }`. */
export async function DELETE(requete: Request, { params }: { params: { id: string; tarifId: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierLesMontants(utilisateur));
    const { grilleId, tarifId } = lireIds(params);
    await exigerTarifVisible(tarifId, utilisateur);
    const analyse = suppressionTarif.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageTarif(analyse.error), 400);
    const resultat = await supprimerTarif(grilleId, tarifId, analyse.data, utilisateur.id);
    return NextResponse.json({ ...resultat, grille: grillePourActeur(resultat.grille, utilisateur) });
  } catch (erreur) { return reponseErreur(erreur); }
}
