"use client";

import { Checkbox, FormControlLabel, FormGroup, FormLabel, MenuItem, Stack, TextField, Typography } from "@mui/material";
import type { CrmOrganisation } from "@prisma/client";
import { BLOCAGES_TECHNIQUES, CLES_BLOCAGE, EQUIPEMENTS, ORIGINES } from "@/pilot/lib/organisations/referentielClient";
import { SUGGESTIONS_DU_CODE, type SuggestionsSaisie } from "@/pilot/lib/organisations/suggestions";
import { BoutonAnnuaire } from "./RechercheAnnuaire";
import { ORDRE_PRIORITES, PRIORITES } from "@/pilot/lib/prospection/regles";

export { TYPES_ORGANISATION } from "@/pilot/lib/organisations/referentielClient";
import { TYPES_ORGANISATION } from "@/pilot/lib/organisations/referentielClient";
export type CompteInterne = { id: number; name: string | null };
export type CompteClient = CompteInterne & { email: string };
export type IdentiteOrganisation = Pick<CrmOrganisation, "raisonSocialeNom" | "type" | "ris" | "nombreSites" | "nombreSalles" | "volumeAppelsEstime" | "responsableId" | "chefDeProjetId" | "utilisateurId"
  | "risVersion" | "outilRdv" | "nombreSecretaires" | "nombreIrm" | "nombreScanners" | "nombreRadio" | "nombreEcho" | "nombreMammo" | "blocagesTechniques" | "origine" | "rattachementGht"
  | "priorite" | "telephone" | "email" | "siteWeb">;
/** L'identité légale (C-89), facultative pour les appelants qui ne la connaissent pas. */
export type IdentiteLegale = Partial<Pick<CrmOrganisation, "siren" | "denominationLegale" | "siretSiege" | "siegeAdresse" | "siegeCodePostal" | "siegeVille" | "codeNaf" | "formeJuridique">>;

const NOMBRE = { min: 0, step: 1, max: 2147483647 };

function Section({ titre }: { titre: string }) {
  return <Typography component="h3" sx={{ fontSize: 13, fontWeight: 600, color: "text.secondary", pt: 1 }}>{titre}</Typography>;
}

