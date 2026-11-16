"use client";

// Chiffre d'une tuile qui glisse de l'ancienne valeur à la nouvelle quand la période ou un
// filtre change. Repris du site neuracorp.ai (`Chiffres.tsx`, skill `ambiance-neuracorp`,
// reference/motifs.md §8), adapté à un outil de travail :
//
// - jamais depuis zéro : au premier affichage, la valeur est posée telle quelle (le HTML
//   servi porte la valeur finale, rien ne saute à l'hydratation) ;
// - seulement entre deux nombres ; un texte (« 12 % », « 3 min ») s'affiche sans bouger ;
// - 700 ms, décélération cubique, chiffres à largeur fixe pour qu'ils ne tremblent pas ;
// - écrit dans le nœud texte à chaque image, sans rendu React ; le nœud reste celui de
//   React (`nodeValue`), qui peut donc le remettre à jour ensuite ;
// - mouvement réduit : la nouvelle valeur s'affiche d'un coup.
import { useEffect, useLayoutEffect, useRef } from "react";

const useEffetAvantPeinture = typeof window === "undefined" ? useEffect : useLayoutEffect;
const FORMAT = new Intl.NumberFormat("fr-FR");
const DUREE = 700;

export function formatChiffre(v: number) {
  return FORMAT.format(Math.round(v));
}

export default function Compteur({ valeur }: { valeur: string | number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const precedente = useRef<number | null>(null);
  const fin = typeof valeur === "number" ? formatChiffre(valeur) : valeur;

  useEffetAvantPeinture(() => {
    const el = ref.current;
    const noeud = el?.firstChild;
    if (typeof valeur !== "number" || !noeud) {
      precedente.current = typeof valeur === "number" ? valeur : null;
      return;
    }
    const depart = precedente.current;
    precedente.current = valeur;
    if (
      depart === null ||
      depart === valeur ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    let image = 0;
    const debut = performance.now();
    noeud.nodeValue = formatChiffre(depart);
    const pas = (t: number) => {
      const p = Math.min((t - debut) / DUREE, 1);
      const e = 1 - Math.pow(1 - p, 3);
      noeud.nodeValue = formatChiffre(depart + (valeur - depart) * e);
      if (p < 1) image = requestAnimationFrame(pas);
    };
    image = requestAnimationFrame(pas);
    return () => {
      cancelAnimationFrame(image);
      noeud.nodeValue = formatChiffre(valeur);
    };
  }, [valeur]);

  return (
    <span ref={ref} className="chiffre" style={{ fontVariantNumeric: "tabular-nums" }}>
      {fin}
    </span>
  );
}
