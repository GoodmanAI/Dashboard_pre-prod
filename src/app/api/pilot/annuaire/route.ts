import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { reponseErreur } from "@/pilot/lib/http";
import { lireCorps } from "@/pilot/lib/requete";
import { chercherDansAnnuaire } from "@/pilot/lib/annuaire/service";

export const dynamic = "force-dynamic";
/**
 * Recherche dans l'annuaire des entreprises (C-89), depuis le serveur : aucun
 * copier-coller. POST et non GET : le nom cherché ne finit dans aucun journal
 * d'accès (C-36). Seul le nom ou le SIREN part vers le service public.
 */
export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const corps = await lireCorps(requete);
    const q = corps && typeof corps === "object" && "q" in corps && typeof corps.q === "string" ? corps.q : "";
    return NextResponse.json(await chercherDansAnnuaire(q));
  } catch (erreur) { return reponseErreur(erreur); }
}
