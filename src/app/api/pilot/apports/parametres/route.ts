import { agir, corps } from "@/pilot/lib/apports/requete";
import { modifierParametres } from "@/pilot/lib/apports/gerer";
import { peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { champsParametres } from "@/pilot/lib/validation/apport";

export async function PATCH(requete: Request) {
  return agir(async (u) => modifierParametres(await corps(requete, champsParametres), u.id), peutModifierLesMontants);
}
