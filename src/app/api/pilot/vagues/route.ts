import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { creationVague } from "@/pilot/lib/validation/vague";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { creerVague } from "@/pilot/lib/integration/vagues";

export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const analyse = creationVague.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    return NextResponse.json({ vague: await creerVague(analyse.data, utilisateur.id) }, { status: 201 });
  } catch (erreur) { return reponseErreur(erreur); }
}
