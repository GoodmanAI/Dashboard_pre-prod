import { ORDRE_PRODUITS, PRODUITS, SlugProduit } from "@/lib/produits";

/**
 * La forme des URL d'écran, et les deux seules fonctions qui la connaissent
 * (lot U1).
 *
 * `/client/c/{userId}/{produit}/...`
 *
 * UNE SEULE FORME POUR LES DEUX RÔLES. Les écrans d'un centre vivaient en double,
 * `/client/services/talk/{id}` pour le client et `/admin/clients/{id}` pour
 * l'administrateur, les seconds n'étant que des ré-exports des premiers. Rien dans
 * le rendu ne dépendait du préfixe : seuls deux constructeurs de chemins le
 * lisaient, pour reproduire une distinction dont personne d'autre ne se servait.
 * Ce qu'un admin voit de plus vient de sa session et de son menu, pas de son URL.
 *
 * POURQUOI CE FICHIER EST À PART. Ces deux fonctions sont pures et servent aussi
 * bien à des hooks qu'à des composants, dont `useProduitActif`, appelé par toute
 * page du Dashboard pour choisir son logo et sa couleur. Les loger dans
 * `useCentreProduit` obligerait ce chemin très fréquenté à importer un module qui
 * fait du réseau, pour n'y prendre qu'un `split` de chaîne.
 *
 * POURQUOI LE PRÉFIXE `/c/`. Les URL portaient le `userProductId`, l'affiliation
 * d'un client à UN produit : un client qui a les deux en avait deux, sans rapport
 * visible. Elles portent maintenant le client, et le produit est un segment.
 *
 * Garder l'ancienne forme en changeant seulement la valeur de l'identifiant aurait
 * été indétectable, `userId` et `userProductId` étant deux entiers : une page
 * oubliée aurait affiché les données d'un autre client sans la moindre erreur, et
 * le Dashboard n'a aucun test pour rattraper ça. Avec une forme différente, elle
 * donne un 404 visible. C'est la raison d'être du préfixe.
 */
const CHEMIN_CENTRE = /^\/client\/c\/(\d+)\/([a-z]+)(?:\/|$)/;

/** Ce que l'URL dit du centre et du produit. Aucun appel réseau. */
export function lireCheminCentre(
  pathname: string | null | undefined
): { userId: number; produit: SlugProduit } | null {
  const m = (pathname ?? "").match(CHEMIN_CENTRE);
  if (!m) return null;

  const userId = Number(m[1]);
  if (!Number.isFinite(userId)) return null;

  const slug = ORDRE_PRODUITS.find((s) => PRODUITS[s].segment === m[2]);
  if (!slug) return null;

  return { userId, produit: slug };
}

/** L'URL d'un écran, pour un client et un produit donnés. */
export function cheminCentre(
  userId: number,
  produit: SlugProduit,
  sousChemin = ""
): string {
  const suffixe = sousChemin.replace(/^\/+/, "");
  const base = `/client/c/${userId}/${PRODUITS[produit].segment}`;
  return suffixe ? `${base}/${suffixe}` : base;
}

/**
 * Les produits dont les écrans ont déjà migré vers la nouvelle forme.
 *
 * LE CHANTIER SE FAIT PRODUIT PAR PRODUIT, et pendant ce temps les deux formes
 * coexistent pour de bon : les neuf écrans Konnect répondent sous `/client/c/…`,
 * les vingt-neuf de LyraeTalk toujours sous `/client/services/talk/…`. Un
 * sélecteur qui enverrait vers la nouvelle forme pour les deux donnerait un 404
 * en basculant vers le robot vocal.
 *
 * Cette liste est le seul endroit qui sait où on en est. Elle grandit d'un
 * produit à chaque lot, et disparaît au dernier (U6) avec `cheminProduit`.
 */
export const PRODUITS_MIGRES: SlugProduit[] = ["konnect", "talk"];

/**
 * L'URL d'accueil d'un produit, dans la forme qui existe vraiment pour lui.
 *
 * `userProductId` ne sert qu'aux produits pas encore migrés, dont les URL le
 * portent encore. Il devient inutile à la fin du chantier.
 */
export function cheminProduit(
  userId: number,
  produit: SlugProduit,
  userProductId: number
): string {
  if (PRODUITS_MIGRES.includes(produit)) return cheminCentre(userId, produit);
  return `/client/services/${PRODUITS[produit].segment}/${userProductId}`;
}
