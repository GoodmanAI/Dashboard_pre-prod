"use client";

import { usePathname } from "next/navigation";
import { cheminCentre, lireCheminCentre } from "@/lib/cheminsCentre";

/**
 * Le préfixe commun aux écrans LyraeTalk d'un centre.
 *
 * Il servait à recoller un `userProductId` derrière `/client/services/talk/` ou
 * `/admin/clients/`. Depuis le chantier U (une URL par client, 31/08/2026), l'URL
 * porte le client et le produit est un segment : le préfixe se lit directement
 * dans le chemin courant, sans rien reconstruire.
 *
 * `userProductId` reste dans la signature pour les appelants qui le passent
 * encore, et pour le repli sur l'ancienne forme tant qu'un lien en circulation
 * peut y mener. Les deux disparaîtront au lot U6.
 */
export function useTalkBasePath(userProductId: number | string): string {
  const pathname = usePathname();

  const cible = lireCheminCentre(pathname);
  if (cible) return cheminCentre(cible.userId, cible.produit);

  if (pathname?.startsWith("/admin/")) {
    return `/admin/clients/${userProductId}`;
  }
  return `/client/services/talk/${userProductId}`;
}

/**
 * Même préfixe, hors composant React.
 *
 * `userId` est celui du CLIENT. L'ancienne signature prenait un `userProductId`,
 * qui désignait son affiliation à un seul produit : deux appelants pouvaient
 * passer deux entiers différents pour le même centre sans que rien ne le signale.
 *
 * `isAdmin` ne sert plus : les deux rôles partagent la même adresse, ce qu'un
 * admin voit de plus venant de sa session et de son menu. Le paramètre reste pour
 * ne pas casser les appelants, et part au lot U6.
 */
export function buildTalkBasePath(userId: number | string, _isAdmin?: boolean): string {
  return cheminCentre(Number(userId), "talk");
}
