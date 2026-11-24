import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { majContact } from "@/pilot/lib/validation/contact";
import { identifiant } from "@/pilot/lib/validation/commun";
import { modifierContact, supprimerContact } from "@/pilot/lib/contacts/gerer";

export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = majContact.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier("Corps de requête invalide.", 400);
    const contact = await modifierContact(id.data, analyse.data, utilisateur.id);
    return NextResponse.json({ contact });
  } catch (erreur) { return reponseErreur(erreur); }
}

export async function DELETE(_requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    await supprimerContact(id.data, utilisateur.id);
    return NextResponse.json({ supprime: true });
  } catch (erreur) { return reponseErreur(erreur); }
}
