import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutLirePilot } from "@/pilot/lib/autorisations";
import { calculerAlertes, filtrerAMoi } from "./calculer";
import { chargerDonneesAlertes } from "./charger";
import { filtresAlertes, filtrerAlertes } from "./filtres";
import { peutConfierAlertes } from "./attribuer";

export type FiltresPageAlertes = { vue?: string; niveau?: string; type?: string; organisationId?: string };
/** Chargeur de l'écran, également appelé par mesurer : session + 13 lectures, plus celle du directeur général. */
export async function chargerPageAlertes(filtres: FiltresPageAlertes = {}) {
  const utilisateur = await utilisateurCourant();
  exiger(peutLirePilot(utilisateur.role));
  const maintenant = new Date();
  const [donnees, peutConfier] = await Promise.all([chargerDonneesAlertes(maintenant), peutConfierAlertes(utilisateur)]);
  const equipe = filtres.vue === "equipe";
  const toutes = calculerAlertes(donnees, maintenant);
  const analyse = filtresAlertes.safeParse(filtres);
  const selection = filtrerAlertes(equipe ? toutes : { actives: filtrerAMoi(toutes.actives, utilisateur.id), acquittees: filtrerAMoi(toutes.acquittees, utilisateur.id) },
    analyse.success ? analyse.data : {});
  return { equipe, actives: selection.actives, peutConfier,
    // Sans directeur général désigné, les alertes vont au super-administrateur : l'écran le dit (C-91).
    directeurDesigne: donnees.parDefaut?.designe ?? false,
    acquittees: selection.acquittees.map((a) => ({ ...a, acquittement: { ...a.acquittement, jusquAu: a.acquittement.jusquAu.toISOString() } })),
    organisations: donnees.organisations.map((o) => ({ id: o.id, nom: o.raisonSocialeNom })).sort((a, b) => a.nom.localeCompare(b.nom, "fr")),
  };
}
export type PageAlertes = Awaited<ReturnType<typeof chargerPageAlertes>>;