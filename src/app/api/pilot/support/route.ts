import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { nouveauSujet } from "@/pilot/lib/validation/support";
import { creerSujet } from "@/pilot/lib/support/gerer";

/** Ouvre un sujet de support sur un client (25/11/2026) : cloche et mail aux destinataires. */
export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const analyse = nouveauSujet.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    const sujet = await creerSujet(analyse.data, utilisateur);
    return NextResponse.json({ sujet: { id: sujet.id } }, { status: 201 });
  } catch (erreur) { return reponseErreur(erreur); }
}
