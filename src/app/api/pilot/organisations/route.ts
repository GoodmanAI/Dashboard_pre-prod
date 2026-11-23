import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { messageParlant } from "@/pilot/lib/validation/messages";
import { creationOrganisation } from "@/pilot/lib/validation/organisation";
import { creerOrganisation } from "@/pilot/lib/organisations/creer";

export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const analyse = creationOrganisation.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageParlant(analyse.error) ?? "Corps de requête invalide.", 400);
    const organisation = await creerOrganisation(analyse.data, utilisateur.id);
    return NextResponse.json({ organisation }, { status: 201 });
  } catch (erreur) { return reponseErreur(erreur); }
}
