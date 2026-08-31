"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SlugProduit } from "@/lib/produits";
import { lireCheminCentre } from "@/lib/cheminsCentre";
import type { ProduitDuCentre } from "@/app/api/centre/[userId]/produits/route";

/**
 * Le centre et le produit que la page regarde, d'après l'URL (lot U1).
 *
 * POURQUOI CE HOOK. L'URL portait le `userProductId`, c'est-à-dire l'affiliation
 * d'un client À UN produit. Un client qui a les deux en a donc deux, sans rapport
 * visible entre eux : `/client/services/talk/23` et `/client/services/konnect/47`
 * désignent le même centre. Un lien partagé désignait un produit, pas un client, et
 * basculer de produit demandait de connaître l'autre identifiant.
 *
 * L'URL porte maintenant le client, et le produit est un segment :
 * `/client/c/8/konnect/parametrage`. Le `userProductId` est résolu ici.
 *
 * IL RESTE `null` PENDANT LA RÉSOLUTION, et c'est le point important. Toutes les
 * pages gardent déjà leurs effets par `if (!userProductId) return`, écrit à
 * l'époque où la valeur venait d'un `Number(params?.id)` qui pouvait être `NaN`.
 * Cette garde couvre le `null` sans changer une ligne, et l'effet se relance quand
 * la valeur arrive. C'est ce qui rend la migration des pages presque mécanique.
 *
 * `introuvable` distingue les deux échecs qui se ressemblent à l'écran : le client
 * existe mais n'a pas ce produit (URL bricolée, ou affiliation retirée depuis que
 * le lien a été envoyé), ou bien la résolution a échoué. Le premier cas mérite un
 * message, pas un chargement perpétuel.
 */

export type CentreProduit = {
  /** Le client regardé, `null` hors d'un chemin de centre. */
  userId: number | null;
  /** Le produit regardé, `null` hors d'un chemin de centre. */
  produit: SlugProduit | null;
  /** L'affiliation du client à ce produit. `null` tant qu'elle n'est pas résolue. */
  userProductId: number | null;
  /** Tous les produits du client, pour le sélecteur. Vide tant que non chargé. */
  produits: ProduitDuCentre[];
  chargement: boolean;
  /** Le client n'a pas ce produit, ou la résolution a échoué. */
  introuvable: boolean;
};

const HORS_CENTRE: CentreProduit = {
  userId: null,
  produit: null,
  userProductId: null,
  produits: [],
  chargement: false,
  introuvable: false,
};

/**
 * Résolutions en cours ou faites, par `userId`.
 *
 * Neuf écrans Konnect montent le hook, et sans ce partage chacun déclencherait son
 * propre appel au même moment. Le cache vit le temps de l'onglet : une affiliation
 * ajoutée depuis le back-office apparaît au prochain rechargement, ce qui est le
 * bon compromis pour une donnée qui change quelques fois par an.
 */
const enCours = new Map<number, Promise<ProduitDuCentre[]>>();

function produitsDuCentre(userId: number): Promise<ProduitDuCentre[]> {
  const deja = enCours.get(userId);
  if (deja) return deja;

  const p = fetch(`/api/centre/${userId}/produits`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((d) => (Array.isArray(d?.produits) ? (d.produits as ProduitDuCentre[]) : []))
    .catch(() => {
      // Ne pas mémoriser un échec : une coupure réseau passagère condamnerait
      // l'onglet à ne plus jamais résoudre ce centre.
      enCours.delete(userId);
      return [] as ProduitDuCentre[];
    });

  enCours.set(userId, p);
  return p;
}

export function useCentreProduit(): CentreProduit {
  const pathname = usePathname();
  const cible = lireCheminCentre(pathname);
  const userId = cible?.userId ?? null;
  const produit = cible?.produit ?? null;

  const [produits, setProduits] = useState<ProduitDuCentre[]>([]);
  const [resolu, setResolu] = useState<number | null>(null);

  useEffect(() => {
    if (userId === null) return;
    let annule = false;
    produitsDuCentre(userId).then((liste) => {
      if (annule) return;
      setProduits(liste);
      setResolu(userId);
    });
    return () => {
      annule = true;
    };
  }, [userId]);

  if (userId === null || produit === null) return HORS_CENTRE;

  // Les produits d'un autre centre pendant une navigation ne doivent pas être
  // pris pour ceux de celui-ci : sans cette comparaison, on renverrait brièvement
  // le `userProductId` du centre qu'on vient de quitter.
  const aJour = resolu === userId;
  const userProductId = aJour
    ? (produits.find((p) => p.slug === produit)?.userProductId ?? null)
    : null;

  return {
    userId,
    produit,
    userProductId,
    produits: aJour ? produits : [],
    chargement: !aJour,
    introuvable: aJour && userProductId === null,
  };
}
