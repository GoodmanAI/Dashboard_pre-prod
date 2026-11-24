"use client";
import { useState, type FormEvent } from "react";
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, TextField, Typography } from "@mui/material";
import { envoyer } from "./DialogueFormulaire";
import { estSante, formeJuridique, libelleActivite, type Entreprise, type Etablissement } from "@/pilot/lib/annuaire/regles";

type Detail = { entreprise: Entreprise; rapprochements: Record<string, number>; dejaSaisis: { siret: string; nom: string }[]; centres?: { id: number; nom: string }[] };
const siren = (s: string) => s.replace(/(\d{3})(?=\d)/g, "$1 ");
const lieu = (e: Pick<Etablissement, "adresse" | "codePostal" | "ville">) => [e.adresse, [e.codePostal, e.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ");

/**
 * La recherche dans l'annuaire des entreprises (C-89). Le serveur interroge le
 * service public : un clic, sans copier-coller. Deux usages :
 * - sur une fiche (`organisationId`) : l'identité légale, les centres à créer
 *   ou à compléter de leur SIRET, les dirigeants, appliqués en une fois ;
 * - dans un formulaire de création (`choisir`) : l'entreprise et le site
 *   choisis remplissent les champs, rien n'est enregistré avant « Créer ».
 */
export function RechercheAnnuaire({ organisationId, nomInitial = "", choisir, fermer, termine }: {
  organisationId?: number; nomInitial?: string;
  choisir?: (entreprise: Entreprise, site: Etablissement | null) => void;
  fermer: () => void; termine?: (message: string) => void;
}) {
  const [q, setQ] = useState(nomInitial);
  const [attente, setAttente] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultats, setResultats] = useState<{ entreprises: Entreprise[]; note: string | null } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [creer, setCreer] = useState<Set<string>>(new Set());
  const [completer, setCompleter] = useState<Set<string>>(new Set());
  const [reprendreNom, setReprendreNom] = useState(false);
  const [dirigeants, setDirigeants] = useState(true);

  async function chercher(e?: FormEvent) {
    e?.preventDefault();
    setErreur(null); setDetail(null); setAttente("Recherche dans l'annuaire des entreprises…");
    try { setResultats(await envoyer("/api/pilot/annuaire", "POST", undefined, { q })); }
    catch (err) { setErreur((err as Error).message); setResultats(null); }
    finally { setAttente(null); }
  }

  async function ouvrir(e: Entreprise) {
    setErreur(null); setAttente(`Lecture des établissements de ${e.nom}…`);
    try {
      const d = await envoyer<Detail>("/api/pilot/annuaire/entreprise", "POST", undefined, { siren: e.siren, ...(organisationId ? { organisationId } : {}) });
      const pris = new Set(d.dejaSaisis.map((x) => x.siret));
      // Proposés d'office : les établissements de santé ni déjà saisis ni rapprochés d'un centre existant.
      setCreer(new Set(d.entreprise.etablissements.filter((x) => estSante(x.activite) && !pris.has(x.siret) && !d.rapprochements[x.siret]).map((x) => x.siret)));
      setCompleter(new Set(Object.keys(d.rapprochements)));
      setDetail(d);
    } catch (err) { setErreur((err as Error).message); }
    finally { setAttente(null); }
  }

  async function appliquer() {
    if (!detail || !organisationId) return;
    setErreur(null); setAttente("Enregistrement…");
    try {
      const { message } = await envoyer<{ message: string }>(`/api/pilot/organisations/${organisationId}/annuaire`, "POST", undefined, {
        siren: detail.entreprise.siren, reprendreNom, dirigeants,
        creer: [...creer], completer: [...completer].map((s) => ({ siret: s, centreId: detail.rapprochements[s] })),
      });
      termine?.(message);
    } catch (err) { setErreur((err as Error).message); setAttente(null); }
  }

  const basculer = (ensemble: Set<string>, changer: (s: Set<string>) => void, siret: string) => {
    const suivant = new Set(ensemble);
    if (suivant.has(siret)) suivant.delete(siret); else suivant.add(siret);
    changer(suivant);
  };
  const e = detail?.entreprise;
  const nomCentre = (id: number) => detail?.centres?.find((c) => c.id === id)?.nom ?? "un centre saisi";

  return <Dialog open onClose={fermer} fullWidth maxWidth="md" aria-labelledby="titre-annuaire">
    <DialogTitle id="titre-annuaire">{e ? e.nom : "Rechercher dans l'annuaire des entreprises"}</DialogTitle>
    <DialogContent>
      <Stack spacing={2} sx={{ pt: 0.5 }}>
        {!e && <Box component="form" onSubmit={chercher} sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <TextField autoFocus label="Nom, SIREN ou SIRET" value={q} onChange={(ev) => setQ(ev.target.value)} sx={{ flex: "1 1 260px" }} inputProps={{ maxLength: 200 }} />
          <Button type="submit" variant="contained" disabled={q.trim().length < 2 || !!attente}>Rechercher</Button>
        </Box>}
        {attente && <Stack direction="row" spacing={1.5} alignItems="center"><CircularProgress size={18} /><Typography color="text.secondary">{attente}</Typography></Stack>}
        {erreur && <Alert severity="error">{erreur}</Alert>}

        {!e && resultats && <>
          {resultats.note && <Alert severity="info">{resultats.note}</Alert>}
          {!resultats.entreprises.length && <Typography color="text.secondary">Aucune entreprise ne correspond. Vérifiez l&apos;orthographe, essayez un mot plus court ou le SIREN.</Typography>}
          {resultats.entreprises.map((x) => <Box key={x.siren} sx={{ borderTop: 1, borderColor: "divider", pt: 1.5, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
            <Box sx={{ flex: "1 1 300px", minWidth: 0 }}>
              <Typography fontWeight={600}>{x.nom}</Typography>
              <Typography variant="body2" color="text.secondary">
                {[`SIREN ${siren(x.siren)}`, formeJuridique(x.formeJuridique), x.siege ? [x.siege.codePostal, x.siege.ville].filter(Boolean).join(" ") : null,
                  libelleActivite(x.activite), `${x.etablissementsOuverts} établissement${x.etablissementsOuverts > 1 ? "s" : ""} ouvert${x.etablissementsOuverts > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
              </Typography>
            </Box>
            <Button variant="outlined" disabled={!!attente} onClick={() => ouvrir(x)}>Choisir</Button>
          </Box>)}
        </>}

        {e && <>
          <Typography variant="body2" color="text.secondary">
            {[`SIREN ${siren(e.siren)}`, formeJuridique(e.formeJuridique), libelleActivite(e.activite), e.siege ? `Siège : ${lieu(e.siege)}` : null].filter(Boolean).join(" · ")}
          </Typography>

          {choisir ? <>
            <Typography sx={{ fontWeight: 600 }}>Quel site enregistrer ?</Typography>
            {e.etablissements.map((x) => <Box key={x.siret} sx={{ borderTop: 1, borderColor: "divider", pt: 1.25, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
              <Box sx={{ flex: "1 1 300px", minWidth: 0 }}>
                <Typography>{x.nom ?? x.ville ?? "Établissement"}{x.estSiege && <Chip size="small" label="Siège" sx={{ ml: 1 }} />}</Typography>
                <Typography variant="body2" color="text.secondary">{[lieu(x), libelleActivite(x.activite)].filter(Boolean).join(" · ")}</Typography>
              </Box>
              <Button variant="outlined" onClick={() => { choisir(e, x); fermer(); }}>Ce site</Button>
            </Box>)}
            {!e.etablissements.length && <Typography color="text.secondary">L&apos;annuaire ne liste aucun établissement ouvert. Seule l&apos;identité sera reprise.</Typography>}
          </> : <>
            <FormControlLabel control={<Checkbox checked={reprendreNom} onChange={(ev) => setReprendreNom(ev.target.checked)} />}
              label={`Remplacer le nom affiché par « ${e.nom} »`} />
            <Typography sx={{ fontWeight: 600 }}>Établissements</Typography>
            <Typography variant="body2" color="text.secondary">Les établissements de santé sont cochés d&apos;office. Un centre déjà saisi à la même adresse est complété de son SIRET plutôt que recréé.</Typography>
            {e.etablissements.map((x) => {
              const deja = detail?.dejaSaisis.find((d) => d.siret === x.siret);
              const rapproche = detail?.rapprochements[x.siret];
              return <Box key={x.siret} sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}>
                <Typography>{x.nom ?? x.ville ?? "Établissement"}{x.estSiege && <Chip size="small" label="Siège" sx={{ ml: 1 }} />}</Typography>
                <Typography variant="body2" color="text.secondary">{[lieu(x), libelleActivite(x.activite), x.finess ? `FINESS ${x.finess}` : null].filter(Boolean).join(" · ")}</Typography>
                {deja ? <Typography variant="body2" color="text.secondary">Déjà enregistré : {deja.nom}.</Typography>
                  : rapproche ? <FormControlLabel control={<Checkbox checked={completer.has(x.siret)} onChange={() => basculer(completer, setCompleter, x.siret)} />}
                    label={`Compléter ${nomCentre(rapproche)} de ce SIRET`} />
                  : <FormControlLabel control={<Checkbox checked={creer.has(x.siret)} onChange={() => basculer(creer, setCreer, x.siret)} />} label="Créer ce centre" />}
              </Box>;
            })}
            {!e.etablissements.length && <Typography color="text.secondary">L&apos;annuaire ne liste aucun établissement ouvert.</Typography>}
            {e.dirigeants.length > 0 && <FormControlLabel control={<Checkbox checked={dirigeants} onChange={(ev) => setDirigeants(ev.target.checked)} />}
              label={`Ajouter les dirigeants absents des contacts : ${e.dirigeants.map((d) => d.nom).join(", ")}`} />}
          </>}
        </>}
        <Typography variant="caption" color="text.secondary">Source : annuaire officiel des entreprises (INSEE Sirene et Registre national des entreprises), les mêmes données que Pappers.</Typography>
      </Stack>
    </DialogContent>
    <DialogActions>
      {e && <Button onClick={() => setDetail(null)} disabled={!!attente}>Autre entreprise</Button>}
      <Button onClick={fermer}>Annuler</Button>
      {e && choisir && <Button variant="contained" onClick={() => { choisir(e, null); fermer(); }}>Identité seule</Button>}
      {e && !choisir && <Button variant="contained" onClick={appliquer} disabled={!!attente}>Enregistrer</Button>}
    </DialogActions>
  </Dialog>;
}

/** Les champs qu'une entreprise choisie remplit dans un formulaire de création (C-89). Noms des champs du formulaire. */
export const CHAMPS_LEGAUX = ["siren", "denominationLegale", "siretSiege", "siegeAdresse", "siegeCodePostal", "siegeVille", "codeNaf", "formeJuridique", "annuaireLuLe"] as const;

export function valeursAnnuaire(e: Entreprise, site: Etablissement | null): Record<string, string> {
  const s = site ?? e.siege;
  return {
    raisonSocialeNom: e.nom.slice(0, 200), siren: e.siren, denominationLegale: e.denomination, siretSiege: e.siege?.siret ?? "",
    siegeAdresse: e.siege?.adresse ?? "", siegeCodePostal: e.siege?.codePostal ?? "", siegeVille: e.siege?.ville ?? "",
    codeNaf: e.activite ?? "", formeJuridique: formeJuridique(e.formeJuridique) ?? "", annuaireLuLe: new Date().toISOString(),
    ...(s ? { adresse: s.adresse ?? "", codePostal: s.codePostal ?? "", ville: s.ville ?? "", siteSiret: s.siret, siteFiness: s.finess ?? "" } : {}),
  };
}

/** Écrit les valeurs dans les champs du formulaire, par leur nom, comme si on les avait saisies. */
function remplir(formulaire: HTMLFormElement, valeurs: Record<string, string>) {
  for (const [nom, valeur] of Object.entries(valeurs)) {
    const champ = formulaire.elements.namedItem(nom);
    if (!(champ instanceof HTMLInputElement || champ instanceof HTMLTextAreaElement)) continue;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(champ), "value")?.set;
    setter?.call(champ, valeur);
    champ.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

/** Les valeurs légales lues dans un formulaire de création : ce que l'annuaire y a mis, ou rien. */
export function valeursLegales(f: FormData) {
  const lu = (cle: string) => String(f.get(cle) ?? "").trim() || null;
  return Object.fromEntries(CHAMPS_LEGAUX.map((c) => [c, lu(c)]).filter(([, v]) => v !== null)) as Partial<Record<(typeof CHAMPS_LEGAUX)[number], string>>;
}

/**
 * « Chercher dans l'annuaire » dans un formulaire de création : remplit le nom,
 * l'identité légale et l'adresse du site choisi. `caches` : le formulaire n'a
 * pas de champs légaux visibles, le bouton porte alors des champs cachés.
 */
export function BoutonAnnuaire({ caches = false, champNom = "raisonSocialeNom" }: { caches?: boolean; champNom?: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [bouton, setBouton] = useState<HTMLButtonElement | null>(null);
  const [choisie, setChoisie] = useState<string | null>(null);
  const nom = () => (bouton?.form?.elements.namedItem(champNom) as HTMLInputElement | null)?.value ?? "";
  return <>
    {caches && <>{[...CHAMPS_LEGAUX, "siteSiret", "siteFiness"].map((c) => <input key={c} type="hidden" name={c} defaultValue="" />)}</>}
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
      <Button ref={setBouton} size="small" variant="outlined" onClick={() => setOuvert(true)}>Chercher dans l&apos;annuaire</Button>
      <Typography variant="caption" color="text.secondary">{choisie ? `Repris de l'annuaire : ${choisie}. Chaque champ reste modifiable.` : "Nom, SIREN et siège préremplis depuis l'annuaire officiel."}</Typography>
    </Box>
    {ouvert && <RechercheAnnuaire nomInitial={nom()} fermer={() => setOuvert(false)}
      choisir={(e, site) => { if (bouton?.form) remplir(bouton.form, valeursAnnuaire(e, site)); setChoisie(`SIREN ${siren(e.siren)}`); }} />}
  </>;
}
