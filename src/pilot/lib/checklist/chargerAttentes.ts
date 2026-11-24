import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutLirePilot } from "@/pilot/lib/autorisations";
import { listerAttentes, serialiserAttente } from "./attentes";
import { lireTiers, numeroPage, type FiltresIntegration } from "./chargerIntegrations";

export async function chargerAttentes(filtres: FiltresIntegration = {}) {
  const utilisateur = await utilisateurCourant();
  exiger(peutLirePilot(utilisateur.role));
  const page = numeroPage(filtres.page);
  const lignes = await listerAttentes({ utilisateurId: utilisateur.id, tiers: lireTiers(filtres.tiers), aMoi: filtres.aMoi === "1", limite: 51, saut: (page - 1) * 50 });
  return { lignes: lignes.slice(0, 50).map(serialiserAttente), page, suite: lignes.length > 50 };
}
