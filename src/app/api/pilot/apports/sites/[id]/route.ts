import { agir, corps, idDe } from "@/pilot/lib/apports/requete";
import { ajouterSalles, dupliquerSite, modifierSite, supprimerSite } from "@/pilot/lib/apports/gerer";
import { actionSite } from "@/pilot/lib/validation/apport";

export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  return agir(async (u) => {
    const id = idDe(params), a = await corps(requete, actionSite);
    switch (a.action) {
      case "modifier": return modifierSite(id, a.champs, u.id);
      case "dupliquer": return dupliquerSite(id, u.id);
      case "ajouterSalles": return ajouterSalles(id, a.nombre, a.modalite, u.id);
    }
  });
}

export async function DELETE(_requete: Request, { params }: { params: { id: string } }) {
  return agir(async (u) => supprimerSite(idDe(params), u.id));
}
