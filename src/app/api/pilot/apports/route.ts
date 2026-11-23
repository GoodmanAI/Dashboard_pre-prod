import { agir, corps } from "@/pilot/lib/apports/requete";
import { creerGroupe } from "@/pilot/lib/apports/gerer";
import { creationGroupe } from "@/pilot/lib/validation/apport";

/** Nouveau groupe apporté : un nouveau prospect, ou un client existant. */
export async function POST(requete: Request) {
  return agir(async (u) => creerGroupe(await corps(requete, creationGroupe), u.id), undefined, 201);
}
