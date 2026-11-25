import type { GrilleEnVigueur } from "@/pilot/lib/tarifs/grille";

/**
 * La facturation à la salle, reprise de l'écran admin du Dashboard
 * (`/admin/facturation`, plan 2026-11-salles-facturees-talk-konnect) et passée
 * dans Pilot le 23/11/2026 (plan 2026-11-pilot-dans-le-dashboard).
 *
 * Le prix d'une salle vient de la grille de Pilot (codes TALK et KONNECT, base
 * PAR_SALLE, hors taxe) (décision d'Enzo). `TarifSalle` n'est plus lu.
 *
 * Exception du 25/11/2026 (Enzo : « nos premiers clients ont une autre tarification ») :
 * un client dont le contrat actif porte un abonnement Talk ou Konnect paie ce que dit
 * son contrat, pas la grille. Le contrat est au net (C-39) : remises et lignes offertes
 * y sont déjà. Son montant mensuel compte une fois par client, sur sa première ligne ;
 * ses autres sites le disent « compris dans le contrat » (0 €). Les salles cochées restent celles du
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

/** Ce que le contrat actif d'un client facture par mois, par produit, au net. Absent : la grille s'applique. */
export type AbonnementsContrat = Map<number, Partial<Record<ProduitSalle, number>>>;

/** D'où vient le montant d'un produit sur une ligne : la grille, ou le contrat du client. */
export type SourcePrix = "grille" | "contrat";

export type LigneFacturee = LigneSalles & {
  htCentimes: Record<ProduitSalle, number | null>;
  sources: Record<ProduitSalle, SourcePrix>;
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

export function facturerLignes(
  lignes: readonly LigneSalles[], prix: PrixSalle, contrats: AbonnementsContrat = new Map(),
): { lignes: LigneFacturee[]; totalHtCentimes: number; incomplet: boolean } {
  let total = 0;
  let incomplet = false;
  const dejaCompte = new Set<string>();
  const sortie = lignes.map((l) => {
    const htCentimes = { talk: null, konnect: null } as Record<ProduitSalle, number | null>;
    const sources = { talk: "grille", konnect: "grille" } as Record<ProduitSalle, SourcePrix>;
    let ligne: number | null = 0;
    for (const p of PRODUITS_SALLE) {
      const duContrat = contrats.get(l.userId)?.[p];
      if (duContrat !== undefined) {
        // Le contrat compte une fois par client, quel que soit le nombre de sites ou de salles.
        const cle = `${l.userId}|${p}`;
        const montant = dejaCompte.has(cle) ? 0 : duContrat;
        dejaCompte.add(cle);
        sources[p] = "contrat";
        htCentimes[p] = montant;
        if (ligne !== null) ligne += montant;
        continue;
      }
      if (l[p] === 0) { htCentimes[p] = 0; continue; }
      const unitaire = prix[p];
      htCentimes[p] = unitaire === null ? null : unitaire * l[p];
      ligne = unitaire === null || ligne === null ? null : ligne + unitaire * l[p];
    }
    if (ligne === null) incomplet = true;
    else total += ligne;
    return { ...l, htCentimes, sources, totalHtCentimes: ligne };
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
