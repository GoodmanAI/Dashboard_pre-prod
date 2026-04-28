"use client";

import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { startOfDay, endOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { Box } from "@mui/material";

export type DateRange = {
  from: Date;
  to: Date;
};

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

/**
 * Sélecteur de plage de dates stylé pour matcher la DA du dashboard :
 * accent teal `#48C8AF`, locale FR, typo cohérente, range capsule arrondie.
 *
 * On surcharge les variables CSS de react-day-picker via `sx` au lieu d'éditer
 * la feuille importée — ça permet de garder le composant isolé.
 */
export default function DateRangePicker({ value, onChange }: Props) {
  return (
    <Box
      sx={{
        // Variables natives react-day-picker v9 — recolorisation par CSS vars.
        "--rdp-accent-color": "#48C8AF",
        "--rdp-accent-background-color": "rgba(72,200,175,0.15)",
        "--rdp-day-height": "36px",
        "--rdp-day-width": "36px",
        "--rdp-day_button-height": "32px",
        "--rdp-day_button-width": "32px",
        "--rdp-day_button-border-radius": "8px",
        "--rdp-selected-border": "2px solid #48C8AF",
        "--rdp-range_start-color": "#ffffff",
        "--rdp-range_end-color": "#ffffff",
        "--rdp-range_start-background": "#48C8AF",
        "--rdp-range_end-background": "#48C8AF",
        "--rdp-range_middle-color": "#2a6f64",
        "--rdp-range_middle-background-color": "rgba(72,200,175,0.15)",
        "--rdp-today-color": "#48C8AF",
        "--rdp-weekday-text-transform": "uppercase",

        ".rdp-root": {
          fontFamily: "inherit",
        },

        ".rdp-months": {
          gap: 24,
        },

        ".rdp-month_caption": {
          padding: "8px 4px",
        },
        ".rdp-caption_label": {
          fontWeight: 700,
          color: "#1f2937",
          fontSize: "0.95rem",
          textTransform: "capitalize",
        },

        ".rdp-button_previous, .rdp-button_next": {
          color: "#2a6f64",
          borderRadius: "8px",
          width: 32,
          height: 32,
          transition: "background-color 160ms ease",
          "&:hover:not([disabled])": {
            backgroundColor: "rgba(72,200,175,0.1)",
          },
        },

        ".rdp-weekday": {
          fontWeight: 600,
          fontSize: "0.7rem",
          color: "#9ca3af",
          letterSpacing: 0.5,
        },

        ".rdp-day_button": {
          fontWeight: 500,
          fontSize: "0.85rem",
          color: "#1f2937",
          transition: "background-color 140ms ease, color 140ms ease",
          "&:hover:not([disabled])": {
            backgroundColor: "rgba(72,200,175,0.12)",
            color: "#2a6f64",
          },
        },

        // Aujourd'hui (sans sélection)
        ".rdp-today:not(.rdp-selected) .rdp-day_button": {
          fontWeight: 800,
          color: "#48C8AF",
          backgroundColor: "rgba(72,200,175,0.06)",
        },

        // Bornes du range : pleines teal blanches
        ".rdp-range_start .rdp-day_button, .rdp-range_end .rdp-day_button": {
          backgroundColor: "#48C8AF !important",
          color: "#ffffff !important",
          fontWeight: 700,
          "&:hover": {
            backgroundColor: "#3BA992 !important",
          },
        },

        // Cellules au milieu du range : fond teal léger
        ".rdp-range_middle .rdp-day_button": {
          backgroundColor: "rgba(72,200,175,0.15) !important",
          color: "#2a6f64 !important",
          fontWeight: 600,
          borderRadius: 0,
        },

        // Coins arrondis adoucis sur les bornes (vers l'intérieur du range)
        ".rdp-range_start .rdp-day_button": {
          borderTopRightRadius: "0 !important",
          borderBottomRightRadius: "0 !important",
        },
        ".rdp-range_end .rdp-day_button": {
          borderTopLeftRadius: "0 !important",
          borderBottomLeftRadius: "0 !important",
        },
      }}
    >
      <DayPicker
        mode="range"
        locale={fr}
        weekStartsOn={1}
        selected={value}
        onSelect={(range) => {
          if (range?.from && range?.to) {
            onChange({
              from: startOfDay(range.from),
              to: endOfDay(range.to),
            });
          }
        }}
        numberOfMonths={2}
        fixedWeeks
      />
    </Box>
  );
}
