"use client";

import { Chip, Stack } from "@mui/material";
import { endOfDay, startOfDay, startOfMonth, subDays, subMonths } from "date-fns";
import type { DateRange } from "@/components/DateRangePicker";

/**
 * Barre de raccourcis temporels (preset chips).
 *
 * - Style "pills" teal cohérent avec la DA du dashboard.
 * - La pill correspondant au range courant est mise en évidence (fond teal plein).
 * - Si l'utilisateur applique un range custom (via DatePicker), aucune pill n'est active.
 *
 * Tous les presets retournent un range en `[startOfDay, endOfDay]` (cohérent avec
 * le DateRangePicker custom).
 *
 * `douzeMois` ajoute « 12 derniers mois », réservé aux écrans de statistiques : la liste
 * des appels, elle, est bornée au délai de conservation du centre (rétention, 28/09/2026).
 */

type PresetKey = "today" | "yesterday" | "7d" | "30d" | "month" | "12m";

const PRESETS: { key: PresetKey; label: string; compute: () => DateRange }[] = [
  {
    key: "today",
    label: "Aujourd'hui",
    compute: () => {
      const t = new Date();
      return { from: startOfDay(t), to: endOfDay(t) };
    },
  },
  {
    key: "yesterday",
    label: "Hier",
    compute: () => {
      const y = subDays(new Date(), 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    },
  },
  {
    key: "7d",
    label: "7 derniers jours",
    compute: () => {
      const t = new Date();
      return { from: startOfDay(subDays(t, 6)), to: endOfDay(t) };
    },
  },
  {
    key: "30d",
    label: "30 derniers jours",
    compute: () => {
      const t = new Date();
      return { from: startOfDay(subDays(t, 29)), to: endOfDay(t) };
    },
  },
  {
    key: "month",
    label: "Ce mois",
    compute: () => {
      const t = new Date();
      return { from: startOfDay(startOfMonth(t)), to: endOfDay(t) };
    },
  },
];

const PRESET_DOUZE_MOIS: { key: PresetKey; label: string; compute: () => DateRange } = {
  key: "12m",
  label: "12 derniers mois",
  compute: () => {
    const t = new Date();
    return { from: startOfDay(subMonths(t, 12)), to: endOfDay(t) };
  },
};

/**
 * Compare deux ranges à la minute près (assez stable pour matcher les presets).
 * Si du code externe modifie une heure (ex. `subDays` puis utilisation directe),
 * la précision minute évite des faux négatifs sans pour autant fusionner des dates différentes.
 */
function rangesMatch(a: DateRange, b: DateRange): boolean {
  const minute = (d: Date) => Math.floor(d.getTime() / 60000);
  return minute(a.from) === minute(b.from) && minute(a.to) === minute(b.to);
}

export default function DateRangePresets({
  range,
  onChange,
  douzeMois = false,
}: {
  range: DateRange;
  onChange: (r: DateRange) => void;
  douzeMois?: boolean;
}) {
  const presets = douzeMois ? [...PRESETS, PRESET_DOUZE_MOIS] : PRESETS;
  const activeKey = presets.find((p) => rangesMatch(p.compute(), range))?.key ?? null;

  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1, alignItems: "center" }}>
      {presets.map((p) => {
        const isActive = activeKey === p.key;
        return (
          <Chip
            key={p.key}
            label={p.label}
            clickable
            onClick={() => onChange(p.compute())}
            sx={{
              fontWeight: 600,
              fontSize: 12,
              height: 30,
              bgcolor: isActive ? "var(--accent)" : "transparent",
              color: isActive ? "#fff" : "var(--accent-deep)",
              border: isActive
                ? "1px solid var(--accent)"
                : "1px solid rgba(var(--accent-rgb), 0.3)",
              transition: "all 160ms ease",
              "&:hover": {
                bgcolor: isActive ? "var(--accent-press)" : "rgba(var(--accent-rgb), 0.08)",
                borderColor: "var(--accent)",
              },
            }}
          />
        );
      })}
    </Stack>
  );
}