export function ChampsOrganisation({ organisation, comptes, clients, courantId, court = false, suggestions = SUGGESTIONS_DU_CODE, annuaire = false }: {
  /** Offrir « Chercher dans l'annuaire » sous le nom (création, C-89). */
  annuaire?: boolean;
  organisation?: Partial<IdentiteOrganisation> & IdentiteLegale; comptes: CompteInterne[]; clients?: CompteClient[]; courantId?: number; court?: boolean;
  /** Liste du code et valeurs déjà saisies, lues au rendu de la page. */
  suggestions?: SuggestionsSaisie;
}) {
  const nombre = (nom: keyof IdentiteOrganisation, libelle: string) =>
    <TextField key={nom} name={nom} label={libelle} type="number" fullWidth defaultValue={organisation?.[nom] ?? ""} inputProps={NOMBRE} />;
  return <>
    <TextField name="raisonSocialeNom" label="Nom du client" defaultValue={organisation?.raisonSocialeNom ?? ""} autoFocus required fullWidth inputProps={{ maxLength: 200 }} />
    {annuaire && <BoutonAnnuaire />}
    <TextField name="type" label="Type" select defaultValue={organisation?.type ?? "CABINET"} required fullWidth>
      {Object.entries(TYPES_ORGANISATION).map(([id, nom]) => <MenuItem key={id} value={id}>{nom}</MenuItem>)}
    </TextField>
    {!court && <>
      <Section titre="Coordonnées" />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField name="telephone" label="Standard" type="tel" defaultValue={organisation?.telephone ?? ""} fullWidth inputProps={{ maxLength: 40 }} />
        <TextField name="siteWeb" label="Site web" defaultValue={organisation?.siteWeb ?? ""} fullWidth inputProps={{ maxLength: 300 }} placeholder="www.exemple.fr" />
      </Stack>
      <TextField name="email" label="Email du standard" type="email" defaultValue={organisation?.email ?? ""} fullWidth />

      <Section titre="Identité légale" />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField name="siren" label="SIREN" defaultValue={organisation?.siren ?? ""} fullWidth inputProps={{ maxLength: 11, inputMode: "numeric" }} />
        <TextField name="siretSiege" label="SIRET du siège" defaultValue={organisation?.siretSiege ?? ""} fullWidth inputProps={{ maxLength: 17, inputMode: "numeric" }} />
      </Stack>
      <TextField name="denominationLegale" label="Dénomination légale" defaultValue={organisation?.denominationLegale ?? ""} fullWidth inputProps={{ maxLength: 300 }}
        helperText="Celle des factures et des contrats. Le nom du client, plus haut, est celui que l'équipe utilise." />
      <TextField name="siegeAdresse" label="Adresse du siège" defaultValue={organisation?.siegeAdresse ?? ""} fullWidth inputProps={{ maxLength: 300 }} />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField name="siegeCodePostal" label="Code postal du siège" defaultValue={organisation?.siegeCodePostal ?? ""} sx={{ flex: "0 0 180px" }} inputProps={{ maxLength: 10, inputMode: "numeric" }} />
        <TextField name="siegeVille" label="Ville du siège" defaultValue={organisation?.siegeVille ?? ""} fullWidth inputProps={{ maxLength: 200 }} />
      </Stack>
      <input type="hidden" name="codeNaf" defaultValue={organisation?.codeNaf ?? ""} />
      <input type="hidden" name="formeJuridique" defaultValue={organisation?.formeJuridique ?? ""} />
      <input type="hidden" name="annuaireLuLe" defaultValue="" />

      <Section titre="RIS et prise de rendez-vous" />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField name="ris" label="RIS" defaultValue={organisation?.ris ?? ""} fullWidth inputProps={{ maxLength: 200, list: "liste-ris" }} helperText="Choisissez dans la liste ou saisissez-le." />
        <TextField name="risVersion" label="Version du RIS" defaultValue={organisation?.risVersion ?? ""} fullWidth inputProps={{ maxLength: 50 }} helperText="Par exemple 7.2 ou 8.2." />
      </Stack>
      <datalist id="liste-ris">{suggestions.ris.map((e) => <option key={e} value={e} />)}</datalist>
      <TextField name="outilRdv" label="Prise de RDV aujourd'hui" defaultValue={organisation?.outilRdv ?? ""} fullWidth inputProps={{ maxLength: 100, list: "liste-outils-rdv" }}
        helperText="Ce que le centre utilise avant Lyrae. Choisissez dans la liste ou saisissez-le." />
      <datalist id="liste-outils-rdv">{suggestions.outilRdv.map((e) => <option key={e} value={e} />)}</datalist>

      <Section titre="Taille" />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        {nombre("nombreSites", "Sites")}{nombre("nombreSalles", "Salles")}
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        {nombre("volumeAppelsEstime", "Appels estimés par jour")}{nombre("nombreSecretaires", "Secrétaires")}
      </Stack>

      <Section titre="Équipements" />
      <Stack direction="row" flexWrap="wrap" useFlexGap gap={2} sx={{ "& > *": { flex: "1 1 120px" } }}>
        {EQUIPEMENTS.map(([champ, libelle]) => nombre(champ, libelle))}
      </Stack>

      <Section titre="Contexte" />
      <TextField name="priorite" label="Priorité commerciale" select fullWidth defaultValue={organisation?.priorite ?? ""}
        helperText="A+ en premier dans la liste À prospecter.">
        <MenuItem value="">Sans priorité</MenuItem>
        {ORDRE_PRIORITES.map((p) => <MenuItem key={p} value={p}>{PRIORITES[p]}</MenuItem>)}
      </TextField>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField name="origine" label="Origine du contact" select fullWidth defaultValue={organisation?.origine ?? ""}>
          <MenuItem value="">Non renseignée</MenuItem>
          {Object.entries(ORIGINES).map(([cle, nom]) => <MenuItem key={cle} value={cle}>{nom}</MenuItem>)}
        </TextField>
        <TextField name="rattachementGht" label="GHT ou groupe de rattachement" defaultValue={organisation?.rattachementGht ?? ""} fullWidth inputProps={{ maxLength: 120 }} />
      </Stack>
      <FormGroup>
        <FormLabel component="legend" sx={{ fontSize: 13, fontWeight: 600, color: "text.secondary", mb: 0.5 }}>Ce qui bloque le déploiement</FormLabel>
        {CLES_BLOCAGE.map((cle) => <FormControlLabel key={cle} label={BLOCAGES_TECHNIQUES[cle]} sx={{ m: 0 }}
          control={<Checkbox name="blocagesTechniques" value={cle} defaultChecked={organisation?.blocagesTechniques?.includes(cle) ?? false} />} />)}
      </FormGroup>
    </>}
    <Section titre="Équipe Lyrae" />
    <TextField name="responsableId" label="Commercial" select required fullWidth defaultValue={organisation?.responsableId ?? courantId ?? ""}>
      <MenuItem value="">Choisir un commercial</MenuItem>
      {comptes.map((c) => <MenuItem key={c.id} value={c.id}>{c.name ?? "Compte interne sans nom"}</MenuItem>)}
    </TextField>
    {!court && <TextField name="chefDeProjetId" label="Chef de projet" select fullWidth defaultValue={organisation?.chefDeProjetId ?? ""}>
      <MenuItem value="">Non attribué</MenuItem>
      {comptes.map((c) => <MenuItem key={c.id} value={c.id}>{c.name ?? "Compte interne sans nom"}</MenuItem>)}
    </TextField>}
    {clients && <TextField name="utilisateurId" label="Compte client sur le Dashboard" select fullWidth defaultValue={organisation?.utilisateurId ?? ""}>
      <MenuItem value="">Pas encore de compte sur le Dashboard</MenuItem>
      {clients.map((c) => <MenuItem key={c.id} value={c.id}>{c.email}</MenuItem>)}
    </TextField>}
  </>;
}

