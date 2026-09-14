"use client";

import * as React from "react";
import {
  Autocomplete,
  Box,
  Checkbox,
  Stack,
  TableCell,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { IconInfoCircle } from "@tabler/icons-react";
import ExamTypeBadge from "@/components/shared/ExamTypeBadge";

/**
 * Les cellules communes aux deux écrans de mapping, LyraeTalk et LyraeKonnect.
 *
 * POURQUOI DES CELLULES ET PAS UNE LIGNE PARTAGÉE. Une ligne générique aurait dû
 * connaître les colonnes des deux produits, donc leurs invariants, et c'est
 * exactement l'erreur du 14/09/2026 : le composant d'import partagé appliquait à
 * LyraeTalk une règle propre à Konnect (« un code RIS ne sert qu'à un examen »),
 * qui bloquait dix centres. **Mutualiser un composant ne mutualise pas les
 * invariants du produit.**
 *
 * Ici, chaque écran compose sa propre ligne avec ses propres colonnes singulières
 * (créneau horaire chez Talk ; réservable en ligne et ordonnance chez Konnect), et
 * ne partage que ce qui est strictement visuel. Aucune règle métier n'habite ce
 * fichier.
 *
 * L'ORDRE DES COLONNES COMMUNES, décidé par le client le 14/09/2026 :
 *
 *   Pratiqué · Examen · Code + Libellé patient · Type · Injecté (+ code)
 *
 * puis les colonnes propres au produit. « Liste d'attente » a été retirée de
 * l'affichage de Konnect à la même date ; ⚠️ sa VALEUR continue d'être chargée et
 * renvoyée par le `PUT`, sans quoi le retrait de la colonne l'aurait remise à
 * `false` chez tout le monde, en silence.
 */

export const PALETTE_MAPPING = {
  brand: "var(--accent)",
  ink: "#0F2A3F",
  inkMuted: "#5A6B7B",
  border: "#E4EAEE",
  surface: "#FFFFFF",
  surfaceMuted: "#F7FAFB",
  surfaceHover: "#F5FBFA",
  surfaceDisabled: "#EEF2F5",
  danger: "#E1573B",
} as const;

const P = PALETTE_MAPPING;

/** Cellule d'en-tête, avec son info-bulle d'explication. */
export function EnTeteMapping({
  children,
  aide,
  largeur,
  align = "left",
}: {
  children: React.ReactNode;
  aide?: string;
  largeur?: number | string;
  align?: "left" | "center";
}) {
  const cellule = (
    <TableCell
      align={align}
      sx={{
        bgcolor: P.surfaceMuted,
        color: P.inkMuted,
        fontWeight: 600,
        fontSize: 11.5,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        borderBottom: `1px solid ${P.border}`,
        width: largeur,
        whiteSpace: "nowrap",
        py: 1.25,
      }}
    >
      {children}
    </TableCell>
  );
  return aide ? (
    <Tooltip title={aide} placement="top">
      {cellule}
    </Tooltip>
  ) : (
    cellule
  );
}

/** Champ de saisie compact. La densité de la table de LyraeTalk, gardée partout. */
export function ChampCompact({
  valeur,
  onChange,
  placeholder,
  disabled,
  erreur,
  monospace = false,
}: {
  valeur: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  erreur?: boolean;
  monospace?: boolean;
}) {
  return (
    <TextField
      size="small"
      fullWidth
      value={valeur}
      disabled={disabled}
      error={erreur}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      sx={{
        "& .MuiOutlinedInput-root": {
          fontSize: 13,
          bgcolor: disabled ? "transparent" : P.surface,
          ...(monospace && { fontFamily: "monospace" }),
          "& fieldset": { borderColor: P.border },
          "&:hover fieldset": { borderColor: "#B9C7CE" },
          "&.Mui-focused fieldset": { borderColor: P.brand, borderWidth: 1.5 },
          "&.Mui-disabled": { bgcolor: P.surfaceDisabled },
        },
        "& .MuiOutlinedInput-input": { py: 0.75, px: 1 },
      }}
    />
  );
}

/** Case à cocher aux couleurs du produit actif. */
export function CaseMapping({
  coche,
  onChange,
  disabled,
}: {
  coche: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Checkbox
      size="small"
      checked={coche}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      sx={{ color: P.border, "&.Mui-checked": { color: P.brand } }}
    />
  );
}

/**
 * L'examen de notre référentiel : la pastille de modalité, le libellé, le code
 * dessous. C'était déjà la même présentation des deux côtés, elle est simplement
 * remontée ici pour qu'elle le reste.
 */
export function CelluleExamen({
  typeExamen,
  libelle,
  codeExamen,
}: {
  typeExamen: string | null;
  libelle: string | null;
  codeExamen: string;
}) {
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <ExamTypeBadge type={typeExamen ?? ""} />
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{ fontWeight: 600, fontSize: 13, color: P.ink, lineHeight: 1.3 }}
        >
          {libelle || codeExamen}
        </Typography>
        <Typography
          sx={{ fontSize: 11, color: P.inkMuted, fontFamily: "monospace", mt: 0.25 }}
        >
          {codeExamen}
        </Typography>
      </Box>
    </Stack>
  );
}

