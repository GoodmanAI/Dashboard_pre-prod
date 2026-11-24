import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { creationRattachement } from "@/pilot/lib/validation/centre";
import { rattacherProduit } from "@/pilot/lib/centres/rattacher";

export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const analyse = creationRattachement.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier("Corps de requête invalide.", 400);
    const rattachement = await rattacherProduit(analyse.data, utilisateur.id);
    return NextResponse.json({ rattachement }, { status: 201 });
  } catch (erreur) { return reponseErreur(erreur); }
}
