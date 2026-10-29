"use client";

import { createContext, useContext, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { SlugProduit } from "@/lib/produits";
import type { CleFiltre, Filtres } from "./moteur";

/**
 * Un écran monté dans le panneau de la recherche (R8 : l'écran existant, préfiltré).
 *
 * L'écran ne sait pas où il est monté : il lit le centre et le produit dans l'URL
 * (`useCentreProduit`), et l'URL du panneau est celle de la page d'en dessous (l'accueil,
 * ou un autre écran). Ce contexte la remplace pour lui :
 *   - `useCentreProduit` prend `userId` et `produit` d'ici plutôt que du chemin ;
 *   - `PageContainer` ne touche pas au titre de l'onglet ;
 *   - un écran qui écrit ses filtres dans l'URL (les appels) s'en abstient.
 *
 * Hors du panneau, le contexte est `null` et rien ne change.
 */
export type Integre = {
  userId: number;
  produit: SlugProduit;
  filtres: Filtres;
  ancre?: string;
};

const ContexteIntegre = createContext<Integre | null>(null);

export const FournisseurIntegre = ContexteIntegre.Provider;

export function useIntegre(): Integre | null {
  return useContext(ContexteIntegre);
}

const CLES: CleFiltre[] = ["periode", "examen", "type", "issue", "nom", "telephone", "texte", "etat"];

/** Les filtres d'un résultat, en paramètres d'URL pour « Ouvrir l'écran complet ». */
export function filtresEnParametres(filtres: Filtres): string {
  const p = new URLSearchParams();
  for (const k of CLES) if (filtres[k]) p.set(k, filtres[k]!);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * Les filtres posés par la recherche : ceux du panneau, sinon ceux de l'URL (lien
 * « Ouvrir l'écran complet »). Vide pour un écran ouvert par le menu.
 */
export function useFiltresRecherche(): Filtres {
  const integre = useIntegre();
  const sp = useSearchParams();
  return useMemo(() => {
    if (integre) return integre.filtres;
    const f: Filtres = {};
    for (const k of CLES) {
      const v = sp?.get(k);
      if (v) f[k] = v;
    }
    return f;
  }, [integre, sp]);
}
