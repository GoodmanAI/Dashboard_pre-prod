import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutGererComptes, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { messageParlant } from "@/pilot/lib/validation/messages";
import { majOrganisation } from "@/pilot/lib/validation/organisation";
import { identifiant } from "@/pilot/lib/validation/commun";
import { modifierOrganisation } from "@/pilot/lib/organisations/modifier";
import { supprimerFiche } from "@/pilot/lib/organisations/supprimer";
import { lireCorps } from "@/pilot/lib/requete";

export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = majOrganisation.safeParse(await lireCorps(requete));
    if (!analyse.success) throw new ErreurMetier(messageParlant(analyse.error) ?? "Corps de requête invalide.", 400);
    const organisation = await modifierOrganisation(id.data, analyse.data, utilisateur.id);
    return NextResponse.json({ organisation });
  } catch (erreur) { return reponseErreur(erreur); }
}

/** Une fiche créée par erreur ou en double (C-86) : le super-administrateur seul, et jamais si de l'argent y est passé. */
export async function DELETE(_requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutGererComptes(utilisateur.role), "Seul le super-administrateur supprime une fiche.");
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    return NextResponse.json(await supprimerFiche(id.data, utilisateur.id));
  } catch (erreur) { return reponseErreur(erreur); }
}
