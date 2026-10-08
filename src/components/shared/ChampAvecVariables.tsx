"use client";

import { useRef } from "react";
import {
  Box,
  Chip,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";

/**
 * Un champ texte et ses variables à insérer (08/10/2026).
 *
 * Un clic sur une étiquette pose `{variable}` à l'endroit du curseur, pour que le
 * client n'ait jamais à taper une accolade. Sert aux textes de confirmation du
 * robot (consigne orale, SMS) ; la liste des variables vient de
 * `src/lib/talkTextes.ts`.
 */
export default function ChampAvecVariables({
  label,
  valeur,
  onChange,
  variables,
  placeholder,
  aide,
  erreur,
  desactive,
  minRows = 2,
  maxLength,
}: {
  label: string;
  valeur: string;
  onChange: (v: string) => void;
  variables: { nom: string; aide: string }[];
  placeholder?: string;
  aide?: React.ReactNode;
  erreur?: string | null;
  desactive?: boolean;
  minRows?: number;
  maxLength?: number;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  function inserer(nom: string) {
    const jeton = `{${nom}}`;
    const el = ref.current;
    const debut = el?.selectionStart ?? valeur.length;
    const fin = el?.selectionEnd ?? valeur.length;
    onChange(valeur.slice(0, debut) + jeton + valeur.slice(fin));
    // Le curseur revient juste après la variable insérée.
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = debut + jeton.length;
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <Box>
      <TextField
        label={label}
        fullWidth
        multiline
        minRows={minRows}
        value={valeur}
        placeholder={placeholder}
        disabled={desactive}
        error={Boolean(erreur)}
        helperText={erreur || aide || undefined}
        inputRef={ref}
        inputProps={maxLength ? { maxLength } : undefined}
        onChange={(e) => onChange(e.target.value)}
        InputLabelProps={{ shrink: true }}
      />
      <Stack
        direction="row"
        spacing={0.75}
        useFlexGap
        flexWrap="wrap"
        alignItems="center"
        sx={{ mt: 0.5 }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
          Insérer :
        </Typography>
        {variables.map((v) => (
          <Tooltip key={v.nom} title={v.aide} arrow>
            <span>
              <Chip
                size="small"
                variant="outlined"
                label={`{${v.nom}}`}
                disabled={desactive}
                onClick={() => inserer(v.nom)}
                sx={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 12,
                  borderColor: "rgba(var(--accent-rgb), 0.5)",
                  color: "var(--accent-deep)",
                  "&:hover": { bgcolor: "rgba(var(--accent-rgb), 0.1)" },
                }}
              />
            </span>
          </Tooltip>
        ))}
      </Stack>
    </Box>
  );
}
