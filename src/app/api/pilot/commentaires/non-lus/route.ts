import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutLirePilot } from "@/pilot/lib/autorisations";
import { reponseErreur } from "@/pilot/lib/http";
import { commentairesNonLus } from "@/pilot/lib/commentaires/charger";

export const dynamic = "force-dynamic";

/**
 * Les commentaires qui vous préviennent et que vous n'avez pas lus (lot T) :
 * le bloc « Pour vous ». `total` est le compte exact, `commentaires` les 50 plus
 * récents. La page Aujourd'hui appelle le même service (`commentairesNonLus`)
 * sans passer par ici ; la pastille du menu lit `GET /api/pilot/pour-vous/compte`.
 * Cette route sert à rafraîchir depuis le navigateur.
 */
export async function GET() {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutLirePilot(utilisateur.role));
    return NextResponse.json(await commentairesNonLus(utilisateur.id), { headers: { "Cache-Control": "no-store" } });
  } catch (erreur) { return reponseErreur(erreur); }
}
