"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, MenuItem, TextField } from "@mui/material";
import { designationDirecteur } from "@/pilot/lib/validation/attribution";
import { envoyer } from "./DialogueFormulaire";

/**
 * Le directeur général, choisi par le super-administrateur dans l'écran Équipe
 * (C-91). Toute alerte lui va d'office ; il la confie si besoin. Le choix
 * s'enregistre tout de suite, comme le département ; `majLe` est la version lue (C-26).
 */
export function SelecteurDirecteur({ membres, directeur, signaler }: {
  membres: { id: number; nom: string }[]; directeur: { userId: number; majLe: string } | null; signaler: (texte: string) => void;
}) {
  const router = useRouter();
  const [choix, setChoix] = useState<number | "">(directeur?.userId ?? "");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  async function changer(userId: number) {
    if (envoi || userId === directeur?.userId) return;
    setEnvoi(true); setErreur(null); setChoix(userId);
    try {
      await envoyer("/api/pilot/equipe/directeur-general", "PUT", designationDirecteur, { userId, majLe: directeur?.majLe ?? null });
      signaler(`Directeur général : ${membres.find((m) => m.id === userId)?.nom ?? "enregistré"}.`);
      router.refresh();
    } catch (e) {
      setChoix(directeur?.userId ?? "");
      setErreur(e instanceof Error ? e.message : "Le directeur général n'a pas été enregistré. Réessayez.");
      router.refresh();
    } finally { setEnvoi(false); }
  }
  return <Box sx={{ px: 2.75, py: 1.5 }}>
    <TextField select size="small" label="Directeur général" value={choix} disabled={envoi} error={erreur !== null}
      onChange={(e) => void changer(Number(e.target.value))} InputLabelProps={{ shrink: true }}
      SelectProps={{ displayEmpty: true, renderValue: (v) => v === "" ? <Box component="span" sx={{ color: "text.secondary" }}>Personne n&apos;est désigné</Box>
        : membres.find((m) => m.id === v)?.nom ?? "Compte retiré" }}
      helperText={erreur ?? (choix === ""
        ? "Sans directeur général, les alertes vont au super-administrateur."
        : "Toutes les alertes lui arrivent d'office. Il les confie à la bonne personne.")}
      FormHelperTextProps={{ role: erreur ? "alert" : undefined }}
      sx={{ minWidth: { xs: "100%", sm: 320 }, maxWidth: "100%" }}>
      {membres.map((m) => <MenuItem key={m.id} value={m.id}>{m.nom}</MenuItem>)}
    </TextField>
  </Box>;
}
