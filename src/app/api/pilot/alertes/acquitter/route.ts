import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutAcquitter } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { nouvelAcquittement } from "@/pilot/lib/validation/acquittement";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { acquitterAlerte } from "@/pilot/lib/alertes/acquitter";

export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutAcquitter(utilisateur.role));
    const analyse = nouvelAcquittement.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    return NextResponse.json({ acquittement: await acquitterAlerte(analyse.data, utilisateur.id) }, { status: 201 });
  } catch (erreur) { return reponseErreur(erreur); }
}
