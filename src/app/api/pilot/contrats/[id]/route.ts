import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { identifiant } from "@/pilot/lib/validation/commun";
import { modificationContrat } from "@/pilot/lib/validation/contrat";
import { modifierContrat, changerStatutContrat, supprimerContrat } from "@/pilot/lib/contrats/gerer";

export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierLesMontants(utilisateur));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = modificationContrat.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    const p = analyse.data;
    if (p.operation === "modifier") {
      const { operation, ...champs } = p; void operation;
      return NextResponse.json({ contrat: await modifierContrat(id.data, champs, utilisateur.id) });
    }
    const { operation, ...champs } = p; void operation;
    // L'activation rend aussi le bilan des opportunités : gagnées, et celles qui restent ouvertes (C-71).
    return NextResponse.json(await changerStatutContrat(id.data, champs, utilisateur.id));
  } catch (erreur) { return reponseErreur(erreur); }
}

export async function DELETE(_requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierLesMontants(utilisateur));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    return NextResponse.json(await supprimerContrat(id.data, utilisateur.id));
  } catch (erreur) { return reponseErreur(erreur); }
}
