"use client";

import * as React from "react";
import {
  Autocomplete,
  Box,
  Button,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { IconPlus, IconX } from "@tabler/icons-react";
import { PALETTE_MAPPING as P } from "@/components/mapping/cellules";
import {
  sallesDuType,
  type ExamenDuCentre,
  type ExceptionSalle,
  type SallesParType,
} from "@/lib/sallesExamen";

/**
 * Les salles imposées à un examen (`options.exceptionsSalles`, 07/10/2026).
 *
 * Une ligne par examen : l'examen (parmi ceux dont le type a des salles déclarées),
 * la salle (parmi celles de son type), et de quoi retirer la ligne. Une ligne est
 * toujours complète : l'ajout prend le premier examen libre et sa première salle,
 * changer d'examen reprend la première salle du nouveau type si l'ancienne n'en
 * fait pas partie. Il n'y a donc jamais de ligne à moitié remplie à refuser au
 * moment d'enregistrer.
 *
 * Ce que le robot en fait (Pontivy, R5 et la panoramique dentaire) : l'examen va
 * toujours dans cette salle, et demandé avec un autre il a son propre rendez-vous,
 * sans priorité de salle.
 */
export default function SallesImposees({
  examens,
  sallesParType,
  valeur,
  onChange,
  disabled,
}: {
  examens: readonly ExamenDuCentre[];
  sallesParType: SallesParType;
  valeur: readonly ExceptionSalle[];
  onChange: (exceptions: ExceptionSalle[]) => void;
  disabled?: boolean;
}) {
  const parCode = new Map(examens.map((e) => [e.codeExamen, e]));
  const libres = (sauf?: string) =>
    examens.filter(
      (e) => e.codeExamen === sauf || !valeur.some((v) => v.codeExamen === e.codeExamen)
    );

  const ajouter = () => {
    const examen = libres()[0];
    const salle = examen ? sallesDuType(sallesParType, examen.typeExamen)[0] : undefined;
    if (examen && salle) onChange([...valeur, { codeExamen: examen.codeExamen, poste: salle.poste }]);
  };

  const changer = (index: number, suivante: ExceptionSalle) =>
    onChange(valeur.map((v, i) => (i === index ? suivante : v)));

  return (
    <Box>
      <Typography sx={{ fontSize: 14, fontWeight: 700, color: P.ink }}>Salle imposée</Typography>
      <Typography sx={{ fontSize: 13, color: P.inkMuted, mb: 1.5 }}>
        L&apos;examen se fait toujours dans la salle choisie. Demandé avec un autre examen, il a
        son propre rendez-vous, et la priorité des salles ne compte pas pour lui.
      </Typography>

      <Stack spacing={1}>
        {valeur.map((exception, i) => {
          const examen = parCode.get(exception.codeExamen) ?? null;
          const salles = examen ? sallesDuType(sallesParType, examen.typeExamen) : [];
          return (
            <Stack
              key={exception.codeExamen}
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              alignItems={{ xs: "stretch", sm: "center" }}
            >
              <Autocomplete
                size="small"
                disabled={disabled}
                disableClearable
                options={libres(exception.codeExamen)}
                value={examen as ExamenDuCentre}
                getOptionLabel={(e) => e.libelle}
                isOptionEqualToValue={(a, b) => a.codeExamen === b.codeExamen}
                onChange={(_, e) => {
                  if (!e) return;
                  const sallesDuNouveau = sallesDuType(sallesParType, e.typeExamen);
                  const garde = sallesDuNouveau.some((s) => s.poste === exception.poste);
                  changer(i, {
                    codeExamen: e.codeExamen,
                    poste: garde ? exception.poste : (sallesDuNouveau[0]?.poste ?? ""),
                  });
                }}
                renderOption={(props, e) => (
                  <li {...props} key={e.codeExamen}>
                    <Box>
                      <Typography sx={{ fontSize: 13 }}>{e.libelle}</Typography>
                      <Typography sx={{ fontSize: 11, color: P.inkMuted, fontFamily: "monospace" }}>
                        {e.codeExamen}
                      </Typography>
                    </Box>
                  </li>
                )}
                renderInput={(params) => <TextField {...params} placeholder="Examen" />}
                sx={{ flex: 1, minWidth: 220, "& .MuiInputBase-root": { fontSize: 13 } }}
              />
              <Select
                size="small"
                disabled={disabled}
                value={salles.some((s) => s.poste === exception.poste) ? exception.poste : ""}
                onChange={(e) => changer(i, { ...exception, poste: String(e.target.value) })}
                sx={{ width: { xs: "100%", sm: 180 }, fontSize: 13 }}
              >
                {salles.map((s) => (
                  <MenuItem key={s.poste} value={s.poste} sx={{ fontSize: 13 }}>
                    {s.libelle}
                  </MenuItem>
                ))}
              </Select>
              <Tooltip title="Retirer">
                <span>
                  <IconButton
                    size="small"
                    aria-label={`Retirer la salle imposée de ${examen?.libelle ?? exception.codeExamen}`}
                    disabled={disabled}
                    onClick={() => onChange(valeur.filter((_, j) => j !== i))}
                  >
                    <IconX size={16} />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          );
        })}
      </Stack>

      {!disabled && (
        <Button
          size="small"
          startIcon={<IconPlus size={15} />}
          onClick={ajouter}
          disabled={libres().length === 0}
          sx={{ mt: 1, color: "var(--accent-deep)" }}
        >
          Ajouter une salle imposée
        </Button>
      )}
    </Box>
  );
}
