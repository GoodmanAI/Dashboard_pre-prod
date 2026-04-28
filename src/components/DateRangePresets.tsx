"use client";

import { Chip, Stack } from "@mui/material";
import { endOfDay, startOfDay, startOfMonth, subDays } from "date-fns";
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
 */

type PresetKey = "today" | "yesterday" | "7d" | "30d" | "month";

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
}: {
  range: DateRange;
  onChange: (r: DateRange) => void;
}) {
  const activeKey = PRESETS.find((p) => rangesMatch(p.compute(), range))?.key ?? null;

  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1, alignItems: "center" }}>
      {PRESETS.map((p) => {
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
              bgcolor: isActive ? "#48C8AF" : "transparent",
              color: isActive ? "#fff" : "#2a6f64",
              border: isActive
                ? "1px solid #48C8AF"
                : "1px solid rgba(72,200,175,0.3)",
              transition: "all 160ms ease",
              "&:hover": {
                bgcolor: isActive ? "#3BA992" : "rgba(72,200,175,0.08)",
                borderColor: "#48C8AF",
              },
            }}
          />
        );
      })}
    </Stack>
  );
}
