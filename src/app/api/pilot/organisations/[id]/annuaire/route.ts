import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { lireCorps } from "@/pilot/lib/requete";
import { identifiant } from "@/pilot/lib/validation/commun";
import { lireEntreprise } from "@/pilot/lib/annuaire/service";
import { appliquerAnnuaire, choixAnnuaire, phraseBilan } from "@/pilot/lib/annuaire/appliquer";

/** Applique l'annuaire à la fiche (C-89). L'entreprise est relue ici : le navigateur n'envoie que ses choix. */
export async function POST(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = choixAnnuaire.safeParse(await lireCorps(requete));
    if (!analyse.success) throw new ErreurMetier("Corps de requête invalide.", 400);
    const entreprise = await lireEntreprise(analyse.data.siren);
    const bilan = await appliquerAnnuaire(id.data, entreprise, analyse.data, utilisateur.id);
    return NextResponse.json({ bilan, message: phraseBilan(bilan) });
  } catch (erreur) { return reponseErreur(erreur); }
}
