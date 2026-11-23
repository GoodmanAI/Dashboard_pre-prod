"use client";
import { createContext, useContext, useEffect } from "react";

/**
 * La rubrique du menu qu'une page allume quand son adresse ne suffit pas à la
 * dire. La fiche d'une organisation vit sous `/pilot/organisations/…`, mais un
 * prospect appartient à Prospects, pas à Clients (C-87).
 */
export const RubriqueContexte = createContext<(href: string | null) => void>(() => {});

/** Allume l'entrée `href` du menu tant que la page est affichée. */
export function useRubrique(href: string) {
  const choisir = useContext(RubriqueContexte);
  useEffect(() => {
    choisir(href);
    return () => choisir(null);
  }, [choisir, href]);
}
