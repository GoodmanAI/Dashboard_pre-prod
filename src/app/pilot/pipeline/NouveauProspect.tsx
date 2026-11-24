"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Alert, Box, Button, Checkbox, Drawer, FormControlLabel, FormGroup, IconButton, MenuItem, Snackbar, Stack, Switch, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from "@mui/material";
import { IconX } from "@tabler/icons-react";
import { envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { CHAMP_DECIMAL } from "@/pilot/components/formulaires/champs";
import { ROLES_CONTACT } from "@/pilot/components/formulaires/ChampsContact";
import { BoutonAnnuaire, valeursLegales } from "@/pilot/components/formulaires/RechercheAnnuaire";
import { TYPES_ORGANISATION, texte, type CompteInterne } from "@/pilot/components/formulaires/ChampsOrganisation";
import { ORIGINES } from "@/pilot/lib/organisations/referentielClient";
import { suggestionsRdv, suggestionsRis, type SuggestionsSaisie } from "@/pilot/lib/organisations/suggestions";
import { LIBELLES_ECHANGE } from "@/pilot/lib/echanges/libelles";
import { CANAUX_PREMIER_CONTACT, ORDRE_PRIORITES, PRIORITES } from "@/pilot/lib/prospection/regles";
import { creationProspect } from "@/pilot/lib/validation/prospect";
import { SelecteurConcurrent } from "@/pilot/components/formulaires/SelecteurConcurrent";
import { designeUnConcurrent, typeSuggere } from "@/pilot/lib/concurrents/designation";
import type { OptionConcurrent } from "@/pilot/lib/concurrents/options";
import { centimesDepuisSaisie, eurosPrecis, saisieEuros } from "@/pilot/lib/argent";
import { estimerMontant, type ElementManquant, type OffresChoisies } from "@/pilot/lib/tarifs/estimer";
import type { GrilleEstimation } from "@/pilot/lib/tarifs/grille";
import { Doublons, useDoublons } from "@/pilot/components/formulaires/Doublons";
import { JETONS } from "@/pilot/jetons";
import { AIDE_ADRESSE } from "@/pilot/lib/carte/affichage";

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const NOMS_MANQUANTS: Record<ElementManquant, string> = { TALK: "Talk", KONNECT: "Konnect", CONNECTEUR_RIS: "le connecteur RIS" };

/**
 * La fiche de saisie rapide d'un prospect (C-65), en panneau latéral. Seuls le
 * nom, le type, la ville et le commercial sont obligatoires ; le reste se
 * complète plus tard depuis la fiche. Ctrl+Entrée crée le prospect.
 */
export function NouveauProspect({ comptes, courantId, suggestions, grille, montantsModifiables, concurrents }: {
  comptes: CompteInterne[]; courantId: number; suggestions: SuggestionsSaisie; grille: GrilleEstimation; montantsModifiables: boolean;
  /** La liste lue une fois par la page, pour « Lequel ? » (lot R). */
  concurrents: OptionConcurrent[];
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [creeId, setCreeId] = useState<number | null>(null);
  return <>
    <Button variant="contained" onClick={() => setOuvert(true)}>Nouveau prospect</Button>
    {ouvert && <PanneauProspect comptes={comptes} courantId={courantId} suggestions={suggestions} grille={grille} montantsModifiables={montantsModifiables} concurrents={concurrents} fermer={() => setOuvert(false)}
      cree={(id, continuer) => { setCreeId(id); router.refresh(); if (!continuer) setOuvert(false); }} />}
    <Snackbar open={creeId !== null} autoHideDuration={6000} onClose={() => setCreeId(null)} message="Prospect créé."
      action={<Button color="inherit" onClick={() => router.push(`/pilot/organisations/${creeId}`)}>Ouvrir la fiche</Button>} />
  </>;
}

function PanneauProspect({ comptes, courantId, suggestions, grille, montantsModifiables, concurrents, fermer, cree }: {
  comptes: CompteInterne[]; courantId: number; suggestions: SuggestionsSaisie; grille: GrilleEstimation; montantsModifiables: boolean; concurrents: OptionConcurrent[];
  fermer: () => void; cree: (id: number, continuer: boolean) => void;
}) {
  const titreId = useId();
  const formulaire = useRef<HTMLFormElement>(null);
  const nomRef = useRef<HTMLInputElement>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  // Remis à zéro à chaque prospect enregistré : la clé recrée les champs vides.
  const [saisie, setSaisie] = useState(0);
  const [priorite, setPriorite] = useState<string | null>(null);
  const [contacts, setContacts] = useState<number[]>([0]);
  const [premier, setPremier] = useState(false);
  const [recherche, setRecherche] = useState({ nom: "", ville: "" });
  // Le montant estimé : prérempli par la grille tant que l'utilisateur n'y a pas touché, puis jamais écrasé (C-70).
  const [salles, setSalles] = useState("");
  const [offres, setOffres] = useState<OffresChoisies>({ talk: false, konnect: false, connecteurRis: false });
  const [montant, setMontant] = useState<{ corrige: boolean; saisie: string }>({ corrige: false, saisie: "" });
  const nombreSalles = /^\d+$/.test(salles.trim()) ? Number(salles.trim()) : null;
  // Une saisie qui n'est pas un nombre entier positif est refusée, jamais ignorée en silence (C-92).
  const sallesInvalides = salles.trim() !== "" && nombreSalles === null;
  const estimation = useMemo(() => estimerMontant(nombreSalles, offres, grille), [nombreSalles, offres, grille]);
  const estimeSaisie = estimation?.complet ? saisieEuros(estimation.mensuelCentimes) : "";
  const montantAffiche = montant.corrige ? montant.saisie : estimeSaisie;
  const doublons = useDoublons(recherche.nom, recherche.ville);
  // « Lequel ? » : demandé seulement quand l'outil de RDV ou la solution saisie désigne un concurrent (lot R).
  const [outils, setOutils] = useState({ outilRdv: "", solutionActuelle: "" });
  const [concurrentId, setConcurrentId] = useState<number | null>(null);
  const lequel = designeUnConcurrent(outils);
  // Ce qui vient d'être créé dans ce panneau : proposé tout de suite au prospect suivant, sans attendre la relecture de la page.
  const [crees, setCrees] = useState<{ ris: string[]; outilRdv: string[] }>({ ris: [], outilRdv: [] });
  const listeRis = useMemo(() => suggestionsRis(crees.ris, suggestions.ris), [suggestions.ris, crees.ris]);
  const listeRdv = useMemo(() => suggestionsRdv(crees.outilRdv, suggestions.outilRdv), [suggestions.outilRdv, crees.outilRdv]);

  function repartir() {
    setSaisie((s) => s + 1); setPriorite(null); setContacts([0]); setPremier(false); setRecherche({ nom: "", ville: "" });
    setOutils({ outilRdv: "", solutionActuelle: "" }); setConcurrentId(null);
    setSalles(""); setOffres({ talk: false, konnect: false, connecteurRis: false }); setMontant({ corrige: false, saisie: "" });
    setTimeout(() => nomRef.current?.focus(), 0);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (envoi) return;
    const continuer = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "continuer";
    const f = new FormData(e.currentTarget);
    setEnvoi(true); setErreur(null); setSucces(null);
    try {
      const nom = texte(f, "raisonSocialeNom");
      if (sallesInvalides) throw new Error(SALLES_INVALIDES);
      let montantEstime: { montantMensuelCentimes: number; offres: string[] } | undefined;
      if (montantsModifiables && montantAffiche.trim()) {
        let centimes: number;
        try { centimes = centimesDepuisSaisie(montantAffiche); } catch { throw new Error("Vérifiez le champ « Montant estimé par mois »."); }
        if (centimes > 0) {
          if (!offres.talk && !offres.konnect) throw new Error("Cochez Talk ou Konnect : le montant se rattache à un produit.");
          montantEstime = { montantMensuelCentimes: centimes, offres: [offres.talk && "TALK", offres.konnect && "KONNECT", offres.connecteurRis && "CONNECTEUR_RIS"].filter((o): o is string => !!o) };
        }
      }
      const resultat = await envoyer<{ organisation: { id: number } }>("/api/pilot/prospects", "POST", creationProspect, {
        organisation: {
          raisonSocialeNom: nom, type: texte(f, "type"), responsableId: Number(f.get("responsableId")), priorite,
          rattachementGht: texte(f, "rattachementGht"), telephone: texte(f, "telephone"), email: texte(f, "email"),
          siteWeb: texte(f, "siteWeb"), ris: texte(f, "ris"), outilRdv: texte(f, "outilRdv"),
          solutionActuelle: texte(f, "solutionActuelle"), origine: texte(f, "origine") || null,
          ...(nombreSalles !== null ? { nombreSalles } : {}),
          // L'identité légale reprise de l'annuaire (C-89), si on l'a cherchée.
          ...valeursLegales(f),
          // Le concurrent en place part avec la création : une seule transaction, jamais un prospect à moitié enregistré.
          ...(lequel && concurrentId !== null ? { concurrentId } : {}),
        },
        site: { adresse: texte(f, "adresse"), codePostal: texte(f, "codePostal"), ville: texte(f, "ville"),
          ...(texte(f, "siteSiret") ? { siret: texte(f, "siteSiret"), finess: texte(f, "siteFiness") } : {}) },
        contacts: contacts.map((k) => ({
          nom: texte(f, `contact${k}_nom`), metier: texte(f, `contact${k}_metier`), fonction: texte(f, `contact${k}_fonction`), email: texte(f, `contact${k}_email`),
          telephone: texte(f, `contact${k}_telephone`), roleDecision: texte(f, `contact${k}_roleDecision`) || "INCONNU",
        })).filter((c) => c.nom.trim()),
        ...(premier ? { premierContact: {
          type: texte(f, "canal"), surveneuLe: texte(f, "surveneuLe"), compteRendu: texte(f, "compteRendu"),
          prochaineAction: texte(f, "prochaineAction"), prochaineActionLe: texte(f, "prochaineActionLe") || null,
        } } : {}),
        ...(montantEstime ? { montantEstime } : {}),
      });
      setCrees((c) => ({ ris: [...c.ris, texte(f, "ris")], outilRdv: [...c.outilRdv, texte(f, "outilRdv")] }));
      cree(resultat.organisation.id, continuer);
      if (continuer) { setSucces(`« ${nom} » est créé. Saisissez le suivant.`); repartir(); }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'enregistrement a échoué.");
    } finally { setEnvoi(false); }
  }
  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.requestSubmit(); }
  }

  // Le focus va au nom une fois le panneau arrivé : pendant le glissement, le piège à focus le reprendrait.
  return <Drawer anchor="right" open onClose={fermer} SlideProps={{ onEntered: () => nomRef.current?.focus() }}
    PaperProps={{ role: "dialog", "aria-labelledby": titreId, sx: { width: { xs: "100%", sm: 600 }, borderLeft: 1, borderColor: "divider" } }}>
    <Box component="form" ref={formulaire} onSubmit={onSubmit} onKeyDown={onKeyDown} noValidate={false}
      sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Stack direction="row" alignItems="flex-start" sx={{ px: 3, pt: 3, pb: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id={titreId} variant="h2">Nouveau prospect</Typography>
          <Typography variant="body2" color="text.secondary">Nom, type et ville suffisent. Le reste se complète plus tard. Ctrl+Entrée crée le prospect.</Typography>
        </Box>
        <IconButton aria-label="Fermer sans enregistrer" onClick={fermer}><IconX size={20} /></IconButton>
      </Stack>

      <Stack key={saisie} spacing={3} sx={{ flex: 1, overflowY: "auto", px: 3, pb: 3, pt: 0.5 }}>
        {erreur && <Alert severity="error" icon={false}>{erreur}</Alert>}
        {succes && <Alert severity="success" icon={false}>{succes}</Alert>}

        <Bloc titre="Établissement">
          <TextField name="raisonSocialeNom" label="Nom" required fullWidth autoFocus inputRef={nomRef} inputProps={{ maxLength: 200 }}
            onChange={(e) => setRecherche((r) => ({ ...r, nom: e.target.value }))} />
          <BoutonAnnuaire caches />
          <Doublons liste={doublons} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
            <TextField name="type" label="Type" select required defaultValue="CABINET" sx={{ flex: 1 }}>
              {Object.entries(TYPES_ORGANISATION).map(([id, nom]) => <MenuItem key={id} value={id}>{nom}</MenuItem>)}
            </TextField>
            <Box>
              <Typography variant="caption" color="text.secondary" component="div" id={`${titreId}-priorite`}>Priorité</Typography>
              <ToggleButtonGroup exclusive size="small" value={priorite} onChange={(_, v: string | null) => setPriorite(v)} aria-labelledby={`${titreId}-priorite`}>
                {ORDRE_PRIORITES.map((p) => <ToggleButton key={p} value={p} sx={{ px: 1.75, minWidth: 44 }}>{PRIORITES[p]}</ToggleButton>)}
              </ToggleButtonGroup>
            </Box>
          </Stack>
          <TextField name="rattachementGht" label="GHT ou groupe" fullWidth inputProps={{ maxLength: 120 }} helperText="Le groupe ou le GHT dont l'établissement fait partie." />
          <TextField name="adresse" label="Adresse" fullWidth inputProps={{ maxLength: 300 }} helperText={AIDE_ADRESSE} />
          <Stack direction="row" spacing={2}>
            <TextField name="codePostal" label="Code postal" inputProps={{ maxLength: 10, inputMode: "numeric" }} sx={{ width: 140, flexShrink: 0 }} />
            <TextField name="ville" label="Ville" required fullWidth inputProps={{ maxLength: 200 }}
              onChange={(e) => setRecherche((r) => ({ ...r, ville: e.target.value }))} />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField name="telephone" label="Standard" type="tel" fullWidth inputProps={{ maxLength: 40 }} />
            <TextField name="siteWeb" label="Site web" fullWidth inputProps={{ maxLength: 300 }} placeholder="www.exemple.fr" />
          </Stack>
          <TextField name="email" label="Email du standard" type="email" fullWidth />
        </Bloc>

        <Bloc titre="Outils en place">
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField name="ris" label="RIS" fullWidth inputProps={{ maxLength: 200, list: "prospect-ris" }} helperText="Choisissez dans la liste ou saisissez-le." />
            <TextField name="outilRdv" label="Prise de RDV" fullWidth inputProps={{ maxLength: 100, list: "prospect-rdv" }}
              onChange={(e) => setOutils((o) => ({ ...o, outilRdv: e.target.value }))} helperText="Choisissez dans la liste ou saisissez-le." />
          </Stack>
          <datalist id="prospect-ris">{listeRis.map((e) => <option key={e} value={e} />)}</datalist>
          <datalist id="prospect-rdv">{listeRdv.map((e) => <option key={e} value={e} />)}</datalist>
          <TextField name="solutionActuelle" label="Solution concurrente" fullWidth inputProps={{ maxLength: 2000 }}
            onChange={(e) => setOutils((o) => ({ ...o, solutionActuelle: e.target.value }))}
            helperText="Robot vocal, centre d'appels, secrétariat externalisé… Vide si aucune." />
          {lequel && <SelecteurConcurrent concurrents={concurrents} valeur={concurrentId} changer={setConcurrentId} typeParDefaut={typeSuggere(outils.outilRdv)} />}
        </Bloc>

        {montantsModifiables && <Bloc titre="Montant estimé" detail="Facultatif. Il apparaît sur la carte du prospect et dans sa fiche.">
          <TextField name="nombreSalles" label="Salles" value={salles} onChange={(e) => setSalles(e.target.value)} sx={{ maxWidth: 160 }}
            inputProps={{ inputMode: "numeric", maxLength: 4 }} error={sallesInvalides} helperText={sallesInvalides ? SALLES_INVALIDES : "Nombre de salles à équiper."} />
          <FormGroup row aria-label="Offres envisagées">
            <FormControlLabel control={<Checkbox checked={offres.talk} onChange={(_, v) => setOffres((o) => ({ ...o, talk: v }))} />} label="Talk" />
            <FormControlLabel control={<Checkbox checked={offres.konnect} onChange={(_, v) => setOffres((o) => ({ ...o, konnect: v }))} />} label="Konnect" />
            <FormControlLabel control={<Checkbox checked={offres.connecteurRis} onChange={(_, v) => setOffres((o) => ({ ...o, connecteurRis: v }))} />} label="Connecteur RIS" />
          </FormGroup>
          <TextField name="montantEstime" label="Montant estimé par mois, hors taxe, en euros" value={montantAffiche} fullWidth inputProps={CHAMP_DECIMAL}
            onChange={(e) => setMontant({ corrige: true, saisie: e.target.value })}
            helperText={aideMontant(estimation, montant.corrige)} />
          {montant.corrige && estimation?.complet && montantAffiche !== estimeSaisie && <Box>
            <Button size="small" onClick={() => setMontant({ corrige: false, saisie: "" })}>Reprendre l&apos;estimation ({eurosPrecis(estimation.mensuelCentimes)})</Button>
          </Box>}
        </Bloc>}

        <Bloc titre="Contacts" detail="Le premier est le contact principal.">
          <datalist id="liste-metiers-prospect">{suggestions.metier.map((m) => <option key={m} value={m} />)}</datalist>
          {contacts.map((k, rang) => <Box key={k} sx={{ p: 2, borderRadius: "14px", bgcolor: JETONS.surface }}>
            <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
              <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>{rang === 0 ? "Contact principal" : `Contact ${rang + 1}`}</Typography>
              {contacts.length > 1 && <Button size="small" onClick={() => setContacts((c) => c.filter((x) => x !== k))}
                aria-label={`Retirer le contact ${rang + 1}`}>Retirer</Button>}
            </Stack>
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField name={`contact${k}_nom`} label="Nom" fullWidth inputProps={{ maxLength: 200 }} />
                <TextField name={`contact${k}_metier`} label="Métier" fullWidth inputProps={{ maxLength: 100, list: "liste-metiers-prospect", autoComplete: "off" }} />
                <TextField name={`contact${k}_fonction`} label="Fonction" fullWidth inputProps={{ maxLength: 200 }} />
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField name={`contact${k}_email`} label="Email" type="email" fullWidth />
                <TextField name={`contact${k}_telephone`} label="Téléphone" type="tel" fullWidth inputProps={{ maxLength: 200 }} />
              </Stack>
              <TextField name={`contact${k}_roleDecision`} label="Rôle dans la décision" select defaultValue="INCONNU" fullWidth>
                {Object.entries(ROLES_CONTACT).map(([id, nom]) => <MenuItem key={id} value={id}>{nom}</MenuItem>)}
              </TextField>
            </Stack>
          </Box>)}
          {contacts.length < 10 && <Box><Button variant="outlined" onClick={() => setContacts((c) => [...c, Math.max(...c) + 1])}>Ajouter un contact</Button></Box>}
        </Bloc>

        <Bloc titre="Premier contact">
          <FormControlLabel sx={{ m: 0 }} control={<Switch checked={premier} onChange={(_, v) => setPremier(v)} />}
            label="Le prospect a déjà été contacté" />
          {premier && <>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField name="canal" label="Canal" select defaultValue="APPEL" fullWidth>
                {CANAUX_PREMIER_CONTACT.map((c) => <MenuItem key={c} value={c}>{LIBELLES_ECHANGE[c]}</MenuItem>)}
              </TextField>
              <TextField name="surveneuLe" label="Le" type="date" defaultValue={aujourdhui()} required fullWidth
                inputProps={{ max: aujourdhui() }} InputLabelProps={{ shrink: true }} />
            </Stack>
            <TextField name="compteRendu" label="Ce qui s'est dit" multiline minRows={3} fullWidth inputProps={{ maxLength: 5000 }} />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField name="prochaineAction" label="Prochaine action" fullWidth inputProps={{ maxLength: 500 }} placeholder="Rappeler le directeur" />
              <TextField name="prochaineActionLe" label="Pour le" type="date" InputLabelProps={{ shrink: true }} inputProps={{ min: aujourdhui() }} sx={{ minWidth: 170 }} />
            </Stack>
          </>}
        </Bloc>

        <Bloc titre="Suivi">
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField name="responsableId" label="Commercial" select required fullWidth defaultValue={courantId}>
              {comptes.map((c) => <MenuItem key={c.id} value={c.id}>{c.name ?? "Compte interne sans nom"}</MenuItem>)}
            </TextField>
            <TextField name="origine" label="Origine du contact" select fullWidth defaultValue="">
              <MenuItem value="">Non renseignée</MenuItem>
              {Object.entries(ORIGINES).map(([cle, nom]) => <MenuItem key={cle} value={cle}>{nom}</MenuItem>)}
            </TextField>
          </Stack>
        </Bloc>
      </Stack>

      <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} justifyContent="flex-end" alignItems="center"
        sx={{ px: 3, py: 2, borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}>
        <Button onClick={fermer} sx={{ mr: "auto" }}>Annuler</Button>
        <Button type="submit" name="suite" value="continuer" variant="outlined" disabled={envoi}>Créer et saisir un autre</Button>
        <Button type="submit" name="suite" value="fermer" variant="contained" disabled={envoi}>Créer le prospect</Button>
      </Stack>
    </Box>
  </Drawer>;
}

const SALLES_INVALIDES = "Salles : un nombre entier, 0 ou plus.";

/** Dit d'où vient le montant, ou pourquoi il est vide et comment le remplir. */
function aideMontant(estimation: ReturnType<typeof estimerMontant>, corrige: boolean): string {
  if (estimation?.complet) return corrige ? "Montant corrigé à la main." : "Estimé d'après la grille de prix. Vous pouvez le corriger.";
  if (estimation) return `La grille n'a pas de prix pour ${estimation.manquants.map((m) => NOMS_MANQUANTS[m]).join(" et ")}. Saisissez le montant à la main.`;
  return "Indiquez le nombre de salles et cochez Talk ou Konnect pour une estimation, ou saisissez le montant à la main.";
}

function Bloc({ titre, detail, children }: { titre: string; detail?: string; children: ReactNode }) {
  return <Stack component="section" aria-label={titre} spacing={2}>
    <Box>
      <Typography component="h3" sx={{ fontSize: 13, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.04em" }}>{titre}</Typography>
      {detail && <Typography variant="caption" color="text.secondary">{detail}</Typography>}
    </Box>
    {children}
  </Stack>;
}
