import { agir, corps } from "@/pilot/lib/apports/requete";
import { creerApporteur } from "@/pilot/lib/apports/gerer";
import { peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { champsApporteur } from "@/pilot/lib/validation/apport";

export async function POST(requete: Request) {
  return agir(async (u) => creerApporteur(await corps(requete, champsApporteur), u.id), peutModifierLesMontants, 201);
}
