import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { identifiant } from "@/pilot/lib/validation/commun";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { changementStatut } from "@/pilot/lib/validation/support";
import { changerStatutSujet } from "@/pilot/lib/support/gerer";

/** Transmis au client, résolu, rouvert (25/11/2026) : cloche et mail aux destinataires. */
export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = changementStatut.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    await changerStatutSujet(id.data, analyse.data, utilisateur);
    return NextResponse.json({ ok: true });
  } catch (erreur) { return reponseErreur(erreur); }
}
