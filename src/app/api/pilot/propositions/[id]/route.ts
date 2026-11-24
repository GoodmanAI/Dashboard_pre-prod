import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { identifiant } from "@/pilot/lib/validation/commun";
import { modificationProposition } from "@/pilot/lib/validation/proposition";
import { modifierProposition } from "@/pilot/lib/propositions/modifierProposition";
import { changerStatut } from "@/pilot/lib/propositions/changerStatut";
import { lireCorps } from "@/pilot/lib/requete";

export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierLesMontants(utilisateur));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = modificationProposition.safeParse(await lireCorps(requete));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    const p = analyse.data;
    let proposition;
    if (p.operation === "modifier") {
      const { operation, ...donnees } = p; void operation;
      proposition = await modifierProposition(id.data, donnees, utilisateur.id);
    } else {
      const { operation, ...donnees } = p; void operation;
      proposition = await changerStatut(id.data, donnees, utilisateur.id);
    }
    return NextResponse.json({ proposition });
  } catch (erreur) { return reponseErreur(erreur); }
}
