import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { repriseCompte } from "@/pilot/lib/validation/reprise";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { reprendreCompte } from "@/pilot/lib/reprise/reprendre";

/** Relie un compte du Dashboard à Pilot : client, centre, produits et étapes déjà faites (C-60). */
export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const analyse = repriseCompte.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    return NextResponse.json(await reprendreCompte(analyse.data, utilisateur.id), { status: 201 });
  } catch (erreur) { return reponseErreur(erreur); }
}
