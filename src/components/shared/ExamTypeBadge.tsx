"use client";

import { Box, SxProps, Theme } from "@mui/material";

/**
 * ExamTypeBadge : badge visuel unifie pour representer un type d'examen
 * d'imagerie medicale (chantier 2026-08-06).
 *
 * Palette semantique par modalite :
 *   RX  -> bleu (radiographie, technologies x-ray classiques)
 *   US  -> vert (echographie, ondes ultrasonores)
 *   CT  -> orange (scanner CT, injections frequentes)
 *   MR  -> violet (IRM, technologie magnetique)
 *   MG  -> rose (mammographie, pathologie sein)
 *   USMAM -> cyan (echographie mammaire, hybride US + zone MG)
 *
 * Utilise dans :
 *  - /parametrage/mapping_exam (cellules examens)
 *  - /ordonnances-manquantes (chips exam type)
 *  - Tout endroit ou un typeExamen NEURACORP est affiche
 *
 * Reste sobre : petit badge inline, pas d'icone (garder la densite dans les
 * tables). Pour un usage plus impactant (KPI card, header), utiliser
 * variant="large".
 */

export const EXAM_TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  RX: { bg: "#E7F0FA", fg: "#1F5F9B" },
  US: { bg: "#E5F5EE", fg: "#1E8A5B" },
  CT: { bg: "#FCF0E6", fg: "#B4602A" },
  MR: { bg: "#F1EAF7", fg: "#6E3E9E" },
  MG: { bg: "#FCE9EF", fg: "#B33266" },
  USMAM: { bg: "#E4F4F5", fg: "#1F7F86" },
};

/**
 * Libelles longs (utilises dans les selects, tooltips, headers).
 * Les cles courtes (RX, US...) restent la source de verite en DB.
 */
export const EXAM_TYPE_LABELS: Record<string, string> = {
  RX: "Radiographie",
  US: "Échographie",
  CT: "Scanner",
  MR: "IRM",
  MG: "Mammographie",
  USMAM: "Écho mammaire",
};

/** Libelles courts pour les selects/menus compacts. */
export const EXAM_TYPE_SHORT: Record<string, string> = {
  RX: "Radio",
  US: "Écho",
  CT: "Scanner",
  MR: "IRM",
  MG: "Mammo",
  USMAM: "Écho mam.",
};

const FALLBACK = { bg: "#F1F5F9", fg: "#5A6B7B" };

/**
 * Mapping des cles "longues" (utilisees dans TalkSettings.exams, prescriptions,
 * planning...) vers les codes courts NEURACORP. Permet a une card qui a un
 * `examType: "scanner"` d'utiliser le meme badge visuel que la table mapping.
 */
const LEGACY_KEY_TO_CODE: Record<string, string> = {
  scanner: "CT",
  irm: "MR",
  mammographie: "MG",
  mammo: "MG",
  radiographie: "RX",
  radio: "RX",
  echographie: "US",
  echo: "US",
  echomammaire: "USMAM",
  "echo-mammaire": "USMAM",
};

/**
 * Normalise une chaine quelconque vers un code d'exam ('CT', 'MR', ...).
 * Retourne null si aucune correspondance.
 */
export function toExamTypeCode(input?: string | null): string | null {
  if (!input) return null;
  const upper = input.trim().toUpperCase();
  if (EXAM_TYPE_COLORS[upper]) return upper;
  const lower = input.trim().toLowerCase();
  return LEGACY_KEY_TO_CODE[lower] ?? null;
}

interface Props {
  type: string;
  /**
   * compact : badge 26px (tables tres denses)
   * default : badge 32px (usage courant)
   * large   : badge 40px (KPI, header de section)
   */
  variant?: "compact" | "default" | "large";
  sx?: SxProps<Theme>;
}

export default function ExamTypeBadge({ type, variant = "default", sx }: Props) {
  const c = EXAM_TYPE_COLORS[type] ?? FALLBACK;
  const sizeMap = {
    compact: { fs: 10, px: 0.75, py: 0.25, min: 26 },
    default: { fs: 11, px: 1, py: 0.25, min: 32 },
    large: { fs: 13, px: 1.25, py: 0.5, min: 40 },
  }[variant];

  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: c.bg,
        color: c.fg,
        fontWeight: 700,
        fontSize: sizeMap.fs,
        px: sizeMap.px,
        py: sizeMap.py,
        borderRadius: 1,
        letterSpacing: "0.03em",
        minWidth: sizeMap.min,
        textAlign: "center",
        lineHeight: 1.2,
        ...sx,
      }}
    >
      {type}
    </Box>
  );
}
