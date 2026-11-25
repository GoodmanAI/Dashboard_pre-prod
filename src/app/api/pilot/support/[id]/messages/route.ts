import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { identifiant } from "@/pilot/lib/validation/commun";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { nouveauMessage } from "@/pilot/lib/validation/support";
import { ajouterMessage } from "@/pilot/lib/support/gerer";

/** Répond dans un sujet de support (25/11/2026) : cloche et mail aux destinataires. */
export async function POST(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = nouveauMessage.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    return NextResponse.json(await ajouterMessage(id.data, analyse.data, utilisateur), { status: 201 });
  } catch (erreur) { return reponseErreur(erreur); }
}
