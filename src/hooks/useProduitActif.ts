"use client";

import { usePathname } from "next/navigation";
import { PRODUITS, ORDRE_PRODUITS, type Produit, type SlugProduit } from "@/lib/produits";
import { lireCheminCentre } from "@/lib/cheminsCentre";

/**
 * Le produit affiché, déduit de l'URL.
 *
 * **L'URL fait autorité**, comme pour le sélecteur : un lien partagé désigne sans
 * ambiguïté un produit, et deux onglets ouverts sur deux produits ne se marchent
 * pas dessus. C'est aussi ce qui permet à `ThemeKonnect` de rester une simple
 * bascule d'attribut sans état partagé.
 *
 * Hors de ces chemins (pages admin, authentification, pages patient), il n'y a pas
 * de produit actif : on retombe sur LyraeTalk, qui est l'expérience historique et
 * celle de la quasi-totalité des clients. C'est ce repli qui garantit qu'aucun
 * écran ne se retrouve sans logo ni couleur.
 *
 * DEUX FORMES D'URL COEXISTENT le temps du chantier U (une URL par client). La
 * nouvelle, `/client/c/{userId}/{produit}/...`, est reconnue par
 * `lireCheminCentre` ; l'ancienne, `/client/services/{produit}/{id}/...`, met le
 * segment produit en troisième position.
 *
 * L'ORDRE DES DEUX LECTURES COMPTE. Sur la nouvelle forme, le troisième élément
 * est le `userId` et non un segment de produit : la lecture positionnelle n'y
 * trouverait rien et retomberait silencieusement sur LyraeTalk, c'est-à-dire un
 * portail Konnect affiché aux couleurs du robot vocal. On essaie donc la forme
 * explicite d'abord.
 */
export function useProduitActif(): Produit {
  const pathname = usePathname();

  const cible = lireCheminCentre(pathname);
  if (cible) return PRODUITS[cible.produit];

  const segment = pathname?.split("/")[3];
  const slug = ORDRE_PRODUITS.find(
    (s: SlugProduit) => PRODUITS[s].segment === segment
  );

  return PRODUITS[slug ?? "talk"];
}
