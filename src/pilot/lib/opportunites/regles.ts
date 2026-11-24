import type { CrmCategoriePrevision } from "@prisma/client";
import { eurosPrecis } from "@/pilot/lib/argent";
import { compter } from "@/pilot/lib/texte";
export const LIBELLES_PREVISION: Record<CrmCategoriePrevision, string> = {
  ENGAGE: "Engagé", PROBABLE: "Probable", POSSIBLE: "Possible", EXCLU: "Exclu",
};
export function moisAttendu(date: Date | null): Date | null {
  if (!date) return null;
  const mois = new Date(date);
  mois.setUTCDate(1); mois.setUTCHours(0, 0, 0, 0);
  return mois;
}

/** Les opportunités gagnées par un contrat actif, et celles qui restent ouvertes pour l'organisation (C-71). */
export type BilanOpportunites = { gagnees: number; ouvertes: { produit: string; montantMensuelCentimes: number }[] };
/**
 * Le bilan en phrases courtes, pour l'écran des contrats : « 2 opportunités
 * gagnées. Konnect (70,00 € par mois) reste ouverte : concluez-la dans
 * Opportunités, plus bas. » Rien à dire : null.
 */
export function phraseBilanOpportunites({ gagnees, ouvertes }: BilanOpportunites): string | null {
  const phrases: string[] = [];
  if (gagnees > 0) phrases.push(compter(gagnees, "opportunité gagnée", "opportunités gagnées") + ".");
  if (ouvertes.length) {
    const noms = ouvertes.map((o) => `${o.produit} (${eurosPrecis(o.montantMensuelCentimes)} par mois)`);
    const liste = noms.length > 1 ? noms.slice(0, -1).join(", ") + " et " + noms[noms.length - 1] : noms[0];
    phrases.push(liste + (noms.length > 1 ? " restent ouvertes : concluez-les" : " reste ouverte : concluez-la") + " dans Opportunités, plus bas.");
  }
  return phrases.length ? phrases.join(" ") : null;
}
