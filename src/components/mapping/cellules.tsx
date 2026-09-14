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
      // `freeSolo` masque la fleche par defaut, et le champ ressemblait alors a une
      // simple saisie de texte : rien ne disait qu'une liste existe. Constate a
      // l'ecran le 14/09/2026. C'est tout l'interet de la colonne, il faut le voir.
      forcePopupIcon
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

/**
 * Une rangée « libellé + champ » dans la fiche compacte.
 *
 * Le libellé est indispensable : en tableau, l'en-tête de colonne dit ce qu'on
 * remplit ; en fiche, il n'y a plus d'en-tête, et un champ nu ne se devine pas.
 */
export function RangeeChamp({
  libelle,
  children,
}: {
  libelle: string;
  children: React.ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={{ xs: 0.5, sm: 1.5 }}
      // `flex-start` et pas `center` : une rangee peut porter DEUX champs (le code et
      // le libelle) ou une case plus un champ (l'injection). Centre, le libelle se
      // posait alors a mi-hauteur, en face de rien. Aligne en haut, il designe
      // toujours le premier element de sa rangee. Constate a l'ecran le 14/09/2026.
      alignItems={{ xs: "stretch", sm: "flex-start" }}
      sx={{ width: "100%" }}
    >
      <Typography
        sx={{
          fontSize: 12,
          fontWeight: 600,
          color: P.inkMuted,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          lineHeight: 1.3,
          flex: { sm: "0 0 150px" },
          // Aligne le libelle sur la PREMIERE ligne de texte du champ, pas sur le
          // haut de sa bordure.
          pt: { sm: 0.9 },
        }}
      >
        {libelle}
      </Typography>
      {/* Borne la zone de saisie. Sans elle, un code de quatre caracteres se voyait
          offrir 800 px sur un ecran large, la fiche etant une seule colonne. La
          valeur reprend l'ordre de grandeur des colonnes du tableau (220 px pour le
          code et le libelle), avec de la marge. */}
      <Box sx={{ flex: 1, minWidth: 0, maxWidth: 340 }}>{children}</Box>
    </Stack>
  );
}

/**
 * La ligne du tableau **dépliée en fiche**, pour les écrans trop étroits.
 *
 * POURQUOI UNE FICHE ET PAS UN DÉFILEMENT. Le tableau fait 1 180 px de colonnes et
 * défile déjà horizontalement, ce qui suffit pour LIRE. Mais cet écran sert à
 * SAISIR 287 lignes : devoir pousser le tableau vers la gauche pour atteindre le
 * champ qu'on remplit, ligne après ligne, est une autre affaire. En dessous du
 * seuil, chaque examen devient donc un bloc où tous ses champs sont visibles d'un
 * coup, l'un sous l'autre.
 *
 * L'en-tête de la fiche porte les trois choses qui identifient l'examen et qu'on ne
 * saisit pas : la case « pratiqué », la pastille de modalité, le libellé et le code
 * de notre référentiel. C'est le même contenu que les deux premières colonnes du
 * tableau, dans le même ordre.
 *
 * Les champs, eux, sont passés par l'appelant : chaque produit a les siens, et cette
 * fiche n'en connaît aucun. Même raison que pour les cellules, et c'est la leçon du
 * 14/09/2026 : un composant partagé ne doit pas porter les invariants d'un produit.
 */
export function CarteMapping({
  performed,
  onPerformed,
  typeExamen,
  libelle,
  codeExamen,
  disabled,
  children,
}: {
  performed: boolean;
  onPerformed: (v: boolean) => void;
  typeExamen: string | null;
  libelle: string | null;
  codeExamen: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        border: `1px solid ${P.border}`,
        borderRadius: 2,
        p: 1.5,
        bgcolor: P.surface,
        // Même atténuation qu'en tableau : un examen non pratiqué s'efface du regard
        // sans disparaître de la liste.
        opacity: performed ? 1 : 0.55,
      }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={1}>
        <Box sx={{ mt: -0.5, ml: -0.5 }}>
          <CaseMapping coche={performed} onChange={onPerformed} disabled={disabled} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <CelluleExamen
            typeExamen={typeExamen}
            libelle={libelle}
            codeExamen={codeExamen}
          />
        </Box>
      </Stack>

      <Stack spacing={1.25} sx={{ mt: 1.5, pl: { sm: 0.5 } }}>
        {children}
      </Stack>
    </Box>
  );
}

/**
 * Les options passées à `useMediaQuery` pour évaluer le seuil.
 *
 * `noSsr: true` supprime le double rendu de `useMediaQuery` : sans lui, le hook
 * renvoie d'abord `false` (le serveur ne connaît aucune largeur), puis la vraie
 * mesure au rendu suivant. Ces deux écrans sont derrière une session et ne sont
 * jamais indexés : il n'y a rien à gagner à les rendre côté serveur, et un rendu de
 * plus à perdre.
 *
 * ⚠️ Ce drapeau ne protège d'AUCUN clignotement ici, contrairement à ce que j'avais
 * écrit le 14/09/2026 en voyant un `MuiTable-root` dans le HTML servi. Ce tableau-là
 * venait de la page d'aperçu jetable, qui n'a pas d'état de chargement. Les deux
 * écrans réels ne rendent leur tableau qu'une fois les données arrivées
 * (`loading` / `chargement`, vrais au départ), donc après la mesure : le HTML du
 * serveur ne porte jamais la mauvaise disposition. Le gain est d'un rendu, pas d'un
 * clignotement.
 */
export const OPTIONS_SEUIL = { noSsr: true } as const;

/**
 * Le seuil en dessous duquel les deux écrans passent en fiches.
 *
 * `lg` = 1 200 px de fenêtre. La zone de contenu est plus étroite que la fenêtre, le
 * menu latéral en prenant environ 270 px : en dessous de ce seuil, les 1 180 px de
 * colonnes ne tiennent plus sans défilement horizontal. Au-dessus, le tableau reste,
 * parce qu'il montre plus de lignes d'un coup et que c'est ce qu'on veut quand on
 * relit un mapping.
 *
 * Une seule constante, pour que les deux produits basculent au même endroit.
 */
export const SEUIL_FICHES = "lg" as const;
