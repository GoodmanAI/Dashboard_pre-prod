"use client";

import { useEffect, useRef, useState } from "react";
import { Box, ButtonBase, Chip, InputBase, Stack, Typography } from "@mui/material";
import { IconSearch } from "@tabler/icons-react";
import { BORDER, INK, INK_MUTED, SURFACE, SURFACE_MUTED } from "@/lib/jetons";
import { EXEMPLES, ouvrirRecherche } from "./PanneauRecherche";
import BoutonDictee from "./BoutonDictee";

/**
 * Les deux portes de la recherche centrale (R5). Toutes deux ouvrent le même panneau,
 * monté dans l'en-tête (`PanneauRecherche`).
 *
 * - `accueil` : la grande barre au centre de l'accueil client, avec des exemples dessous ;
 * - `entete` : la petite barre de l'en-tête, qui rappelle `Ctrl+K`.
 */
export default function BarreRecherche({
  variante,
  exemples,
  placeholder,
  focusAuChargement = false,
  pleineLargeur = false,
}: {
  variante: "accueil" | "entete";
  /** Phrases proposées sous la barre (accueil). Par défaut, les trois premiers `EXEMPLES`. */
  exemples?: string[];
  placeholder?: string;
  /** Curseur dans la barre dès l'arrivée, à la souris seulement (sur téléphone, le clavier
   * s'ouvrirait et cacherait l'écran). */
  focusAuChargement?: boolean;
  /** Occupe toute la colonne (accueil d'un produit) au lieu de 760 px. */
  pleineLargeur?: boolean;
}) {
  if (variante === "entete") return <PorteEntete />;
  return (
    <BarreAccueil
      exemples={exemples ?? EXEMPLES.slice(0, 3)}
      placeholder={placeholder ?? "Que cherchez-vous ? « les appels transférés hier »"}
      focusAuChargement={focusAuChargement}
      pleineLargeur={pleineLargeur}
    />
  );
}

function PorteEntete() {
  return (
    <ButtonBase
      onClick={() => ouvrirRecherche()}
      aria-label="Rechercher dans votre espace"
      aria-keyshortcuts="Control+K"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        height: 38,
        width: { xs: 38, md: 280 },
        px: { xs: 0, md: 1.5 },
        justifyContent: { xs: "center", md: "flex-start" },
        borderRadius: 2,
        border: `1px solid ${BORDER}`,
        bgcolor: SURFACE_MUTED,
        color: INK_MUTED,
        transition: "border-color .15s",
        "&:hover": { borderColor: "var(--accent)" },
        "&.Mui-focusVisible": { outline: "2px solid var(--accent)", outlineOffset: 2 },
      }}
    >
      <IconSearch size={18} style={{ flexShrink: 0 }} />
      <Typography variant="body2" sx={{ flex: 1, textAlign: "left", display: { xs: "none", md: "block" } }}>
        Rechercher
      </Typography>
      <Box
        component="kbd"
        sx={{
          display: { xs: "none", md: "inline-block" },
          fontFamily: "inherit",
          fontSize: 12,
          lineHeight: "18px",
          px: 0.75,
          borderRadius: 1,
          border: `1px solid ${BORDER}`,
          bgcolor: SURFACE,
          color: INK_MUTED,
        }}
      >
        Ctrl K
      </Box>
    </ButtonBase>
  );
}

function BarreAccueil({
  exemples,
  placeholder,
  focusAuChargement,
  pleineLargeur,
}: {
  exemples: string[];
  placeholder: string;
  focusAuChargement: boolean;
  pleineLargeur: boolean;
}) {
  const [phrase, setPhrase] = useState("");
  const [erreurDictee, setErreurDictee] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focusAuChargement) return;
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) champ.current?.focus();
  }, [focusAuChargement]);
  return (
    <Box sx={{ maxWidth: pleineLargeur ? "none" : 760, mx: "auto", mb: 4 }}>
      <Box
        component="form"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (phrase.trim()) ouvrirRecherche(phrase);
        }}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 2.5,
          height: 60,
          borderRadius: 3,
          bgcolor: SURFACE,
          border: `1.5px solid ${BORDER}`,
          boxShadow: "0 6px 24px rgba(15, 42, 63, 0.06)",
          transition: "border-color .15s, box-shadow .15s",
          "&:focus-within": {
            borderColor: "var(--accent)",
            boxShadow: "0 0 0 4px rgba(var(--accent-rgb), 0.15)",
          },
        }}
      >
        <IconSearch size={22} color={INK_MUTED} style={{ flexShrink: 0 }} />
        <InputBase
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder={placeholder}
          inputRef={champ}
          inputProps={{ "aria-label": "Ce que vous cherchez", maxLength: 300 }}
          sx={{ flex: 1, fontSize: { xs: 16, md: 18 }, color: INK }}
        />
        <BoutonDictee
          onTexte={(t) => {
            setErreurDictee(null);
            setPhrase(t);
            ouvrirRecherche(t);
          }}
          onErreur={setErreurDictee}
        />
      </Box>
      {erreurDictee && (
        <Typography variant="body2" role="alert" sx={{ mt: 1, textAlign: "center", color: INK_MUTED }}>
          {erreurDictee}
        </Typography>
      )}
      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, mt: 1.5, justifyContent: "center" }}>
        {exemples.map((p) => (
          <Chip
            key={p}
            label={p}
            size="small"
            variant="outlined"
            onClick={() => ouvrirRecherche(p)}
            sx={{
              height: 30,
              fontSize: 13,
              borderColor: BORDER,
              color: INK_MUTED,
              bgcolor: SURFACE,
              transition: "border-color 200ms ease, color 200ms ease",
              "@media (hover: hover) and (pointer: fine)": {
                "&:hover": { borderColor: "rgba(var(--accent-rgb), 0.55)", color: INK, bgcolor: SURFACE },
              },
            }}
          />
        ))}
      </Stack>
    </Box>
  );
}
