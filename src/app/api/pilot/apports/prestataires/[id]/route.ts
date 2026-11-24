import { agir, corps, idDe } from "@/pilot/lib/apports/requete";
import { modifierPrestataire, supprimerPrestataire } from "@/pilot/lib/apports/gerer";
import { champsPrestataire } from "@/pilot/lib/validation/apport";

export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  return agir(async () => modifierPrestataire(idDe(params), await corps(requete, champsPrestataire)));
}

export async function DELETE(_requete: Request, { params }: { params: { id: string } }) {
  return agir(async (u) => supprimerPrestataire(idDe(params), u.id));
}
