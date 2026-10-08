"use client";

import { useEffect, useState } from "react";

/**
 * Lecture et écriture du domaine `talk.textes` (08/10/2026), partagées par la
 * carte de la consigne et celle du SMS.
 *
 * Les deux cartes écrivent dans le même objet, chacune avec son bouton. Pour
 * qu'un enregistrement n'efface pas l'autre carte, on relit la valeur courante
 * juste avant d'écrire et on n'y remplace que ses propres clés.
 */

const url = (userProductId: number) =>
  `/api/product-config?userProductId=${userProductId}&domaine=talk.textes`;

export function useTextesTalk(userProductId: number) {
  const [valeur, setValeur] = useState<Record<string, unknown> | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);

  useEffect(() => {
    if (!userProductId) return;
    let vivant = true;
    fetch(url(userProductId), { cache: "no-store" })
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      .then((d) => {
        if (vivant)
          setValeur(d?.valeur && typeof d.valeur === "object" ? d.valeur : {});
      })
      .catch(() => {
        if (vivant)
          setErreurChargement(
            "Les textes n'ont pas pu être chargés. Rechargez la page.",
          );
      });
    return () => {
      vivant = false;
    };
  }, [userProductId]);

  return { valeur, erreurChargement };
}

/**
 * Remplace les clés données dans `talk.textes` et laisse les autres intactes.
 * Une valeur vide retire la clé : le robot reprend alors son texte standard.
 * Lève une erreur portant le message du serveur s'il refuse.
 */
export async function enregistrerTextesTalk(
  userProductId: number,
  partiel: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const r = await fetch(url(userProductId), { cache: "no-store" });
  if (!r.ok)
    throw new Error(
      "Les textes n'ont pas pu être relus avant l'enregistrement. Réessayez.",
    );
  const actuel = (await r.json())?.valeur ?? {};
  const fusion: Record<string, unknown> = { ...actuel, ...partiel };
  for (const [cle, v] of Object.entries(partiel)) {
    if (v === "" || v === null || v === undefined) delete fusion[cle];
  }
  const w = await fetch(url(userProductId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ valeur: fusion }),
  });
  const data = await w.json().catch(() => ({}));
  if (!w.ok)
    throw new Error(data?.error ?? "L'enregistrement a été refusé. Réessayez.");
  return data?.valeur ?? fusion;
}
