import { grillePourActeur } from "@/pilot/lib/tarifs/confidentialite";
import { exiger, peutLirePilot, peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { utilisateurCourant } from "@/pilot/lib/session";
import { produits } from "@/pilot/lib/referentiels";
import { listerGrilles } from "@/pilot/lib/tarifs/lire";
import { Tarifs } from "./Tarifs";
import type { GrilleEcran } from "./types";

export const dynamic = "force-dynamic";

/**
 * Les tarifs (lot S) : la grille en vigueur, la prochaine grille datée et les
 * grilles passées. Une seule lecture des grilles pour toute la page. L'écriture
 * demande le droit « Modifier les montants », gardé par les routes.
 */
export default async function PageTarifs() {
  const courant = await utilisateurCourant();
  exiger(peutLirePilot(courant.role));
  const [grilles, catalogue] = await Promise.all([listerGrilles(), produits()]);
  const ecran: GrilleEcran[] = grilles.map((g) => grillePourActeur(g, courant)).map((g) => ({
    id: g.id, applicableLe: g.applicableLe, notes: g.notes, majLe: g.majLe.toISOString(), statut: g.statut,
    nombrePropositions: g.nombrePropositions, modifiable: g.modifiable, raison: g.raison, dateModifiable: g.dateModifiable, supprimable: g.supprimable,
    tarifs: g.tarifs.map(({ id, code, libelle, productId, type, base, montantHtCentimes, pourMille }) => ({ id, code, libelle, productId, type, base, montantHtCentimes, pourMille })),
  }));
  return <Tarifs grilles={ecran} catalogue={catalogue} peutModifier={peutModifierLesMontants(courant)} />;
}
