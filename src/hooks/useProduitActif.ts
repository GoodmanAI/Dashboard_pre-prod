"use client";

import { usePathname } from "next/navigation";
import { PRODUITS, ORDRE_PRODUITS, type Produit, type SlugProduit } from "@/lib/produits";

/**
 * Le produit affiché, déduit de l'URL.
 *
 * **L'URL fait autorité**, comme pour le sélecteur : un lien partagé désigne sans
 * ambiguïté un produit, et deux onglets ouverts sur deux produits ne se marchent
 * pas dessus. C'est aussi ce qui permet à `ThemeKonnect` de rester une simple
 * bascule d'attribut sans état partagé.
 *
 * Les chemins concernés ont la forme `/client/services/{segment}/{id}/...`, donc
 * le segment produit est le troisième élément.
 *
 * Hors de ces chemins (pages admin, authentification, pages patient), il n'y a pas
 * de produit actif : on retombe sur LyraeTalk, qui est l'expérience historique et
 * celle de la quasi-totalité des clients. C'est ce repli qui garantit qu'aucun
 * écran ne se retrouve sans logo ni couleur.
 */
export function useProduitActif(): Produit {
  const pathname = usePathname();
  const segment = pathname?.split("/")[3];

  const slug = ORDRE_PRODUITS.find(
    (s: SlugProduit) => PRODUITS[s].segment === segment
  );

  return PRODUITS[slug ?? "talk"];
}
