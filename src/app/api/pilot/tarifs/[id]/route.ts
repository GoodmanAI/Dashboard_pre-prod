import { grillePourActeur } from "@/pilot/lib/tarifs/confidentialite";
import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { identifiant } from "@/pilot/lib/validation/commun";
import { messageTarif, modificationGrille, suppressionGrille } from "@/pilot/lib/validation/tarif";
import { modifierGrille, supprimerGrille } from "@/pilot/lib/tarifs/gerer";
import { lireCorps } from "@/pilot/lib/requete";

function lireId(params: { id: string }) {
  const id = identifiant.safeParse(Number(params.id));
  if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
  return id.data;
}

export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierLesMontants(utilisateur));
    const id = lireId(params);
    const analyse = modificationGrille.safeParse(await lireCorps(requete));
    if (!analyse.success) throw new ErreurMetier(messageTarif(analyse.error), 400);
    return NextResponse.json({ grille: grillePourActeur(await modifierGrille(id, analyse.data, utilisateur.id), utilisateur) });
  } catch (erreur) { return reponseErreur(erreur); }
}

/**
 * Supprimer une grille à venir que rien n'utilise. Le corps porte la version
 * lue : `{ "majLe": "…" }`. Une grille utilisée, en vigueur ou passée : 409 et la raison.
 */
export async function DELETE(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierLesMontants(utilisateur));
    const id = lireId(params);
    const analyse = suppressionGrille.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageTarif(analyse.error), 400);
    return NextResponse.json(await supprimerGrille(id, analyse.data, utilisateur.id));
  } catch (erreur) { return reponseErreur(erreur); }
}
