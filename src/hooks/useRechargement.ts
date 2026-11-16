"use client";

import { useEffect, useRef } from "react";

/**
 * Sépare le premier chargement d'un écran de ses rechargements (période, filtre).
 *
 * - `premier` : rien n'a encore été affiché, les squelettes ont leur place.
 * - `recharge` : des chiffres sont déjà à l'écran ; on les garde, grisés, sous une barre
 *   fine (`BarreRechargement`), au lieu de tout remplacer par des squelettes. Une
 *   secrétaire qui passe d'une semaine à l'autre ne voit plus l'écran clignoter.
 *
 * Modèle : la carte d'un centre de `admin/overview` (`refetching`), 16/11/2026.
 */
export function useRechargement(enCours: boolean) {
  const dejaCharge = useRef(false);
  useEffect(() => {
    if (!enCours) dejaCharge.current = true;
  }, [enCours]);
  const premier = enCours && !dejaCharge.current;
  return { premier, recharge: enCours && dejaCharge.current };
}

/**
 * Style à poser sur la racine d'un écran de statistiques : les cartes (`Paper`) se
 * grisent pendant un rechargement. Les popovers, rendus hors de la racine, ne sont pas
 * touchés.
 */
export function styleRechargement(recharge: boolean) {
  return {
    position: "relative" as const,
    "& .MuiPaper-root": {
      transition: "opacity 200ms ease",
      ...(recharge ? { opacity: 0.55 } : {}),
    },
  };
}
