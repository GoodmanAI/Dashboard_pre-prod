import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { majRattachement } from "@/pilot/lib/validation/centre";
import { identifiant } from "@/pilot/lib/validation/commun";
import { modifierRattachement } from "@/pilot/lib/centres/rattacher";
import { retirerRattachement } from "@/pilot/lib/centres/retirer";

export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = majRattachement.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier("Corps de requête invalide.", 400);
    const rattachement = await modifierRattachement(id.data, analyse.data, utilisateur.id);
    return NextResponse.json({ rattachement });
  } catch (erreur) { return reponseErreur(erreur); }
}

export async function DELETE(_requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    return NextResponse.json(await retirerRattachement(id.data, utilisateur.id));
  } catch (erreur) { return reponseErreur(erreur); }
}
