import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { creationContrat } from "@/pilot/lib/validation/contrat";
import { creerContrat } from "@/pilot/lib/contrats/gerer";

export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierLesMontants(utilisateur));
    const analyse = creationContrat.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    const contrat = await creerContrat(analyse.data, utilisateur.id);
    return NextResponse.json({ contrat }, { status: 201 });
  } catch (erreur) { return reponseErreur(erreur); }
}
