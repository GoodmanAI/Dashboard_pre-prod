import { agir, corps, idDe } from "@/pilot/lib/apports/requete";
import { modifierSalle, supprimerSalle } from "@/pilot/lib/apports/gerer";
import { champsSalle } from "@/pilot/lib/validation/apport";

export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  return agir(async () => modifierSalle(idDe(params), await corps(requete, champsSalle)));
}

export async function DELETE(_requete: Request, { params }: { params: { id: string } }) {
  return agir(async (u) => supprimerSalle(idDe(params), u.id));
}
