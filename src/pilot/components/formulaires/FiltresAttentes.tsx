"use client";
import { Button, Checkbox, FormControlLabel, Stack, TextField } from "@mui/material";
import type { ReactNode } from "react";
import type { FiltresIntegration } from "@/pilot/lib/checklist/chargerIntegrations";
import { LIBELLES_TIERS, ORDRE_TIERS } from "@/pilot/lib/checklist/reglesAttentes";
import { JETONS } from "@/pilot/jetons";

/** Le libellé tient dans la valeur vide : « Produit : tous ». Le lecteur d'écran garde le nom du champ. */
export function Filtre({ nom, libelle, valeur, tous, children }: { nom: string; libelle: string; valeur?: string; tous: string; children: ReactNode }) {
  return <TextField select hiddenLabel SelectProps={{ native: true }} name={nom} defaultValue={valeur ?? ""} inputProps={{ "aria-label": libelle }}>
    <option value="">{libelle} : {tous}</option>{children}
  </TextField>;
}

export function FiltresAttentes({ filtres, chefs, produits, vagues }: { filtres: FiltresIntegration;
  vagues?: { id: number; libelle: string }[];
  chefs?: { id: number; name: string | null }[]; produits?: { id: number; name: string }[] }) {
  return <Stack component="form" method="get" direction="row" flexWrap="wrap" useFlexGap gap={1} alignItems="center">
    {filtres.organisationId && <input type="hidden" name="organisationId" value={filtres.organisationId} />}
    {chefs && <Filtre nom="chefDeProjetId" libelle="Chef de projet" valeur={filtres.chefDeProjetId} tous="tous">
      {chefs.map((c) => <option key={c.id} value={c.id}>{c.name ?? "Compte interne"}</option>)}
    </Filtre>}
    {!!vagues?.length && <Filtre nom="vagueId" libelle="Vague" valeur={filtres.vagueId} tous="toutes">
      {vagues.map((v) => <option key={v.id} value={v.id}>{v.libelle}</option>)}
    </Filtre>}
    {produits && <Filtre nom="productId" libelle="Produit" valeur={filtres.productId} tous="tous">
      {produits.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </Filtre>}
    <Filtre nom="tiers" libelle="Tiers" valeur={filtres.tiers} tous="tous">
      {ORDRE_TIERS.map((t) => <option key={t} value={t}>{LIBELLES_TIERS[t]}</option>)}
    </Filtre>
    <FormControlLabel control={<Checkbox name="aMoi" value="1" defaultChecked={filtres.aMoi === "1"} />} label="À moi"
      sx={{ whiteSpace: "nowrap", m: 0, pr: 1.25, height: 32, border: 1, borderColor: JETONS.filetChamp, borderRadius: "8px", bgcolor: "background.paper", "& .MuiFormControlLabel-label": { fontSize: 13, fontWeight: 500 } }} />
    <Button type="submit" variant="outlined">Filtrer</Button>
  </Stack>;
}
