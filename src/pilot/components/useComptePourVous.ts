"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lireComptePourVous, type ComptePourVous } from "@/pilot/lib/commentaires/affichage";
import { EVENEMENT_POUR_VOUS } from "./pourVous";

/**
 * Le compte de la pastille d'Aujourd'hui (lot T), relu par le navigateur :
 * à chaque changement de chemin, après chaque action de la page qui le change
 * (événement « pour-vous-change ») et au retour sur l'onglet. La mise en page
 * ne le lit plus : une relecture de page ou une navigation ne le laissent
 * jamais périmé. Une réponse arrivée après une plus récente est ignorée ; une
 * panne garde le dernier chiffre connu. Null tant que rien n'est lu : pas de pastille.
 */
export function useComptePourVous(actif: boolean, chemin: string): ComptePourVous | null {
  const [compte, setCompte] = useState<ComptePourVous | null>(null);
  const dernier = useRef(0);

  const relire = useCallback(async () => {
    const numero = ++dernier.current;
    try {
      const reponse = await fetch("/api/pilot/pour-vous/compte", { cache: "no-store", headers: { Accept: "application/json" } });
      if (!reponse.ok) return;
      const lu = lireComptePourVous(await reponse.json().catch(() => null));
      if (lu && numero === dernier.current) setCompte(lu);
    } catch { /* Serveur injoignable : la pastille garde son dernier chiffre. */ }
  }, []);

  useEffect(() => { if (actif) void relire(); }, [actif, chemin, relire]);

  useEffect(() => {
    if (!actif) return;
    const surEvenement = () => void relire();
    const surVisibilite = () => { if (document.visibilityState === "visible") void relire(); };
    window.addEventListener(EVENEMENT_POUR_VOUS, surEvenement);
    document.addEventListener("visibilitychange", surVisibilite);
    return () => { window.removeEventListener(EVENEMENT_POUR_VOUS, surEvenement); document.removeEventListener("visibilitychange", surVisibilite); };
  }, [actif, relire]);

  return actif ? compte : null;
}
