import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { identifiant } from "@/pilot/lib/validation/commun";
import { ligneContrat } from "@/pilot/lib/validation/contrat";
import { ajouterLigne } from "@/pilot/lib/contrats/lignes";

export async function POST(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierLesMontants(utilisateur));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = ligneContrat.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    // Sur un contrat actif, la ligne gagne les opportunités ouvertes de son produit : le bilan le dit (C-71).
    return NextResponse.json(await ajouterLigne(id.data, analyse.data, utilisateur.id), { status: 201 });
  } catch (erreur) { return reponseErreur(erreur); }
}
