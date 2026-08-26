/**
 * Référentiel des produits — seul endroit qui connaît les valeurs de
 * `Product.name` en base.
 *
 * Avant ce fichier, `"LyraeTalk"` était comparé en dur sur 12 sites répartis
 * dans 11 fichiers : redirection racine, signin, Header, Sidebar, SidebarItems,
 * création de client (page ET route API), rapports, profil client, garde de
 * permissions. Ajouter un second produit imposait de tous les retrouver — et
 * `Product.name` est une chaîne dont le renommage en base casse l'application
 * entière sans la moindre erreur de compilation.
 *
 * **Piège de casse** : les sites historiques ne comparaient pas de la même
 * façon — la plupart en strict (`=== "LyraeTalk"`), un en `toLowerCase()`. Les
 * fonctions ci-dessous comparent donc TOUJOURS sans tenir compte de la casse,
 * ce qui est le comportement le plus permissif des deux : aucun site ne devient
 * plus strict qu'avant.
 */

/** Identifiant interne d'un produit, stable et indépendant de la base. */
export type SlugProduit = "talk" | "konnect";

/**
 * Les trois déclinaisons du logo d'un produit. Elles vivent ici parce que le
 * référentiel est déjà le seul endroit qui connaît les produits : ajouter un
 * produit demain, c'est une entrée dans ce fichier et rien d'autre.
 */
export type LogosProduit = {
  /** Symbole + nom, 212×44. Pour le sélecteur et tout endroit qui a la place. */
  lockup: string;
  /** Symbole seul, 64×64. Pour les espaces contraints (menu, favicon, mobile). */
  symbole: string;
  /** Icône carrée sur fond plein, 512×512. Pour une tuile ou une vignette. */
  icone: string;
};

export type Produit = {
  slug: SlugProduit;
  /** Valeur de `Product.name` en base. La toucher casse l'app en silence. */
  nom: string;
  /** Libellé affiché à l'utilisateur. */
  libelle: string;
  /** Segment d'URL sous `/client/services/`. */
  segment: string;
  /** Une phrase qui dit ce que fait le produit, pour le sélecteur. */
  description: string;
  logos: LogosProduit;
};

export const PRODUITS: Record<SlugProduit, Produit> = {
  talk: {
    slug: "talk",
    nom: "LyraeTalk",
    libelle: "LyraeTalk",
    segment: "talk",
    description: "Prise de rendez-vous par téléphone",
    logos: {
      lockup: "/images/lyraetalk-lockup-symbole-nom-couleur.svg",
      symbole: "/images/lyraetalk-symbole-couleur.svg",
      icone: "/images/lyraetalk-icone-app-512.svg",
    },
  },
  konnect: {
    slug: "konnect",
    nom: "LyraeKonnect",
    libelle: "LyraeKonnect",
    segment: "konnect",
    description: "Prise de rendez-vous en ligne",
    logos: {
      lockup: "/images/lyraekonnect-lockup-symbole-nom-couleur.svg",
      symbole: "/images/lyraekonnect-symbole-couleur.svg",
      icone: "/images/lyraekonnect-icone-app-512.svg",
    },
  },
};

/** Ordre d'affichage stable — évite qu'un sélecteur change d'ordre au hasard. */
export const ORDRE_PRODUITS: SlugProduit[] = ["talk", "konnect"];

/**
 * Ce `Product.name` désigne-t-il ce produit ? Comparaison insensible à la casse
 * et tolérante à l'absence de valeur (les payloads arrivent souvent en `any`).
 */
export function estProduit(nom: string | null | undefined, slug: SlugProduit): boolean {
  if (!nom) return false;
  return nom.trim().toLowerCase() === PRODUITS[slug].nom.toLowerCase();
}

/** Le produit correspondant à un `Product.name`, ou `null` s'il est inconnu. */
export function produitDepuisNom(nom: string | null | undefined): Produit | null {
  for (const slug of ORDRE_PRODUITS) {
    if (estProduit(nom, slug)) return PRODUITS[slug];
  }
  return null;
}

/**
 * Cherche l'entrée d'un produit dans une liste renvoyée par l'API.
 *
 * `accesNom` permet de couvrir les deux formes rencontrées : une liste de
 * produits (`p.name`) et une liste de `UserProduct` (`up.product.name`).
 */
export function trouverProduit<T>(
  liste: T[] | null | undefined,
  slug: SlugProduit,
  accesNom: (item: T) => string | null | undefined = (item) =>
    (item as { name?: string } | null)?.name,
): T | null {
  if (!Array.isArray(liste)) return null;
  return liste.find((item) => estProduit(accesNom(item), slug)) ?? null;
}

/** Tous les noms en base, pour les requêtes qui filtrent sur `Product.name`. */
export const NOMS_PRODUITS: string[] = ORDRE_PRODUITS.map((slug) => PRODUITS[slug].nom);
