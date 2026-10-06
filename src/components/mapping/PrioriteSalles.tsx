"use client";

import * as React from "react";
import { Box, IconButton, MenuItem, Select, Stack, Tooltip, Typography } from "@mui/material";
import { IconArrowDown, IconArrowUp, IconX } from "@tabler/icons-react";
import { PALETTE_MAPPING as P } from "@/components/mapping/cellules";

/**
 * Une liste ordonnée de salles : la première est essayée d'abord.
 *
 * Sert la priorité des salles d'un double examen (`options.prioriteSalles`, plan
 * `2026-10-filtrage-creneaux-par-salle`). On monte, on descend, on retire, on
 * ajoute ; les salles s'affichent par leur nom, jamais par le code du poste. Vide =
 * « Pas de priorité » : le robot garde son ordre habituel, par date.
 *
 * Les flèches reprennent le geste de l'écran « Ordre de l'entonnoir » de Konnect.
 */
export default function PrioriteSalles({
  salles,
  valeur,
  onChange,
  disabled,
}: {
  salles: readonly { poste: string; libelle: string }[];
  valeur: readonly string[];
  onChange: (postes: string[]) => void;
  disabled?: boolean;
}) {
  const libelleDe = (poste: string) =>
    salles.find((s) => s.poste === poste)?.libelle ?? poste;
  const restantes = salles.filter((s) => !valeur.includes(s.poste));

  const deplacer = (index: number, delta: number) => {
    const cible = index + delta;
    if (cible < 0 || cible >= valeur.length) return;
    const suivante = [...valeur];
    [suivante[index], suivante[cible]] = [suivante[cible], suivante[index]];
    onChange(suivante);
  };

  return (
    <Stack spacing={0.5} sx={{ minWidth: 200 }}>
      {valeur.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: P.inkMuted }}>Pas de priorité</Typography>
      ) : (
        valeur.map((poste, i) => (
          <Stack
            key={poste}
            direction="row"
            alignItems="center"
            spacing={0.25}
            sx={{
              border: `1px solid ${P.border}`,
              borderRadius: 1,
              pl: 1,
              bgcolor: P.surface,
            }}
          >
            <Typography sx={{ fontSize: 13, color: P.ink, flex: 1, minWidth: 0 }} noWrap>
              <Box component="span" sx={{ color: P.inkMuted, mr: 0.75 }}>
                {i + 1}.
              </Box>
              {libelleDe(poste)}
            </Typography>
            <Tooltip title="Monter">
              <span>
                <IconButton
                  size="small"
                  aria-label={`Monter ${libelleDe(poste)}`}
                  disabled={disabled || i === 0}
                  onClick={() => deplacer(i, -1)}
                >
                  <IconArrowUp size={15} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Descendre">
              <span>
                <IconButton
                  size="small"
                  aria-label={`Descendre ${libelleDe(poste)}`}
                  disabled={disabled || i === valeur.length - 1}
                  onClick={() => deplacer(i, 1)}
                >
                  <IconArrowDown size={15} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Retirer">
              <span>
                <IconButton
                  size="small"
                  aria-label={`Retirer ${libelleDe(poste)}`}
                  disabled={disabled}
                  onClick={() => onChange(valeur.filter((p) => p !== poste))}
                >
                  <IconX size={15} />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        ))
      )}

      {restantes.length > 0 && !disabled && (
        <Select
          size="small"
          displayEmpty
          value=""
          onChange={(e) => {
            const poste = String(e.target.value);
            if (poste) onChange([...valeur, poste]);
          }}
          renderValue={() => (
            <Typography component="span" sx={{ fontSize: 13, color: P.inkMuted }}>
              Ajouter une salle
            </Typography>
          )}
          sx={{
            fontSize: 13,
            bgcolor: P.surface,
            "& fieldset": { borderColor: P.border },
            "& .MuiSelect-select": { py: 0.6, px: 1 },
          }}
        >
          {restantes.map((s) => (
            <MenuItem key={s.poste} value={s.poste} sx={{ fontSize: 13 }}>
              {s.libelle}
            </MenuItem>
          ))}
        </Select>
      )}
    </Stack>
  );
}