/**
 * Le code du RIS et le libellé montré au patient, **l'un au-dessus de l'autre**.
 *
 * C'est la présentation de LyraeTalk, retenue pour les deux : les deux champs
 * décrivent le même examen chez le client, et deux colonnes séparées les
 * éloignaient de dix centimètres chez Konnect.
 */
export function CelluleCodeLibelle({
  code,
  libelle,
  placeholderLibelle,
  onCode,
  onLibelle,
  disabled,
  erreurCode,
  messageErreur,
}: {
  code: string;
  libelle: string;
  placeholderLibelle?: string;
  onCode: (v: string) => void;
  onLibelle: (v: string) => void;
  disabled?: boolean;
  erreurCode?: boolean;
  messageErreur?: string;
}) {
  return (
    <Stack spacing={0.75}>
      <ChampCompact
        valeur={code}
        onChange={onCode}
        placeholder="Code"
        disabled={disabled}
        erreur={erreurCode}
        monospace
      />
      <ChampCompact
        valeur={libelle}
        onChange={onLibelle}
        placeholder={placeholderLibelle || "Libellé"}
        disabled={disabled}
      />
      {erreurCode && messageErreur && (
        <Typography sx={{ fontSize: 11, color: P.danger }}>{messageErreur}</Typography>
      )}
    </Stack>
  );
}

/**
 * Le type du RIS, **prérempli par les types que ce client a déjà saisis**.
 *
 * Un centre emploie trois ou quatre codes de type pour ses 287 examens, et les
 * retaper à la main est le meilleur moyen d'en écrire un de travers : une faute de
 * frappe ici et le couple (type, code) exigé par le RIS ne correspond plus à rien,
 * sans qu'aucune erreur ne soit levée. La liste propose donc l'existant, et reste
 * ouverte (`freeSolo`) : on peut toujours saisir un type pour un seul examen, ce qui
 * est précisément le cas du premier examen d'une nouvelle modalité.
 */
export function CelluleType({
  valeur,
  options,
  onChange,
  disabled,
}: {
  valeur: string;
  options: readonly string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Autocomplete
      freeSolo
      size="small"
      disabled={disabled}
      options={options}
      value={valeur}
      // `onInputChange` et pas `onChange` : `freeSolo` ne déclenche `onChange` qu'à
      // la validation, la frappe libre serait perdue au changement de page.
      inputValue={valeur}
      onInputChange={(_, v) => onChange(v ?? "")}
      disableClearable
      sx={{
        "& .MuiOutlinedInput-root": {
          fontSize: 13,
          fontFamily: "monospace",
          bgcolor: disabled ? "transparent" : P.surface,
          py: "0 !important",
          "& fieldset": { borderColor: P.border },
          "&:hover fieldset": { borderColor: "#B9C7CE" },
          "&.Mui-focused fieldset": { borderColor: P.brand, borderWidth: 1.5 },
          "&.Mui-disabled": { bgcolor: P.surfaceDisabled },
        },
        "& .MuiOutlinedInput-input": { py: "6px !important", px: "8px !important" },
      }}
      renderInput={(params) => <TextField {...params} placeholder="Ex : RX" />}
    />
  );
}

/**
 * « Injecté », et le code d'injection qui n'apparaît que si la case est cochée.
 *
 * La case ouvre le champ ; le champ reste ouvert tant qu'un code y est écrit, même
 * si l'on décoche. **Décocher n'effface jamais le code** : sur un centre qui en a
 * un, une case décochée par erreur aurait supprimé une information que rien ne
 * permet de retrouver. Le code visible sous une case décochée se voit, et se vide à
 * la main.
 *
 * `nonApplicable` couvre le cas de LyraeTalk, où l'injection ne concerne que les
 * scanners et les IRM.
 */
export function CelluleInjection({
  injecte,
  code,
  onInjecte,
  onCode,
  disabled,
  nonApplicable,
}: {
  injecte: boolean;
  code: string;
  onInjecte: (v: boolean) => void;
  onCode: (v: string) => void;
  disabled?: boolean;
  nonApplicable?: string;
}) {
  if (nonApplicable) {
    return (
      <Tooltip title={nonApplicable} arrow>
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.75}
          sx={{
            bgcolor: P.surfaceDisabled,
            border: `1px dashed ${P.border}`,
            borderRadius: 1,
            px: 1,
            py: 0.75,
            color: P.inkMuted,
            display: "inline-flex",
          }}
        >
          <IconInfoCircle size={13} />
          <Typography sx={{ fontSize: 12 }}>Non applicable</Typography>
        </Stack>
      </Tooltip>
    );
  }

  const ouvert = injecte || code.trim() !== "";

  return (
    <Stack spacing={0.5} alignItems="flex-start">
      <CaseMapping coche={injecte} onChange={onInjecte} disabled={disabled} />
      {ouvert && (
        <Box sx={{ width: "100%", minWidth: 120 }}>
          <ChampCompact
            valeur={code}
            onChange={onCode}
            placeholder="Code injection"
            disabled={disabled}
            monospace
          />
        </Box>
      )}
    </Stack>
  );
}
