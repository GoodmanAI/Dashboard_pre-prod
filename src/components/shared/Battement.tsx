// Indicateur de chargement du Dashboard : un tracé d'électrocardiogramme qui se dessine,
// puis s'efface, à la couleur du produit. Remplace la roue (`CircularProgress`) au milieu
// d'une page vide.
//
// - Sans état ni hook : il se rend aussi bien côté serveur (`loading.tsx`) que client.
// - Les animations vivent dans `src/app/global.css` (`.battement*`) : elles tournent sans
//   JavaScript et s'arrêtent sous `prefers-reduced-motion` (le tracé reste, immobile).
// - Il n'apparaît qu'après 200 ms : un chargement court ne fait rien clignoter.
// - `hauteur` réserve la place de l'écran à venir, pour que rien ne saute à l'arrivée
//   des données.
import React from "react";

// Ligne de base, petite onde P, complexe QRS, onde T, retour à la base.
const TRACE =
  "M2 22 H30 L34 18 L38 22 H46 L50 26 L56 4 L62 38 L66 22 H76 Q82 12 88 22 H118";

export default function Battement({
  libelle = "Chargement",
  hauteur = 240,
  visible = true,
}: {
  /** Texte lu par le lecteur d'écran, et affiché sous le tracé. Vide : rien d'affiché. */
  libelle?: string;
  /** Hauteur réservée, en px ou en valeur CSS. */
  hauteur?: number | string;
  /** Affiche le libellé sous le tracé. Le lecteur d'écran l'entend dans tous les cas. */
  visible?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="battement"
      style={{
        minHeight: hauteur,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        width: "100%",
      }}
    >
      <svg
        width="120"
        height="42"
        viewBox="0 0 120 42"
        fill="none"
        aria-hidden="true"
        style={{ overflow: "visible" }}
      >
        <path
          d={TRACE}
          stroke="rgba(var(--accent-rgb), 0.16)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          className="battement-trace"
          d={TRACE}
          pathLength={1}
          stroke="var(--accent)"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle className="battement-point" cx="118" cy="22" r="2.5" fill="var(--accent)" />
      </svg>
      {libelle ? (
        <span
          style={
            visible
              ? { fontSize: 13, color: "#5A6A85", letterSpacing: "0.01em" }
              : {
                  position: "absolute",
                  width: 1,
                  height: 1,
                  overflow: "hidden",
                  clip: "rect(0 0 0 0)",
                  whiteSpace: "nowrap",
                }
          }
        >
          {libelle}
        </span>
      ) : null}
    </div>
  );
}
