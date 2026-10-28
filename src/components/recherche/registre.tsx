"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { Box, CircularProgress } from "@mui/material";
import type { CleFiltre } from "@/lib/recherche/moteur";

/**
 * Registre des écrans que le panneau de la recherche sait monter (R8).
 *
 * Clé : le chemin d'une fiche du catalogue (`catalogue.ts`), sans l'ancre. Valeur : la
 * PAGE de l'écran, la même que celle du menu. Pour Talk, c'est la coquille qui résout le
 * `userProductId` avant de monter l'`Ecran` ; dans le panneau, `useCentreProduit` la lit
 * dans le contexte `FournisseurIntegre` plutôt que dans l'URL. Aucun écran recopié.
 *
 * `applique` : les filtres que l'écran sait recevoir aujourd'hui (`useFiltresRecherche`).
 * Un filtre lu dans la phrase mais absent d'ici est montré comme « pas filtrable sur cet
 * écran », jamais appliqué en silence ni passé sous silence.
 *
 * Chaque écran est chargé à la demande : l'en-tête, monté partout, n'embarque pas les
 * vingt-sept écrans.
 *
 * Le contrôle `scripts/recherche/controle.mjs` vérifie qu'une fiche a son écran ici, et
 * qu'une ancre de fiche existe dans le code de son écran.
 */
export type EcranMontable = {
  composant: ComponentType;
  applique: CleFiltre[];
};

function Chargement() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
      <CircularProgress size={28} sx={{ color: "var(--accent)" }} />
    </Box>
  );
}

const charger = (f: () => Promise<{ default: ComponentType<any> }>) =>
  dynamic(f, { ssr: false, loading: Chargement }) as ComponentType;

export const REGISTRE: Record<string, EcranMontable> = {
  // ── LyraeTalk ──
  talk: {
    composant: charger(() => import("@/app/client/c/[userId]/talk/page")),
    applique: [],
  },
  "talk/calls": {
    composant: charger(() => import("@/app/client/c/[userId]/talk/calls/page")),
    applique: ["periode", "type", "issue", "telephone"],
  },
  "talk/incidents": {
    composant: charger(() => import("@/app/client/c/[userId]/talk/incidents/page")),
    applique: [],
  },
  "talk/ordonnances-manquantes": {
    composant: charger(() => import("@/app/client/c/[userId]/talk/ordonnances-manquantes/page")),
    applique: [],
  },
  "talk/parametrage": {
    composant: charger(() => import("@/app/client/c/[userId]/talk/parametrage/page")),
    applique: [],
  },
  "talk/parametrage/mapping_exam": {
    composant: charger(() => import("@/app/client/c/[userId]/talk/parametrage/mapping_exam/page")),
    applique: ["examen", "type"],
  },
  "talk/parametrage/mapping_exam/type_exam": {
    composant: charger(
      () => import("@/app/client/c/[userId]/talk/parametrage/mapping_exam/type_exam/page")
    ),
    applique: [],
  },
  "talk/parametrage/mapping_exam/double_exam": {
    composant: charger(
      () => import("@/app/client/c/[userId]/talk/parametrage/mapping_exam/double_exam/page")
    ),
    applique: [],
  },
  "talk/parametrage/questions_exam": {
    composant: charger(() => import("@/app/client/c/[userId]/talk/parametrage/questions_exam/page")),
    applique: [],
  },
  "talk/informationnel": {
    composant: charger(() => import("@/app/client/c/[userId]/talk/informationnel/page")),
    applique: ["texte"],
  },
  "talk/stats_appel": {
    composant: charger(() => import("@/app/client/c/[userId]/talk/stats_appel/page")),
    applique: ["periode"],
  },
  "talk/planning-complet": {
    composant: charger(() => import("@/app/client/c/[userId]/talk/planning-complet/page")),
    applique: ["periode"],
  },
  "talk/stats-no-show": {
    composant: charger(() => import("@/app/client/c/[userId]/talk/stats-no-show/page")),
    applique: ["periode"],
  },

  // ── LyraeKonnect ──
  "konnect/demandes-rappel": {
    composant: charger(() => import("@/app/client/c/[userId]/konnect/demandes-rappel/page")),
    applique: [],
  },
  "konnect/examens": {
    composant: charger(() => import("@/app/client/c/[userId]/konnect/examens/page")),
    applique: ["examen", "type"],
  },
  "konnect/liste-attente": {
    composant: charger(() => import("@/app/client/c/[userId]/konnect/liste-attente/page")),
    applique: [],
  },
  "konnect/mots-cabinet": {
    composant: charger(() => import("@/app/client/c/[userId]/konnect/mots-cabinet/page")),
    applique: [],
  },
  "konnect/ordre-creneaux": {
    composant: charger(() => import("@/app/client/c/[userId]/konnect/ordre-creneaux/page")),
    applique: [],
  },
  "konnect/ordre-entonnoir": {
    composant: charger(() => import("@/app/client/c/[userId]/konnect/ordre-entonnoir/page")),
    applique: [],
  },
  "konnect/paires-examens": {
    composant: charger(() => import("@/app/client/c/[userId]/konnect/paires-examens/page")),
    applique: [],
  },
  "konnect/parametrage": {
    composant: charger(() => import("@/app/client/c/[userId]/konnect/parametrage/page")),
    applique: [],
  },
  "konnect/questionnaires": {
    composant: charger(() => import("@/app/client/c/[userId]/konnect/questionnaires/page")),
    applique: [],
  },
  "konnect/regles-cliniques": {
    composant: charger(() => import("@/app/client/c/[userId]/konnect/regles-cliniques/page")),
    applique: [],
  },
  "konnect/regles-fusion": {
    composant: charger(() => import("@/app/client/c/[userId]/konnect/regles-fusion/page")),
    applique: [],
  },
  "konnect/relances-no-show": {
    composant: charger(() => import("@/app/client/c/[userId]/konnect/relances-no-show/page")),
    applique: ["periode"],
  },
  "konnect/sites": {
    composant: charger(() => import("@/app/client/c/[userId]/konnect/sites/page")),
    applique: [],
  },
  "konnect/statistiques": {
    composant: charger(() => import("@/app/client/c/[userId]/konnect/statistiques/page")),
    applique: [],
  },
};
