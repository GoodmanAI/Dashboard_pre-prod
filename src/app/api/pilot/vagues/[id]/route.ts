import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { identifiant } from "@/pilot/lib/validation/commun";
import { majVague } from "@/pilot/lib/validation/vague";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { modifierVague } from "@/pilot/lib/integration/vagues";

export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant de vague invalide.", 400);
    const analyse = majVague.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    return NextResponse.json({ vague: await modifierVague(id.data, analyse.data, utilisateur.id) });
  } catch (erreur) { return reponseErreur(erreur); }
}
