import { agir, corps } from "@/pilot/lib/apports/requete";
import { agirSurFacture } from "@/pilot/lib/apports/gerer";
import { peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { actionFacture } from "@/pilot/lib/validation/apport";

/** Émettre, payer, rouvrir une facture d'apporteur, ou saisir un encaissement. */
export async function POST(requete: Request) {
  return agir(async (u) => agirSurFacture(await corps(requete, actionFacture), u.id), peutModifierLesMontants);
}
