"use client";

import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Popover,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { PhoneCallback, PhoneDisabled, EditNote } from "@mui/icons-material";
import {
  LIBELLES_SUIVI,
  NOTE_SUIVI_MAX,
  STATUTS_SUIVI,
  type StatutSuivi,
  type SuiviCarte,
} from "@/lib/suiviCarte";

/* =============================================================================
   Statut de suivi d'une carte « Ordonnances manquantes » ou « Questionnaires »
   (tache Vega 35f049, 28/10/2026). Deux pieces :
     - SuiviAffiche : ce que voient toutes les secretaires (statut, qui, quand,
       note), dans le corps de la carte ;
     - BoutonSuivi : le geste, a cote de « Marquer traité ».
   La mise a jour chez les autres passe par le socket de l'ecran.
============================================================================= */

const COULEURS: Record<StatutSuivi, { fond: string; texte: string }> = {
  contacte: { fond: "rgba(37,99,235,0.12)", texte: "#1d4ed8" },
  injoignable: { fond: "rgba(100,116,139,0.16)", texte: "#475569" },
};

const ICONES: Record<StatutSuivi, JSX.Element> = {
  contacte: <PhoneCallback sx={{ fontSize: 16 }} />,
  injoignable: <PhoneDisabled sx={{ fontSize: 16 }} />,
};

/** « à 10:12 » aujourd'hui, « le 27/10 à 10:12 » avant. */
function quand(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const auj = new Date();
  if (d.toDateString() === auj.toDateString()) return `à ${heure}`;
  const jour = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  return `le ${jour} à ${heure}`;
}

export function SuiviAffiche({ suivi }: { suivi: SuiviCarte | null | undefined }) {
  if (!suivi) return null;
  const couleur = COULEURS[suivi.statut];
  return (
    <Box
      sx={{
        mt: 1,
        mb: 1,
        p: 1,
        borderRadius: 1,
        bgcolor: couleur.fond,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
        <Chip
          size="small"
          icon={ICONES[suivi.statut]}
          label={LIBELLES_SUIVI[suivi.statut]}
          sx={{
            bgcolor: "#FFF",
            color: couleur.texte,
            fontWeight: 700,
            "& .MuiChip-icon": { color: couleur.texte },
          }}
        />
        <Typography variant="caption" sx={{ color: couleur.texte, fontWeight: 600 }}>
          {suivi.parNom ? `par ${suivi.parNom} ` : ""}
          {quand(suivi.majAt)}
        </Typography>
      </Stack>
      {suivi.note && (
        <Typography
          variant="body2"
          sx={{ mt: 0.75, color: "#1F3448", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
        >
          {suivi.note}
        </Typography>
      )}
    </Box>
  );
}

export function BoutonSuivi({
  suivi,
  enCours,
  onEnregistrer,
}: {
  suivi: SuiviCarte | null | undefined;
  enCours: boolean;
  /** `statut: null` retire le suivi. Rend `true` si l'enregistrement a reussi. */
  onEnregistrer: (statut: StatutSuivi | null, note: string) => Promise<boolean>;
}) {
  const [ancre, setAncre] = useState<HTMLElement | null>(null);
  const [statut, setStatut] = useState<StatutSuivi | null>(null);
  const [note, setNote] = useState("");

  const ouvrir = (e: React.MouseEvent<HTMLElement>) => {
    // On repart de ce qui est en base au moment du clic : une collegue a pu
    // changer le suivi depuis l'affichage de la carte.
    setStatut(suivi?.statut ?? STATUTS_SUIVI[0]);
    setNote(suivi?.note ?? "");
    setAncre(e.currentTarget);
  };

  const enregistrer = async (s: StatutSuivi | null) => {
    const ok = await onEnregistrer(s, s ? note : "");
    if (ok) setAncre(null);
  };

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<EditNote />}
        onClick={ouvrir}
        disabled={enCours}
        sx={{
          minWidth: 180,
          color: "var(--accent-deep)",
          borderColor: "var(--accent)",
          "&:hover": { borderColor: "var(--accent-press)" },
        }}
      >
        {suivi ? "Modifier le suivi" : "Indiquer un suivi"}
      </Button>
      <Popover
        open={Boolean(ancre)}
        anchorEl={ancre}
        onClose={() => !enCours && setAncre(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { p: 2, width: 340, maxWidth: "calc(100vw - 32px)" } } }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          Où en est ce patient ?
        </Typography>
        <ToggleButtonGroup
          exclusive
          orientation="vertical"
          fullWidth
          size="small"
          value={statut}
          onChange={(_, v: StatutSuivi | null) => v && setStatut(v)}
          sx={{ mb: 1.5 }}
        >
          {STATUTS_SUIVI.map((s) => (
            <ToggleButton
              key={s}
              value={s}
              sx={{ justifyContent: "flex-start", gap: 1, textTransform: "none" }}
            >
              {ICONES[s]}
              {LIBELLES_SUIVI[s]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TextField
          label="Note (facultatif)"
          placeholder="Par exemple : rappeler après 14 h"
          size="small"
          fullWidth
          multiline
          minRows={2}
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, NOTE_SUIVI_MAX))}
          helperText={`${note.length} / ${NOTE_SUIVI_MAX}`}
          FormHelperTextProps={{ sx: { textAlign: "right", mr: 0 } }}
        />
        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1.5 }}>
          {suivi && (
            <Button
              color="inherit"
              disabled={enCours}
              onClick={() => enregistrer(null)}
              sx={{ mr: "auto" }}
            >
              Retirer le suivi
            </Button>
          )}
          <Button
            variant="contained"
            disabled={enCours || !statut}
            onClick={() => enregistrer(statut)}
            sx={{ bgcolor: "var(--accent)", "&:hover": { bgcolor: "var(--accent-press)" } }}
          >
            {enCours ? <CircularProgress size={20} sx={{ color: "#FFF" }} /> : "Enregistrer"}
          </Button>
        </Stack>
      </Popover>
    </>
  );
}
