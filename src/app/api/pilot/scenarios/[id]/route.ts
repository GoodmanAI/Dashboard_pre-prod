import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot, peutVoirCa } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { identifiant } from "@/pilot/lib/validation/commun";
import { modificationScenario } from "@/pilot/lib/validation/scenario";
import { modifierScenario } from "@/pilot/lib/ca/scenarios";

export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    // Un scénario est une projection du chiffre d'affaires : fermé à qui ne le voit pas (C-64).
    exiger(peutModifierPilot(utilisateur.role) && peutVoirCa(utilisateur), "Le chiffre d'affaires n'est pas ouvert à votre compte.");
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = modificationScenario.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    return NextResponse.json({ scenario: await modifierScenario(id.data, analyse.data, utilisateur.id) });
  } catch (erreur) { return reponseErreur(erreur); }
}
