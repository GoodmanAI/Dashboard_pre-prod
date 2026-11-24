import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { messageParlant } from "@/pilot/lib/validation/messages";
import { majCentre } from "@/pilot/lib/validation/centre";
import { identifiant } from "@/pilot/lib/validation/commun";
import { modifierCentre } from "@/pilot/lib/centres/gerer";
import { supprimerCentre } from "@/pilot/lib/centres/retirer";
import { lireCorps } from "@/pilot/lib/requete";

export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = majCentre.safeParse(await lireCorps(requete));
    if (!analyse.success) throw new ErreurMetier(messageParlant(analyse.error) ?? "Corps de requête invalide.", 400);
    const centre = await modifierCentre(id.data, analyse.data, utilisateur.id);
    return NextResponse.json({ centre });
  } catch (erreur) { return reponseErreur(erreur); }
}

export async function DELETE(_requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    return NextResponse.json(await supprimerCentre(id.data, utilisateur.id));
  } catch (erreur) { return reponseErreur(erreur); }
}
