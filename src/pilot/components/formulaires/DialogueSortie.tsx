"use client";

import { useState } from "react";
import { MenuItem, TextField } from "@mui/material";
import type { CrmRaisonSortie } from "@prisma/client";
import { LIBELLES_RAISONS, LIBELLES } from "@/pilot/lib/pipeline";
import { dansJours } from "@/pilot/lib/dates";
import type { OptionConcurrent } from "@/pilot/lib/concurrents/options";
import { DialogueFormulaire } from "./DialogueFormulaire";
import { SelecteurConcurrent } from "./SelecteurConcurrent";
import { CaseTerminerContrats } from "./CaseTerminerContrats";

/** `concurrentGagnantId` ne part qu'avec le motif « Concurrent » : null efface le concurrent déjà désigné. */
export type ValeursSortie = { raisonSortie: string; raisonSortieCode: CrmRaisonSortie; reveilLe: string | null; concurrentGagnantId?: number | null; terminerContrats?: boolean };
export function DialogueSortie({ vers, fermer, enregistrer, valeurs, concurrents, contratsActifs = 0 }: {
  vers: "PERDU" | "EN_SOMMEIL" | "POC_NON_TRANSFORME"; fermer: () => void; enregistrer: (valeurs: ValeursSortie) => Promise<void>;
  valeurs?: { raisonSortie: string | null; raisonSortieCode: CrmRaisonSortie | null; reveilLe: string | null; concurrentGagnantId?: number | null };
  /** La liste lue une fois par la page. Sans elle, le dialogue ne propose pas « Contre qui ? ». */
  concurrents?: OptionConcurrent[];
  /** Vers Perdu : les contrats actifs que ce compte peut terminer en même temps (C-86). */
  contratsActifs?: number;
}) {
  const defaut = new Date();
  defaut.setUTCMonth(defaut.getUTCMonth() + 3);
  const [motif, setMotif] = useState<string>(valeurs?.raisonSortieCode ?? "");
  const [gagnant, setGagnant] = useState<number | null>(valeurs?.concurrentGagnantId ?? null);
  const contreQui = vers === "PERDU" && motif === "CONCURRENT" && concurrents !== undefined;
  return <DialogueFormulaire titre={LIBELLES[vers]} fermer={fermer} soumettre={async (f) => enregistrer({
    raisonSortie: String(f.get("raisonSortie") ?? "").trim(),
    raisonSortieCode: String(f.get("raisonSortieCode")) as CrmRaisonSortie,
    reveilLe: vers === "EN_SOMMEIL" ? String(f.get("reveilLe")) : null,
    ...(contreQui ? { concurrentGagnantId: gagnant } : {}),
    ...(contratsActifs > 0 ? { terminerContrats: f.get("terminerContrats") === "on" } : {}),
  })}>
    <TextField select name="raisonSortieCode" label="Motif" autoFocus required value={motif} onChange={(e) => setMotif(e.target.value)}>
      {Object.entries(LIBELLES_RAISONS).map(([id, libelle]) => <MenuItem key={id} value={id}>{libelle}</MenuItem>)}
    </TextField>
    {contreQui && <SelecteurConcurrent concurrents={concurrents} valeur={gagnant} changer={setGagnant} libelle="Contre qui ?"
      aide="Facultatif. Choisissez le concurrent qui a gagné, ou saisissez un nom pour le créer." />}
    <TextField name="raisonSortie" label="Précision" required multiline minRows={2} defaultValue={valeurs?.raisonSortie ?? ""} />
    {vers === "EN_SOMMEIL" && <TextField name="reveilLe" label="Date de reprise" type="date" required
      defaultValue={(valeurs?.reveilLe ?? defaut.toISOString()).slice(0, 10)} InputLabelProps={{ shrink: true }}
      inputProps={{ min: dansJours(new Date(), 1).toISOString().slice(0, 10) }} />}
    {contratsActifs > 0 && <CaseTerminerContrats nombre={contratsActifs} />}
  </DialogueFormulaire>;
}
