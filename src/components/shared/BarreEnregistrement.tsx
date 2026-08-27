"use client";

import React from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { IconDeviceFloppy } from "@tabler/icons-react";

/**
 * Barre d'enregistrement flottante, en bas à droite de l'écran.
 *
 * Reprise de l'écran de mapping de LyraeTalk, pour que tous les écrans de
 * configuration se conduisent pareil : le bouton reste éteint tant qu'il n'y a
 * rien à sauver, et s'allume dès la première modification. On voit d'un coup
 * d'œil qu'un changement attend, même après avoir fait défiler la page.
 *
 * Le contenu de la page doit garder une marge en bas pour ne pas passer dessous.
 * Elle est posée une fois pour toutes dans le layout (`pb` de la zone de
 * contenu), il n'y a rien à faire dans chaque écran.
 *
 * `blocage` sert aux validations qui interdisent l'enregistrement (un doublon,
 * un champ obligatoire vide). Le texte est affiché à la place du compteur, et le
 * bouton reste éteint : l'utilisateur voit pourquoi il ne peut pas enregistrer,
 * plutôt qu'un bouton mort sans explication.
 */

const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";
const SURFACE = "#FFFFFF";
const DANGER = "#B3261E";

type Props = {
  modifications: number;
  enregistrement: boolean;
  onEnregistrer: () => void;
  onAnnuler?: () => void;
  /** Raison qui interdit l'enregistrement. Vide ou absent = rien ne bloque. */
  blocage?: string | null;
  /** Texte du bouton au repos. Par défaut « Enregistrer ». */
  libelle?: string;
};

export default function BarreEnregistrement({
  modifications,
  enregistrement,
  onEnregistrer,
  onAnnuler,
  blocage,
  libelle = "Enregistrer",
}: Props) {
  const bloque = Boolean(blocage);
  const rienAFaire = modifications === 0;

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 16,
        right: 24,
        zIndex: 10,
        display: "flex",
        gap: 1.5,
        bgcolor: SURFACE,
        border: `1px solid ${bloque ? DANGER : BORDER}`,
        borderRadius: 3,
        px: 2,
        py: 1.25,
        boxShadow: "0 10px 30px rgba(15, 42, 63, 0.10)",
        alignItems: "center",
        maxWidth: "min(560px, calc(100vw - 48px))",
      }}
    >
      {bloque ? (
        <Typography variant="body2" sx={{ color: DANGER, fontWeight: 500 }}>
          {blocage}
        </Typography>
      ) : (
        modifications > 0 && (
          <>
            <Typography variant="body2" sx={{ color: INK_MUTED, fontWeight: 500 }}>
              {modifications} modif.
            </Typography>
            {onAnnuler && (
              <Button
                onClick={onAnnuler}
                disabled={enregistrement}
                size="small"
                sx={{
                  textTransform: "none",
                  color: INK_MUTED,
                  "&:hover": { color: DANGER },
                }}
              >
                Annuler
              </Button>
            )}
          </>
        )
      )}

      <Button
        size="small"
        variant="contained"
        disableElevation
        startIcon={
          enregistrement ? (
            <CircularProgress size={14} sx={{ color: "#fff" }} />
          ) : (
            <IconDeviceFloppy size={15} />
          )
        }
        onClick={onEnregistrer}
        disabled={enregistrement || rienAFaire || bloque}
        sx={{
          bgcolor: "var(--accent)",
          color: "#fff",
          fontWeight: 600,
          textTransform: "none",
          px: 2.5,
          whiteSpace: "nowrap",
          "&:hover": { bgcolor: "var(--accent-press)" },
          "&.Mui-disabled": { bgcolor: "#D5DFE5", color: "#8FA0AE" },
        }}
      >
        {enregistrement ? "Enregistrement en cours" : libelle}
      </Button>
    </Box>
  );
}
