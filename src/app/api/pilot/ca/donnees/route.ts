import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutVoirCa } from "@/pilot/lib/autorisations";
import { reponseErreur } from "@/pilot/lib/http";
import { chargerDonneesCa } from "@/pilot/lib/ca/donnees";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutVoirCa(utilisateur), "Le chiffre d'affaires n'est pas ouvert à votre compte.");
    return NextResponse.json(await chargerDonneesCa());
  } catch (erreur) { return reponseErreur(erreur); }
}
