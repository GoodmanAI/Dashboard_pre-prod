import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { identifiant } from "@/pilot/lib/validation/commun";
import { modificationLigneContrat } from "@/pilot/lib/validation/contrat";
import { modifierLigne, retirerLigne } from "@/pilot/lib/contrats/lignes";

export async function PATCH(requete: Request, { params }: { params: { id: string; ligneId: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierLesMontants(utilisateur));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const ligneId = identifiant.safeParse(Number(params.ligneId));
    if (!ligneId.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = modificationLigneContrat.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    return NextResponse.json(await modifierLigne(id.data, ligneId.data, analyse.data, utilisateur.id));
  } catch (erreur) { return reponseErreur(erreur); }
}
export async function DELETE(_requete: Request, { params }: { params: { id: string; ligneId: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierLesMontants(utilisateur));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const ligneId = identifiant.safeParse(Number(params.ligneId));
    if (!ligneId.success) throw new ErreurMetier("Identifiant invalide.", 400);
    return NextResponse.json(await retirerLigne(id.data, ligneId.data, utilisateur.id));
  } catch (erreur) { return reponseErreur(erreur); }
}
