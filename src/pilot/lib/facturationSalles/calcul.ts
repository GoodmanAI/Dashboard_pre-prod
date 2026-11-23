import type { GrilleEnVigueur } from "@/pilot/lib/tarifs/grille";

/**
 * La facturation à la salle, reprise de l'écran admin du Dashboard
 * (`/admin/facturation`, plan 2026-11-salles-facturees-talk-konnect) et passée
 * dans Pilot le 23/11/2026 (plan 2026-11-pilot-dans-le-dashboard).
 *
 * Le prix d'une salle vient de la grille de Pilot (codes TALK et KONNECT, base
 * PAR_SALLE, hors taxe) : c'est la seule source depuis l'intégration (décision
 * d'Enzo). `TarifSalle` n'est plus lu. Les salles cochées restent celles du
 * Dashboard (table `Salle`), qui filtrent aussi la prise de RDV des robots.
 *
 * Fonctions pures : l'argent en centimes entiers, jamais un flottant.
 */
export type ProduitSalle = "talk" | "konnect";
export const PRODUITS_SALLE: readonly ProduitSalle[] = ["talk", "konnect"];

/** TVA appliquée à l'abonnement, en pour-mille (20 %). */
export const TVA_POUR_MILLE = 200;

export type LigneSalles = {
  userId: number;
  nom: string;
  codeSite: string | null;
  talk: number;
  konnect: number;
  /** Le client a le produit mais aucune salle cochée : à régler. */
  aRegler: ProduitSalle[];
};

export type PrixSalle = Record<ProduitSalle, number | null>;

export type LigneFacturee = LigneSalles & {
  htCentimes: Record<ProduitSalle, number | null>;
  /** Null dès qu'un produit facturé sur la ligne n'a pas de prix : jamais un total inventé. */
  totalHtCentimes: number | null;
};

/** Le prix HT d'une salle par produit, lu sur la grille en vigueur. Null : « Prix à renseigner ». */
export function prixDesSalles(g: Pick<GrilleEnVigueur, "prix">): PrixSalle {
  return { talk: g.prix.TALK?.montantHtCentimes ?? null, konnect: g.prix.KONNECT?.montantHtCentimes ?? null };
}

export function ttc(htCentimes: number): number {
  // Arrondi au centime le plus proche, en entiers.
  return Math.round((htCentimes * (1000 + TVA_POUR_MILLE)) / 1000);
}

export function facturerLignes(lignes: readonly LigneSalles[], prix: PrixSalle): { lignes: LigneFacturee[]; totalHtCentimes: number; incomplet: boolean } {
  let total = 0;
  let incomplet = false;
  const sortie = lignes.map((l) => {
    const htCentimes = { talk: null, konnect: null } as Record<ProduitSalle, number | null>;
    let ligne: number | null = 0;
    for (const p of PRODUITS_SALLE) {
      if (l[p] === 0) { htCentimes[p] = 0; continue; }
      const unitaire = prix[p];
      htCentimes[p] = unitaire === null ? null : unitaire * l[p];
      ligne = unitaire === null || ligne === null ? null : ligne + unitaire * l[p];
    }
    if (ligne === null) incomplet = true;
    else total += ligne;
    return { ...l, htCentimes, totalHtCentimes: ligne };
  });
  return { lignes: sortie, totalHtCentimes: total, incomplet };
}

function cellule(v: string | number): string {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const eurosCsv = (cts: number | null) => (cts === null ? "prix a renseigner" : (cts / 100).toFixed(2).replace(".", ","));

/** Le tableau en CSV pour Excel (séparateur `;`, BOM pour les accents). */
export function facturationCsv(f: ReturnType<typeof facturerLignes>): string {
  const entete = ["Client", "Site", "Salles Talk", "Talk (EUR HT)", "Salles Konnect", "Konnect (EUR HT)", "Total mensuel (EUR HT)", "Total mensuel (EUR TTC)", "A regler"];
  const corps = f.lignes.map((l) => [
    l.nom, l.codeSite ?? "", l.talk, eurosCsv(l.htCentimes.talk), l.konnect, eurosCsv(l.htCentimes.konnect),
    eurosCsv(l.totalHtCentimes), eurosCsv(l.totalHtCentimes === null ? null : ttc(l.totalHtCentimes)),
    l.aRegler.map((p) => (p === "talk" ? "Talk" : "Konnect")).join(" et "),
  ].map(cellule).join(";"));
  corps.push(["Total", "", "", "", "", "", eurosCsv(f.totalHtCentimes), eurosCsv(ttc(f.totalHtCentimes)), f.incomplet ? "total partiel" : ""].join(";"));
  return "﻿" + [entete.join(";"), ...corps].join("\r\n");
}