export const texte = (f: FormData, cle: string) => String(f.get(cle) ?? "");
export const nombreFacultatif = (f: FormData, cle: string) => texte(f, cle) === "" ? null : Number(f.get(cle));
export function valeursOrganisation(f: FormData) {
  return {
    raisonSocialeNom: texte(f, "raisonSocialeNom"), type: texte(f, "type"), responsableId: Number(f.get("responsableId")),
    ...(f.has("ris") ? {
      ris: texte(f, "ris"), risVersion: texte(f, "risVersion"), outilRdv: texte(f, "outilRdv"),
      nombreSites: nombreFacultatif(f, "nombreSites"), nombreSalles: nombreFacultatif(f, "nombreSalles"),
      volumeAppelsEstime: nombreFacultatif(f, "volumeAppelsEstime"), nombreSecretaires: nombreFacultatif(f, "nombreSecretaires"),
      ...Object.fromEntries(EQUIPEMENTS.map(([champ]) => [champ, nombreFacultatif(f, champ)])),
      blocagesTechniques: f.getAll("blocagesTechniques").map(String), origine: texte(f, "origine") || null, rattachementGht: texte(f, "rattachementGht"),
      priorite: texte(f, "priorite") || null, telephone: texte(f, "telephone"), email: texte(f, "email"), siteWeb: texte(f, "siteWeb"),
      chefDeProjetId: nombreFacultatif(f, "chefDeProjetId"),
    } : {}),
    // L'identité légale (C-89) : saisie, ou reprise de l'annuaire. « annuaireLuLe » ne part que si l'annuaire vient de remplir.
    ...(f.has("siren") ? {
      siren: texte(f, "siren"), siretSiege: texte(f, "siretSiege"), denominationLegale: texte(f, "denominationLegale"),
      siegeAdresse: texte(f, "siegeAdresse"), siegeCodePostal: texte(f, "siegeCodePostal"), siegeVille: texte(f, "siegeVille"),
      codeNaf: texte(f, "codeNaf"), formeJuridique: texte(f, "formeJuridique"), ...(texte(f, "annuaireLuLe") ? { annuaireLuLe: texte(f, "annuaireLuLe") } : {}),
    } : {}),
    ...(f.has("utilisateurId") ? { utilisateurId: nombreFacultatif(f, "utilisateurId") } : {}),
  };
}
