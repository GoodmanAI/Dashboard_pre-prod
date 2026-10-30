"use client";

import { useCallback, useEffect, useState } from "react";
import {
  appliquer,
  lireEtat,
  type ActionPremiersPas,
  type EtatPremiersPas,
} from "@/lib/premiersPas";

/**
 * L'état des premiers pas de la personne connectée, partagé par la carte de l'accueil,
 * l'encart d'étape, la phrase des statistiques et le menu du profil.
 *
 * Une seule lecture par chargement de page : la promesse est gardée au niveau du
 * module, et chaque action prévient les autres abonnés (« Revoir les premiers pas »
 * dans le menu fait réapparaître la carte sans recharger).
 */

type Partage = { admin: boolean; etat: EtatPremiersPas };

let lecture: Promise<Partage> | null = null;
let courant: Partage | null = null;
const abonnes = new Set<(p: Partage) => void>();

function publier(p: Partage) {
  courant = p;
  abonnes.forEach((f) => f(p));
}

function lire(): Promise<Partage> {
  if (!lecture) {
    lecture = fetch("/api/premiers-pas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        // Une lecture ratée vaut « rien à montrer » : l'aide ne doit jamais gêner l'écran.
        const p: Partage = d
          ? { admin: d.admin === true, etat: lireEtat(d.etat) }
          : { admin: true, etat: lireEtat({ masque: true }) };
        publier(p);
        return p;
      })
      .catch(() => {
        lecture = null;
        return { admin: true, etat: lireEtat({ masque: true }) };
      });
  }
  return lecture;
}

export function usePremiersPas(): {
  /** `null` tant que la lecture n'est pas revenue : ne rien afficher. */
  etat: EtatPremiersPas | null;
  admin: boolean;
  agir: (action: ActionPremiersPas) => Promise<void>;
} {
  const [p, setP] = useState<Partage | null>(courant);

  useEffect(() => {
    abonnes.add(setP);
    void lire().then(setP);
    return () => {
      abonnes.delete(setP);
    };
  }, []);

  const agir = useCallback(async (action: ActionPremiersPas) => {
    // Affiché tout de suite, écrit ensuite : fermer une phrase ne doit pas attendre le réseau.
    if (courant) {
      const suivant = appliquer(courant.etat, action);
      if (suivant) publier({ ...courant, etat: suivant });
    }
    const r = await fetch("/api/premiers-pas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    }).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => null) : null;
    if (d) publier({ admin: d.admin === true, etat: lireEtat(d.etat) });
  }, []);

  return { etat: p?.etat ?? null, admin: p?.admin ?? true, agir };
}
