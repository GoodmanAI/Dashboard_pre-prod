"use client";

import { useEffect } from "react";

/**
 * Écran d'erreur des pages patient (confirmation de RDV, dépôt d'ordonnance).
 *
 * Pourquoi il existe : jusqu'au 2026-08-11, le dashboard n'avait AUCUNE error
 * boundary — ni `error.tsx`, ni `global-error.tsx`, nulle part. En React, une
 * erreur non rattrapée pendant le rendu démonte l'arbre entier et laisse un
 * `<body>` vide. Un patient tombait donc sur une page blanche, sans savoir quoi
 * faire, et rien n'apparaissait côté serveur : on ne l'apprenait que lorsqu'un
 * secrétariat finissait par le signaler.
 *
 * Deux objectifs, dans cet ordre :
 *   1. Le patient a une consigne utile — appeler son centre — au lieu du vide.
 *   2. L'erreur laisse une trace : `console.error` part dans les logs PM2, et
 *      le `digest` fourni par Next.js permet de relier ce que voit le patient
 *      à la stack côté serveur.
 *
 * `error.tsx` DOIT être un client component (contrainte Next.js App Router), on
 * ne peut donc pas suivre le parti pris server-only de `not-found.tsx`. Styles
 * inline et zéro dépendance MUI malgré tout : cet écran doit s'afficher même si
 * c'est le thème ou un provider qui a échoué.
 */

const DANGER = "#E15554";
const DANGER_SOFT = "#FBECEB";
const TEXT_MAIN = "#1F3448";
const TEXT_MUTED = "#7A8FA6";
const CARD_BG = "#FFFFFF";
const PAGE_BG_TOP = "#F0F7F5";
const PAGE_BG_BOTTOM = "#FAFCFB";
const BRAND_TEAL = "#48C8AF";

export default function PatientErrorScreen({
  error,
  reset,
  action,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /** Ce que le patient venait faire, pour adapter le texte. */
  action: "confirmer votre rendez-vous" | "déposer votre ordonnance";
}) {
  useEffect(() => {
    // Seule trace disponible : le patient ne remontera pas l'incident lui-même.
    console.error("[patient] rendu en échec", {
      action,
      digest: error?.digest,
      message: error?.message,
    });
  }, [error, action]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(180deg, ${PAGE_BG_TOP} 0%, ${PAGE_BG_BOTTOM} 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          background: CARD_BG,
          borderRadius: 16,
          boxShadow: "0 4px 24px rgba(31, 52, 72, 0.08)",
          padding: 32,
          width: "100%",
          maxWidth: 480,
          textAlign: "center",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: DANGER_SOFT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
          aria-hidden="true"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill={DANGER}
          >
            <path d="M12 2 1 21h22L12 2zm1 15h-2v-2h2v2zm0-4h-2V9h2v4z" />
          </svg>
        </div>

        <h1
          style={{
            color: TEXT_MAIN,
            fontWeight: 700,
            fontSize: 20,
            margin: "0 0 12px",
          }}
        >
          Cette page n&apos;a pas pu s&apos;afficher
        </h1>

        <p
          style={{
            color: TEXT_MUTED,
            fontSize: 14,
            lineHeight: 1.55,
            margin: "0 auto 20px",
            maxWidth: 380,
          }}
        >
          Un incident technique nous empêche d&apos;afficher la page permettant
          de {action}. Vous pouvez réessayer ; si le problème persiste,
          contactez directement votre centre d&apos;imagerie — votre
          rendez-vous, lui, n&apos;est pas affecté.
        </p>

        <button
          type="button"
          onClick={reset}
          style={{
            appearance: "none",
            border: "none",
            cursor: "pointer",
            background: BRAND_TEAL,
            color: "#FFFFFF",
            borderRadius: 99,
            fontWeight: 700,
            fontSize: 15,
            padding: "12px 28px",
            boxShadow: "0 4px 12px rgba(72, 200, 175, 0.35)",
          }}
        >
          Réessayer
        </button>

        {error?.digest && (
          <div
            style={{
              marginTop: 20,
              color: TEXT_MUTED,
              fontSize: 11,
              fontFamily: "monospace",
            }}
          >
            Référence : {error.digest}
          </div>
        )}
      </div>
    </div>
  );
}
