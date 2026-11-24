import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { messageParlant } from "@/pilot/lib/validation/messages";
import { creationCentre } from "@/pilot/lib/validation/centre";
import { creerCentre } from "@/pilot/lib/centres/gerer";
import { lireCorps } from "@/pilot/lib/requete";

export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const analyse = creationCentre.safeParse(await lireCorps(requete));
    if (!analyse.success) throw new ErreurMetier(messageParlant(analyse.error) ?? "Corps de requête invalide.", 400);
    const centre = await creerCentre(analyse.data, utilisateur.id);
    return NextResponse.json({ centre }, { status: 201 });
  } catch (erreur) { return reponseErreur(erreur); }
}
