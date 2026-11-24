import { agir, corps, idDe } from "@/pilot/lib/apports/requete";
import { modifierApporteur, supprimerApporteur } from "@/pilot/lib/apports/gerer";
import { peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { champsApporteur } from "@/pilot/lib/validation/apport";

export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  return agir(async (u) => modifierApporteur(idDe(params), await corps(requete, champsApporteur), u.id), peutModifierLesMontants);
}

export async function DELETE(_requete: Request, { params }: { params: { id: string } }) {
  return agir(async (u) => supprimerApporteur(idDe(params), u.id), peutModifierLesMontants);
}
