import { exiger, peutLirePilot } from "@/pilot/lib/autorisations";
import { utilisateurCourant } from "@/pilot/lib/session";
import { comptesInternes } from "@/pilot/lib/referentiels";
import { optionsConcurrents } from "@/pilot/lib/concurrents/options";
import { ajusterFiltres, famillesPresentes, lireFiltres } from "@/pilot/lib/carte/affichage";
import { chargerCarte } from "@/pilot/lib/carte/charger";
import { VueCarte } from "./VueCarte";

export const dynamic = "force-dynamic";

/**
 * La carte (lot U) : les prospects, les clients et les concurrents. Le serveur lit
 * tout en un nombre fixe de requêtes et passe les centres à la carte, chargée dans
 * le navigateur. Les filtres viennent de l'adresse : des codes et des identifiants
 * que la page valide, jamais un texte saisi (C-36). Une valeur inconnue est
 * ignorée. Une famille de RIS est validée contre toutes celles des centres, puis
 * retirée si le mode choisi ne la montre pas (`ajusterFiltres`).
 */
export default async function PageCarte({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const courant = await utilisateurCourant();
  exiger(peutLirePilot(courant.role));
  const [centres, comptes, concurrents] = await Promise.all([chargerCarte(courant.id), comptesInternes(), optionsConcurrents()]);
  const filtres = ajusterFiltres(lireFiltres(searchParams, {
    concurrents: concurrents.map((c) => c.id), comptes: comptes.map((c) => c.id), familles: famillesPresentes(centres), moiId: courant.id,
  }), centres);
  return <VueCarte centres={centres} concurrents={concurrents.map((c) => ({ id: c.id, nom: c.nom }))}
    comptes={comptes.map((c) => ({ id: c.id, name: c.name }))} filtresInitiaux={filtres} moiId={courant.id} />;
}
