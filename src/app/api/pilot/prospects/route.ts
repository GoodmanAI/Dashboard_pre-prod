import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierLesMontants, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { creationProspect } from "@/pilot/lib/validation/prospect";
import { creerProspect } from "@/pilot/lib/prospection/creer";
import { lireCorps } from "@/pilot/lib/requete";

/** La fiche de saisie rapide (C-65) : prospect, site, contacts et premier contact en une fois. */
export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const analyse = creationProspect.safeParse(await lireCorps(requete));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    // Un montant estimé crée une opportunité : il demande le même droit que la route des opportunités (C-64).
    if (analyse.data.montantEstime) exiger(peutModifierLesMontants(utilisateur));
    const organisation = await creerProspect(analyse.data, utilisateur.id);
    return NextResponse.json({ organisation: { id: organisation.id } }, { status: 201 });
  } catch (erreur) { return reponseErreur(erreur); }
}
