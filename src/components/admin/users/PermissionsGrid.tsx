"use client";

import {
  Box,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { AccessLevel, PageKey, PAGE_GROUPS, PAGE_LABELS } from "@/lib/permissions";

const BRAND_TEAL = "var(--accent)";

type Props = {
  value: Partial<Record<PageKey, AccessLevel>>;
  onChange: (next: Partial<Record<PageKey, AccessLevel>>) => void;
  disabled?: boolean;
};

/**
 * Grille de permissions par page (chantier 3, Lot C).
 * -----------------------------------------------------------------------------
 * Pour chaque page canonique du dashboard :
 *   - Switch on/off pour "activer" la page
 *   - Si active : radio "Lecture seule" / "Lecture + ecriture"
 *
 * En sortie : Partial<Record<PageKey, AccessLevel>> avec uniquement les cles
 * activees (valeur "read" ou "write" — jamais "none", qui est represente par
 * l'absence de la cle).
 *
 * Rendu par SECTIONS depuis le 14/09/2026. La liste etait plate : lisible a treize
 * pages, illisible a vingt-six une fois les ecrans Konnect declares. Les groupes
 * viennent de `PAGE_GROUPS` et suivent l'ordre du menu, pour qu'on retrouve une page
 * la ou on l'a vue. Ajouter une page a `PAGES` sans la mettre dans un groupe fait
 * echouer le chargement de `permissions.ts` : elle serait invisible ici, donc
 * impossible a accorder.
 */
export default function PermissionsGrid({ value, onChange, disabled }: Props) {
  const togglePage = (page: PageKey, active: boolean) => {
    const next = { ...value };
    if (active) {
      next[page] = "read";
    } else {
      delete next[page];
    }
    onChange(next);
  };

  const setLevel = (page: PageKey, level: AccessLevel) => {
    onChange({ ...value, [page]: level });
  };

  const rendreLigne = (page: PageKey) => {
    const current = value[page];
    const enabled = current === "read" || current === "write";
    return (
      <Box
        key={page}
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: 2,
          px: 2,
          py: 1,
          borderRadius: 1,
          border: "1px solid #e5e7eb",
          bgcolor: enabled ? "rgba(var(--accent-rgb), 0.04)" : "transparent",
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {PAGE_LABELS[page]}
          </Typography>
          {enabled && (
            <FormControl sx={{ mt: 0.5 }} disabled={disabled}>
              <RadioGroup row value={current} onChange={(_, v) => setLevel(page, v as AccessLevel)}>
                <FormControlLabel
                  value="read"
                  control={
                    <Radio
                      size="small"
                      sx={{ color: BRAND_TEAL, "&.Mui-checked": { color: BRAND_TEAL } }}
                    />
                  }
                  label={<Typography variant="caption">Lecture seule</Typography>}
                />
                <FormControlLabel
                  value="write"
                  control={
                    <Radio
                      size="small"
                      sx={{ color: BRAND_TEAL, "&.Mui-checked": { color: BRAND_TEAL } }}
                    />
                  }
                  label={<Typography variant="caption">Lecture + ecriture</Typography>}
                />
              </RadioGroup>
            </FormControl>
          )}
        </Box>
        <Switch
          checked={enabled}
          onChange={(_, checked) => togglePage(page, checked)}
          disabled={disabled}
          sx={{
            "& .MuiSwitch-switchBase.Mui-checked": { color: BRAND_TEAL },
            "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { bgcolor: BRAND_TEAL },
          }}
        />
      </Box>
    );
  };

  return (
    <Stack spacing={2.5}>
      {PAGE_GROUPS.map((groupe) => (
        <Stack key={groupe.titre} spacing={1}>
          <Typography
            variant="overline"
            sx={{ color: "text.secondary", fontWeight: 700, letterSpacing: 0.6 }}
          >
            {groupe.titre}
          </Typography>
          {groupe.pages.map(rendreLigne)}
        </Stack>
      ))}
    </Stack>
  );
}
