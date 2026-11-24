import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot, peutVoirCa } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { creationScenario } from "@/pilot/lib/validation/scenario";
import { creerScenario } from "@/pilot/lib/ca/scenarios";

export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    // Un scénario est une projection du chiffre d'affaires : fermé à qui ne le voit pas (C-64).
    exiger(peutModifierPilot(utilisateur.role) && peutVoirCa(utilisateur), "Le chiffre d'affaires n'est pas ouvert à votre compte.");
    const analyse = creationScenario.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    return NextResponse.json({ scenario: await creerScenario(analyse.data, utilisateur.id) }, { status: 201 });
  } catch (erreur) { return reponseErreur(erreur); }
}
