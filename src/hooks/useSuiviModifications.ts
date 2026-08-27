"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Compte ce qui a changé depuis le dernier enregistrement.
 *
 * Sert à mettre le bouton « Enregistrer » en évidence quand il y a quelque chose
 * à sauver, et à le laisser éteint sinon. C'est le comportement de l'écran de
 * mapping de LyraeTalk, repris ici pour que les écrans Konnect se conduisent
 * pareil.
 *
 * L'état est passé sous forme de dictionnaire, une entrée par chose que
 * l'utilisateur peut modifier : la clé identifie la ligne, la valeur est ce qui
 * est comparé. Le compteur additionne les valeurs changées, les entrées ajoutées
 * et les entrées retirées. Comparaison par `JSON.stringify`, donc l'ordre des
 * champs d'un objet compte : construire les valeurs de la même façon à chaque
 * rendu, ce que fait naturellement un littéral d'objet.
 *
 * `pret` dit quand l'état chargé est celui de référence. Avant, tout appel
 * compterait les données du serveur comme des modifications de l'utilisateur.
 */
export function useSuiviModifications(
  etat: Record<string, unknown>,
  pret: boolean
): { modifications: number; marquerEnregistre: () => void } {
  const courant = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [cle, valeur] of Object.entries(etat)) out[cle] = JSON.stringify(valeur);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(etat)]);

  const [reference, setReference] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (pret && reference === null) setReference(courant);
  }, [pret, courant, reference]);

  const modifications = useMemo(() => {
    if (reference === null) return 0;
    let n = 0;
    for (const [cle, valeur] of Object.entries(courant)) {
      if (reference[cle] !== valeur) n += 1;
    }
    for (const cle of Object.keys(reference)) {
      if (!(cle in courant)) n += 1;
    }
    return n;
  }, [courant, reference]);

  return { modifications, marquerEnregistre: () => setReference(courant) };
}
