"use client";

import { useEffect } from "react";

/**
 * Ancienne adresse de l'écran « Règles de coexistence ». Depuis le 18/09/2026, ces règles
 * sont un onglet de la page « Multi examens ». On renvoie là-bas pour qu'un lien ou un
 * favori ne mène pas à une page vide.
 */
export default function ReglesCoexistenceRedirection() {
  useEffect(() => {
    const cible = window.location.pathname.replace(/regles-coexistence\/?$/, "paires-examens");
    window.location.replace(`${cible}?onglet=coexistence`);
  }, []);
  return null;
}
