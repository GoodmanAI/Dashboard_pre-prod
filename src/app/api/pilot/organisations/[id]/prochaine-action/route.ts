import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { messageParlant } from "@/pilot/lib/validation/messages";
import { identifiant } from "@/pilot/lib/validation/commun";
import { modificationProchaineAction } from "@/pilot/lib/validation/echange";
import { marquerFaite, replanifier } from "@/pilot/lib/organisations/prochaineAction";

export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = modificationProchaineAction.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageParlant(analyse.error) ?? "Corps de requête invalide.", 400);
    const p = analyse.data;
    const prochaineAction = p.operation === "faite" ? await marquerFaite(id.data, utilisateur.id, p.suite) : await replanifier(id.data, p.le, utilisateur.id);
    return NextResponse.json({ prochaineAction });
  } catch (erreur) { return reponseErreur(erreur); }
}
