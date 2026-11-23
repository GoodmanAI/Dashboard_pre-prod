"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Stack, Typography } from "@mui/material";
import type { Doublon } from "@/pilot/lib/prospection/doublons";
import { envoyer } from "./DialogueFormulaire";

/** Ce qui ressemble déjà à la saisie. Ouvre dans un nouvel onglet : la saisie en cours reste là. */
export function Doublons({ liste }: { liste: Doublon[] }) {
  if (!liste.length) return null;
  return <Alert severity="warning" icon={false} sx={{ "& .MuiAlert-message": { width: "100%" } }}>
    <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>Peut-être déjà dans Pilot</Typography>
    <Stack spacing={0.5}>
      {liste.map((d) => <Stack key={d.id} direction="row" spacing={1} alignItems="baseline" flexWrap="wrap" useFlexGap>
        <Link href={`/pilot/organisations/${d.id}`} target="_blank" rel="noopener" style={{ fontWeight: 500 }}>{d.nom}</Link>
        <Typography variant="caption" color="text.secondary">{[d.ville, d.etape].filter(Boolean).join(" · ")}</Typography>
      </Stack>)}
    </Stack>
  </Alert>;
}

/** Interroge Pilot 350 ms après la dernière frappe, à partir de trois lettres. */
export function useDoublons(nom: string, ville: string): Doublon[] {
  const [liste, setListe] = useState<Doublon[]>([]);
  useEffect(() => {
    if (nom.trim().length < 3) { setListe([]); return; }
    let annule = false;
    const minuterie = setTimeout(async () => {
      try {
        const r = await envoyer<{ doublons: Doublon[] }>("/api/pilot/prospects/doublons", "POST", undefined, { nom, ville: ville || undefined });
        if (!annule) setListe(r.doublons);
      } catch { if (!annule) setListe([]); }
    }, 350);
    return () => { annule = true; clearTimeout(minuterie); };
  }, [nom, ville]);
  return liste;
}
