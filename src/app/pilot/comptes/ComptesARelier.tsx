"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, Button, Checkbox, FormControlLabel, MenuItem, Snackbar, Stack, TextField, Typography } from "@mui/material";
import { IconEyeOff, IconPlugConnected, IconReceipt } from "@tabler/icons-react";
import type { CrmCleEtape, CrmEtapeCommerciale } from "@prisma/client";
import { Bloc, EnTete, Ligne } from "@/pilot/components/Bloc";
import { DialogueFormulaire, envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { TYPES_ORGANISATION, nombreFacultatif, texte, type CompteInterne } from "@/pilot/components/formulaires/ChampsOrganisation";
import { LIBELLES } from "@/pilot/lib/pipeline";
import { compter } from "@/pilot/lib/texte";
import { ETAPES_REPRISE, STATUT_EN_SERVICE, etapeSuggeree, etapesDeclarables, etapesParDefaut, type EtapeReprise } from "@/pilot/lib/reprise/regles";
import type { OrganisationReprise } from "@/pilot/lib/reprise/charger";
import { RAISONS_ECART, ecartCompte, repriseCompte } from "@/pilot/lib/validation/reprise";

type AccesVue = { userProductId: number; productId: number; produit: string; statutCentre: string | null; dernierAppelLe: string | null };
export type CompteVue = {
  userId: number; email: string; nom: string | null;
  organisation: { id: number; nom: string } | null; ecarte: { raison: string; le: string } | null; acces: AccesVue[];
};
type ContratASaisir = { id: number; nom: string; etape: CrmEtapeCommerciale; responsable: string | null; centres: number };
type Dialogue = { type: "creer" | "relier" | "ajouter"; compte: CompteVue } | { type: "ecarter"; compte: CompteVue };
type Message = { texte: string; lien?: string };

const date = (valeur: string) => new Date(valeur).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const STATUTS: Record<string, string> = { EN_PRODUCTION: "en service sur le Dashboard", EN_INTEGRATION: "en mise en service sur le Dashboard" };

/** « LyraeTalk, en service sur le Dashboard, dernier appel le 5 nov. » : ce que le Dashboard sait de chaque accès. */
function DetailAcces({ compte }: { compte: CompteVue }) {
  return <>
    {compte.nom && <Box>{compte.email}</Box>}
    {compte.acces.map((a) => <Box key={a.userProductId} sx={a.statutCentre === STATUT_EN_SERVICE ? { color: "text.primary" } : undefined}>
      {a.produit}, {STATUTS[a.statutCentre ?? ""] ?? "statut inconnu du Dashboard"}
      {a.dernierAppelLe ? `, dernier appel le ${date(a.dernierAppelLe)}` : ", aucun appel"}
    </Box>)}
  </>;
}

export function ComptesARelier({ courantId, resume, aRelier, aAjouter, ecartes, contrats, organisations, internes }: {
  courantId: number; resume: string; aRelier: CompteVue[]; aAjouter: CompteVue[]; ecartes: CompteVue[];
  contrats: ContratASaisir[]; organisations: OrganisationReprise[]; internes: CompteInterne[];
}) {
  const router = useRouter();
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const sansCompte = organisations.filter((o) => o.utilisateurId === null);
  const termine = (m: Message) => { setDialogue(null); setMessage(m); router.refresh(); };
  async function reafficher(compte: CompteVue) {
    setErreur(null);
    try {
      await envoyer(`/api/pilot/comptes/ecartes/${compte.userId}`, "DELETE");
      setMessage({ texte: "Compte réaffiché dans la liste." }); router.refresh();
    } catch (e) { setErreur(e instanceof Error ? e.message : "Le réaffichage a échoué."); }
  }

  return <Stack spacing={2.5}>
    <EnTete titre="Comptes à relier" sousTitre="Ce que le Dashboard connaît et que Pilot ne suit pas encore. Quand la page est vide, tout le parc est dans Pilot." />
    <Typography data-testid="reprise-resume" sx={{ fontSize: 15, fontWeight: 600 }}>{resume}</Typography>
    {erreur && <Typography color="error" role="alert">{erreur}</Typography>}

    <Bloc icone={IconPlugConnected} teinte="indigo" titre="Comptes sans fiche" nombre={aRelier.length}
      vide={aRelier.length ? undefined : "Chaque compte du Dashboard a sa fiche dans Pilot."}>
      {aRelier.map((c) => <Ligne key={c.userId} data-compte={c.userId} nom={c.nom ?? c.email} detail={<DetailAcces compte={c} />}>
        <Button variant="outlined" onClick={() => setDialogue({ type: "creer", compte: c })}>Créer la fiche</Button>
        {sansCompte.length > 0 && <Button variant="outlined" onClick={() => setDialogue({ type: "relier", compte: c })}>Relier à un client</Button>}
        <Button onClick={() => setDialogue({ type: "ecarter", compte: c })}>Écarter</Button>
      </Ligne>)}
    </Bloc>

    {aAjouter.length > 0 && <Bloc icone={IconPlugConnected} teinte="indigo" titre="Produits à ajouter" nombre={aAjouter.length}>
      {aAjouter.map((c) => <Ligne key={c.userId} data-compte={c.userId}
        nom={<Link href={`/pilot/organisations/${c.organisation!.id}?onglet=centres`}>{c.organisation!.nom}</Link>}
        detail={<><Box>{c.email}</Box>{c.acces.map((a) => <Box key={a.userProductId}>{a.produit} ouvert sur le Dashboard, suivi par aucun centre</Box>)}</>}>
        <Button variant="outlined" onClick={() => setDialogue({ type: "ajouter", compte: c })}>Ajouter à un centre</Button>
      </Ligne>)}
    </Bloc>}

    <Bloc icone={IconReceipt} teinte="sarcelle" titre="Contrats à saisir" nombre={contrats.length}
      vide={contrats.length ? undefined : "Chaque client signé a un contrat en cours."}>
      {contrats.map((o) => <Ligne key={o.id} data-contrat={o.id} nom={<Link href={`/pilot/organisations/${o.id}`}>{o.nom}</Link>}
        detail={`${LIBELLES[o.etape]} · ${compter(o.centres, "centre")} · ${o.responsable ?? "Commercial non attribué"}. Sans contrat en cours, son chiffre d'affaires compte zéro.`}>
        <Button variant="outlined" component={Link} href={`/pilot/organisations/${o.id}?onglet=argent`}>Saisir le contrat</Button>
      </Ligne>)}
    </Bloc>

    {ecartes.length > 0 && <Bloc icone={IconEyeOff} teinte="gris" titre="Comptes écartés" nombre={ecartes.length}>
      {ecartes.map((c) => <Ligne key={c.userId} data-ecarte={c.userId} nom={c.nom ?? c.email}
        detail={`${c.ecarte!.raison} · écarté le ${date(c.ecarte!.le)}`}>
        <Button onClick={() => void reafficher(c)}>Réafficher</Button>
      </Ligne>)}
    </Bloc>}

    {dialogue?.type === "ecarter" && <DialogueEcart compte={dialogue.compte} fermer={() => setDialogue(null)} termine={termine} />}
    {dialogue && dialogue.type !== "ecarter" && <DialogueReprise mode={dialogue.type} compte={dialogue.compte} organisations={organisations}
      internes={internes} courantId={courantId} fermer={() => setDialogue(null)} termine={termine} />}
    <Snackbar open={message !== null} message={message?.texte} autoHideDuration={6000} onClose={() => setMessage(null)}
      action={message?.lien && <Button component={Link} href={message.lien} size="small" sx={{ color: "inherit" }}>Ouvrir la fiche</Button>} />
  </Stack>;
}

function DialogueEcart({ compte, fermer, termine }: { compte: CompteVue; fermer: () => void; termine: (m: Message) => void }) {
  return <DialogueFormulaire titre="Écarter ce compte ?" bouton="Écarter" fermer={fermer} soumettre={async (f) => {
    await envoyer("/api/pilot/comptes/ecarter", "POST", ecartCompte, { userId: compte.userId, raison: texte(f, "raison"), precision: texte(f, "precision") });
    termine({ texte: "Compte écarté." });
  }}>
    <Typography>{compte.nom ?? compte.email} ne sera plus proposé. Vous pourrez le réafficher à tout moment.</Typography>
    <TextField name="raison" label="Pourquoi" select required autoFocus defaultValue={RAISONS_ECART[0]} fullWidth>
      {RAISONS_ECART.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
    </TextField>
    <TextField name="precision" label="Précision, facultative" fullWidth inputProps={{ maxLength: 500 }} />
  </DialogueFormulaire>;
}

const SECTION = { fontSize: 13, fontWeight: 600, color: "text.secondary", pt: 1 };

/**
 * Relier un compte : créer sa fiche, le relier à un client existant, ou ajouter
 * ses accès à un centre de son client. Les étapes déjà faites se déclarent ici,
 * pour qu'un centre en service n'arrive pas avec dix cases ouvertes (C-60).
 */
function DialogueReprise({ mode, compte, organisations, internes, courantId, fermer, termine }: {
  mode: "creer" | "relier" | "ajouter"; compte: CompteVue; organisations: OrganisationReprise[]; internes: CompteInterne[];
  courantId: number; fermer: () => void; termine: (m: Message) => void;
}) {
  const suggeree = etapeSuggeree(compte.acces);
  const [etape, setEtape] = useState<EtapeReprise>(suggeree);
  const [choisis, setChoisis] = useState<number[]>(compte.acces.map((a) => a.userProductId));
  const produits = compte.acces.filter((a) => choisis.includes(a.userProductId));
  const nomsProduits = produits.map((a) => a.produit);
  const choixClients = mode === "ajouter" ? organisations.filter((o) => o.id === compte.organisation?.id) : organisations.filter((o) => o.utilisateurId === null);
  const [organisationId, setOrganisationId] = useState<number | "">(mode === "ajouter" ? compte.organisation!.id : "");
  const organisation = organisations.find((o) => o.id === organisationId);
  const occupe = (c: OrganisationReprise["centres"][number]) => produits.find((a) => c.produits.includes(a.productId));
  // Un client à un seul centre libre : ce centre est le bon, on le propose.
  const libres = organisation?.centres.filter((c) => !occupe(c)) ?? [];
  const [centre, setCentre] = useState<number | "nouveau">(mode === "ajouter" && libres.length === 1 ? libres[0].id : "nouveau");
  const declarables = etapesDeclarables(nomsProduits);
  const [cochees, setCochees] = useState<CrmCleEtape[]>(etapesParDefaut(suggeree, nomsProduits));
  const [miseEnServiceLe, setMiseEnServiceLe] = useState("");
  const passage = cochees.includes("PASSAGE_PRODUCTION") && declarables.some((e) => e.cle === "PASSAGE_PRODUCTION");

  function changerEtape(valeur: EtapeReprise) { setEtape(valeur); setCochees(etapesParDefaut(valeur, nomsProduits)); }
  function basculerProduit(id: number) {
    const suivants = choisis.includes(id) ? choisis.filter((x) => x !== id) : [...choisis, id];
    setChoisis(suivants);
    const noms = compte.acces.filter((a) => suivants.includes(a.userProductId)).map((a) => a.produit);
    const permis = new Set(etapesDeclarables(noms).map((e) => e.cle));
    setCochees((c) => c.filter((cle) => permis.has(cle)));
  }
  const basculerEtape = (cle: CrmCleEtape) => setCochees((c) => (c.includes(cle) ? c.filter((x) => x !== cle) : [...c, cle]));

  const titre = { creer: "Créer la fiche", relier: "Relier à un client", ajouter: "Ajouter à un centre" }[mode];
  return <DialogueFormulaire titre={titre} bouton={mode === "creer" ? "Créer la fiche" : "Relier"} maxWidth="md" fermer={fermer} soumettre={async (f) => {
    if (mode !== "creer" && organisationId === "") throw new Error("Choisissez le client.");
    const resultat = await envoyer<{ organisationId: number }>("/api/pilot/comptes/reprendre", "POST", repriseCompte, {
      userId: compte.userId, userProductIds: choisis,
      organisation: mode === "creer"
        ? { mode: "creer", raisonSocialeNom: texte(f, "raisonSocialeNom"), type: texte(f, "type"), responsableId: Number(f.get("responsableId")),
          chefDeProjetId: nombreFacultatif(f, "chefDeProjetId"), etape }
        : { mode: "existante", organisationId },
      centre: centre === "nouveau" ? { mode: "creer", nom: texte(f, "centreNom"), ville: texte(f, "ville"), codeSite: texte(f, "codeSite") } : { mode: "existant", centreId: centre },
      etapesFaites: cochees.filter((cle) => declarables.some((e) => e.cle === cle)),
      miseEnServiceLe: passage ? miseEnServiceLe || null : null,
    });
    termine({ texte: mode === "creer" ? "Fiche créée." : "Compte relié.", lien: `/pilot/organisations/${resultat.organisationId}?onglet=centres` });
  }}>
    <Typography color="text.secondary">{compte.nom ? `${compte.nom}, ${compte.email}` : compte.email}</Typography>

    <Typography sx={SECTION}>Client</Typography>
    {mode === "creer" ? <>
      <TextField name="raisonSocialeNom" label="Nom du client" defaultValue={compte.nom ?? ""} required autoFocus fullWidth inputProps={{ maxLength: 200 }} />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField name="type" label="Type" select defaultValue="CABINET" required fullWidth>
          {Object.entries(TYPES_ORGANISATION).map(([id, nom]) => <MenuItem key={id} value={id}>{nom}</MenuItem>)}
        </TextField>
        <TextField label="Étape" select value={etape} onChange={(e) => changerEtape(e.target.value as EtapeReprise)} fullWidth
          helperText={suggeree === "EN_PRODUCTION" ? "Le Dashboard le dit en service." : "Le Dashboard le dit en mise en service."}>
          {ETAPES_REPRISE.map((v) => <MenuItem key={v} value={v}>{LIBELLES[v]}</MenuItem>)}
        </TextField>
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField name="responsableId" label="Commercial" select required fullWidth defaultValue={courantId}>
          {internes.map((c) => <MenuItem key={c.id} value={c.id}>{c.name ?? "Compte interne sans nom"}</MenuItem>)}
        </TextField>
        <TextField name="chefDeProjetId" label="Chef de projet" select fullWidth defaultValue="">
          <MenuItem value="">Non attribué</MenuItem>
          {internes.map((c) => <MenuItem key={c.id} value={c.id}>{c.name ?? "Compte interne sans nom"}</MenuItem>)}
        </TextField>
      </Stack>
    </> : <TextField label="Client" select required autoFocus={mode === "relier"} disabled={mode === "ajouter"} fullWidth value={organisationId}
      onChange={(e) => { setOrganisationId(Number(e.target.value)); setCentre("nouveau"); }}
      helperText={mode === "relier" ? "Seuls les clients sans compte sur le Dashboard sont proposés. Son étape ne change pas." : undefined}>
      {choixClients.map((o) => <MenuItem key={o.id} value={o.id}>{o.nom}</MenuItem>)}
    </TextField>}

    <Typography sx={SECTION}>Centre</Typography>
    {organisation && organisation.centres.length > 0 && <TextField label="Centre" select fullWidth value={centre}
      onChange={(e) => setCentre(e.target.value === "nouveau" ? "nouveau" : Number(e.target.value))}>
      <MenuItem value="nouveau">Nouveau centre</MenuItem>
      {organisation.centres.map((c) => { const pris = occupe(c);
        return <MenuItem key={c.id} value={c.id} disabled={!!pris}>{c.nom}{pris ? `, a déjà ${pris.produit}` : ""}</MenuItem>; })}
    </TextField>}
    {centre === "nouveau" && <>
      <TextField name="centreNom" label="Nom du centre" defaultValue={mode === "creer" ? compte.nom ?? "" : ""} required fullWidth inputProps={{ maxLength: 200 }} />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField name="ville" label="Ville" fullWidth inputProps={{ maxLength: 200 }} />
        <TextField name="codeSite" label="Code site Xplore" fullWidth inputProps={{ maxLength: 200 }} />
      </Stack>
    </>}

    {compte.acces.length > 1 && <>
      <Typography sx={SECTION}>Produits</Typography>
      <Box>{compte.acces.map((a) => <FormControlLabel key={a.userProductId} sx={{ display: "flex" }}
        control={<Checkbox checked={choisis.includes(a.userProductId)} onChange={() => basculerProduit(a.userProductId)} />}
        label={`${a.produit}, ${STATUTS[a.statutCentre ?? ""] ?? "statut inconnu du Dashboard"}`} />)}</Box>
    </>}

    <Typography sx={SECTION}>Étapes déjà faites</Typography>
    <Typography variant="body2" color="text.secondary">
      Cochez ce qui a été fait avant Pilot. Ce qui reste décoché s&apos;ouvre dans les déploiements.
      Les étapes vérifiées par le Dashboard se cochent seules juste après.
    </Typography>
    {declarables.length ? <Box>{declarables.map((e) => <FormControlLabel key={e.cle} sx={{ display: "flex", alignItems: "flex-start", my: 0.25 }}
      control={<Checkbox size="small" checked={cochees.includes(e.cle)} onChange={() => basculerEtape(e.cle)} sx={{ py: 0.5 }} />}
      label={<Box sx={{ pt: 0.5, fontSize: 14 }}>{e.libelle}</Box>} />)}</Box>
      : <Typography variant="body2" color="text.secondary">Choisissez au moins un produit.</Typography>}
    {passage && <TextField label="Date de mise en service" type="date" required value={miseEnServiceLe} onChange={(e) => setMiseEnServiceLe(e.target.value)}
      InputLabelProps={{ shrink: true }} inputProps={{ max: new Date().toISOString().slice(0, 10) }} helperText="Une date approximative suffit. Elle date les étapes cochées." />}
  </DialogueFormulaire>;
}
