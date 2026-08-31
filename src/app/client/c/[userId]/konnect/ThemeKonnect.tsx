"use client";

import { useEffect } from "react";

/**
 * Bascule la palette d'accent sur celle de LyraeKonnect.
 *
 * L'attribut est posé sur `<html>` et non sur un conteneur de la page : le
 * Header et la Sidebar sont rendus par un layout PARENT, donc en dehors de ce
 * segment. Un `data-produit` posé plus bas dans l'arbre laisserait la barre du
 * haut et le menu latéral en vert LyraeTalk pendant qu'on navigue dans Konnect.
 *
 * Le nettoyage au démontage est indispensable : sans lui, l'attribut survivrait
 * au retour vers LyraeTalk, qui hériterait du bleu de Konnect.
 *
 * Limite connue : `src/lib/accent.ts` porte les mêmes couleurs en constantes JS,
 * pour les contextes où `var()` ne résout pas — attributs de présentation SVG de
 * Recharts, surtout. Ces valeurs-là restent celles de LyraeTalk. Aucun écran
 * Konnect n'affiche de graphique aujourd'hui ; le jour où le pilotage arrivera
 * (étape 7), il faudra rendre `accent.ts` dépendant du produit actif.
 */
export default function ThemeKonnect() {
  useEffect(() => {
    const racine = document.documentElement;
    const precedent = racine.getAttribute("data-produit");
    racine.setAttribute("data-produit", "konnect");
    return () => {
      if (precedent) racine.setAttribute("data-produit", precedent);
      else racine.removeAttribute("data-produit");
    };
  }, []);

  return null;
}
