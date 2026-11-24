import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { creationContact } from "@/pilot/lib/validation/contact";
import { ajouterContact } from "@/pilot/lib/contacts/gerer";

export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const analyse = creationContact.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier("Corps de requête invalide.", 400);
    const contact = await ajouterContact(analyse.data, utilisateur.id);
    return NextResponse.json({ contact }, { status: 201 });
  } catch (erreur) { return reponseErreur(erreur); }
}
