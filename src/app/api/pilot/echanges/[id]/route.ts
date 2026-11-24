import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { reponseErreur } from "@/pilot/lib/http";
import { identifiant } from "@/pilot/lib/validation/commun";
import { modificationEchange } from "@/pilot/lib/validation/echange";
import { modifierEchange } from "@/pilot/lib/echanges/modifier";

export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = modificationEchange.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    const p = analyse.data;
    const echange = await modifierEchange(id.data, p, utilisateur.id, utilisateur.role);
    return NextResponse.json({ echange });
  } catch (erreur) { return reponseErreur(erreur); }
}
