import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { reponseErreur } from "@/pilot/lib/http";
import { saisieEchange } from "@/pilot/lib/validation/echange";
import { saisirEchange } from "@/pilot/lib/echanges/saisir";

export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const analyse = saisieEchange.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    const echange = await saisirEchange({ ...analyse.data, auteurId: utilisateur.id });
    return NextResponse.json({ echange }, { status: 201 });
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
