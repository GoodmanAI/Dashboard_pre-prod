import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutLirePilot } from "@/pilot/lib/autorisations";
import { reponseErreur } from "@/pilot/lib/http";
import { compterPourVous } from "@/pilot/lib/commentaires/pastille";

export const dynamic = "force-dynamic";

/**
 * Le chiffre de la pastille d'Aujourd'hui (lot T) : les demandes ouvertes et
 * les commentaires non lus de l'utilisateur, relus à chaque appel avec ses
 * droits. Deux comptes fixes, quel que soit le nombre de demandes ou de
 * commentaires. La coquille l'appelle à chaque changement de page et après
 * une action qui le change (marquer lu, écrire, supprimer, traiter une demande).
 */
export async function GET() {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutLirePilot(utilisateur.role));
    return NextResponse.json(await compterPourVous(utilisateur.id), { headers: { "Cache-Control": "no-store" } });
  } catch (erreur) { return reponseErreur(erreur); }
}
