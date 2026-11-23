import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { creationOpportunite } from "@/pilot/lib/validation/opportunite";
import { creerOpportunite } from "@/pilot/lib/opportunites/gerer";

export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierLesMontants(utilisateur));
    const analyse = creationOpportunite.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    const opportunite = await creerOpportunite(analyse.data, utilisateur.id);
    return NextResponse.json({ opportunite }, { status: 201 });
  } catch (erreur) { return reponseErreur(erreur); }
}
