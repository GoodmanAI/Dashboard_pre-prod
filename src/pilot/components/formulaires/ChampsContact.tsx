"use client";

import { Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import type { CrmContact } from "@prisma/client";
import { texte } from "./ChampsOrganisation";
import { LIBELLES_ATTITUDE } from "@/pilot/lib/pipeline";
import { METIERS_CONTACT } from "@/pilot/lib/organisations/referentielClient";

export const ROLES_CONTACT = { DECIDEUR: "Décideur", PRESCRIPTEUR: "Prescripteur", UTILISATEUR: "Utilisateur", TECHNIQUE: "Technique", INCONNU: "Rôle à préciser" };
export type ContactEditable = Pick<CrmContact, "id" | "nom" | "metier" | "fonction" | "email" | "telephone" | "roleDecision" | "principal" | "facturation" | "notes" | "attitude"> & { dernierContactLe: string | null };

export function ChampsContact({ contact, prefixe = "", facultatif = false, principal = false, metiers = [...METIERS_CONTACT] }: {
  contact?: ContactEditable; prefixe?: string; facultatif?: boolean; principal?: boolean;
  /** Les métiers proposés (C-88) : la liste du code, puis ceux déjà saisis. La saisie reste libre. */
  metiers?: readonly string[];
}) {
  const liste = `liste-metiers${prefixe.replace(/[^a-z0-9]/gi, "-")}`;
  return <>
    <TextField name={prefixe + "nom"} label="Nom du contact" defaultValue={contact?.nom ?? ""} autoFocus={!facultatif} required={!facultatif} fullWidth inputProps={{ maxLength: 200 }} />
    <TextField name={prefixe + "metier"} label="Métier" defaultValue={contact?.metier ?? ""} fullWidth
      inputProps={{ maxLength: 100, list: liste, autoComplete: "off" }} helperText="Choisissez dans la liste ou écrivez le vôtre." />
    <datalist id={liste}>{metiers.map((m) => <option key={m} value={m} />)}</datalist>
    <TextField name={prefixe + "fonction"} label="Fonction" defaultValue={contact?.fonction ?? ""} fullWidth inputProps={{ maxLength: 200 }} />
    <TextField name={prefixe + "roleDecision"} label="Rôle dans la décision" select defaultValue={contact?.roleDecision ?? "INCONNU"} fullWidth>
      {Object.entries(ROLES_CONTACT).map(([id, nom]) => <MenuItem key={id} value={id}>{nom}</MenuItem>)}
    </TextField>
    <TextField name={prefixe + "email"} label="Email" type="email" defaultValue={contact?.email ?? ""} fullWidth />
    <TextField name={prefixe + "attitude"} label="Attitude" select defaultValue={contact?.attitude ?? "INCONNU"} fullWidth>
      {Object.entries(LIBELLES_ATTITUDE).map(([id, libelle]) => <MenuItem key={id} value={id}>{libelle}</MenuItem>)}
    </TextField>
    <TextField name={prefixe + "telephone"} label="Téléphone" type="tel" defaultValue={contact?.telephone ?? ""} fullWidth inputProps={{ maxLength: 200 }} />
    {!facultatif && <>
      <FormControlLabel control={<Checkbox name="principal" defaultChecked={contact?.principal ?? principal} />} label="Contact principal" />
      <FormControlLabel control={<Checkbox name="facturation" defaultChecked={contact?.facturation ?? false} />} label="Reçoit les factures" />
      <TextField name="notes" label="Notes" defaultValue={contact?.notes ?? ""} multiline minRows={3} fullWidth inputProps={{ maxLength: 2000 }} />
    </>}
  </>;
}

export function valeursContact(f: FormData, prefixe = "") {
  return {
    nom: texte(f, prefixe + "nom"), metier: texte(f, prefixe + "metier"), fonction: texte(f, prefixe + "fonction"),
    attitude: texte(f, prefixe + "attitude"),
    roleDecision: texte(f, prefixe + "roleDecision"), email: texte(f, prefixe + "email"), telephone: texte(f, prefixe + "telephone"),
    ...(prefixe ? {} : { principal: f.has("principal"), facturation: f.has("facturation"), notes: texte(f, "notes") }),
  };
}
