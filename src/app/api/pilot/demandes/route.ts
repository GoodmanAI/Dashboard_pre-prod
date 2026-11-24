import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { nouvelleDemande } from "@/pilot/lib/validation/demande";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { creerDemande } from "@/pilot/lib/demandes/gerer";

/** Demander à un collègue d'agir sur un client (C-58). */
export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const analyse = nouvelleDemande.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    return NextResponse.json({ demande: await creerDemande(analyse.data, utilisateur) }, { status: 201 });
  } catch (erreur) { return reponseErreur(erreur); }
}
