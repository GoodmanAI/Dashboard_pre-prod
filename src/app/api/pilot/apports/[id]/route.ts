import { agir, corps, idDe } from "@/pilot/lib/apports/requete";
import { ajouterPrestataire, ajouterSite, changerEtapeCommande, dupliquerGroupe, modifierGroupe, retirerGroupe } from "@/pilot/lib/apports/gerer";
import { actionGroupe } from "@/pilot/lib/validation/apport";

/** Une action sur le groupe apporté. L'identifiant est celui du client. */
export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  return agir(async (u) => {
    const id = idDe(params), a = await corps(requete, actionGroupe);
    switch (a.action) {
      case "modifier": return modifierGroupe(id, a.champs, u.id);
      case "etape": return changerEtapeCommande(id, a.statut, u.id);
      case "dupliquer": return dupliquerGroupe(id, u.id);
      case "retirer": return retirerGroupe(id, u.id);
      case "ajouterSite": return ajouterSite(id, u.id);
      case "ajouterPrestataire": return ajouterPrestataire(id, u.id);
    }
  });
}
