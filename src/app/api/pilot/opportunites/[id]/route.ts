import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { identifiant } from "@/pilot/lib/validation/commun";
import { modificationOpportunite } from "@/pilot/lib/validation/opportunite";
import { modifierOpportunite, conclureOpportunite } from "@/pilot/lib/opportunites/gerer";

export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierLesMontants(utilisateur));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = modificationOpportunite.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    const p = analyse.data;
    let opportunite;
    if (p.operation === "modifier") {
      const { operation, ...champs } = p; void operation;
      opportunite = await modifierOpportunite(id.data, champs, utilisateur.id);
    } else {
      const { operation, ...champs } = p; void operation;
      opportunite = await conclureOpportunite(id.data, champs, utilisateur.id);
    }
    return NextResponse.json({ opportunite });
  } catch (erreur) { return reponseErreur(erreur); }
}
