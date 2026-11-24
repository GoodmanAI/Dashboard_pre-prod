"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import { centimesDepuisSaisie, eurosPrecis } from "@/pilot/lib/argent";
import type { FacturationVue } from "@/pilot/lib/facturation/charger";

const date = (s: string) => new Date(s).toLocaleDateString("fr-FR", { timeZone: "UTC" });
const mois = (s: string) => new Date(s).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const moisDuReel = (s: string) => `${/^[aeiouy]/i.test(mois(s)) ? "d'" : "de "}${mois(s)}`;
const LIBELLES = { FORMATION: "Formation du premier POC", FORMATION_DEJA_DUE: "Formation déjà due", GRATUIT: "POC gratuit", PROLONGATION: "Prolongation gratuite", PAYANT: "Contrat payant" };

export function CalendrierFacturation({ organisationId, initial, modifiable }: { organisationId: number; initial: FacturationVue; modifiable: boolean }) {
  const router = useRouter();
  const [donnees, setDonnees] = useState(initial);
  const [prix, setPrix] = useState("");
  const [facture, setFacture] = useState("");
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");
  const [attente, setAttente] = useState(false);
  const f = donnees.formation;
  async function enregistrer(quoi: "prix" | "facture") {
    setErreur(""); setMessage(""); setAttente(true);
    try {
      const corps = quoi === "prix" ? { montantCentimes: centimesDepuisSaisie(prix) } : { factureEmiseLe: facture };
      const r = await fetch(`/api/pilot/organisations/${organisationId}/facturation`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
      const resultat = await r.json();
      if (!r.ok) throw new Error(resultat.erreur ?? "Enregistrement impossible.");
      const lecture = await fetch(`/api/pilot/organisations/${organisationId}/facturation`);
      if (!lecture.ok) throw new Error("Rechargez la fiche pour voir la formation enregistrée.");
      setDonnees((await lecture.json()).facturation);
      setMessage(quoi === "prix" ? "Prix de formation enregistré." : "Facture de formation déclarée émise."); router.refresh();
    } catch (e) { setErreur(e instanceof Error ? e.message : "Enregistrement impossible."); }
    finally { setAttente(false); }
  }
  return <Stack spacing={2} sx={{ my: 2, minWidth: 0 }} data-testid="calendrier-facturation">
    <Typography variant="h3">Calendrier de facturation</Typography>
    <Typography variant="body2" color="text.secondary">Montants HT. Mois entier du début officiel, sans prorata. La part à l&apos;usage dépend des compteurs. La formation s&apos;ajoute aux frais d&apos;installation.</Typography>
    {erreur && <Alert severity="error">{erreur}</Alert>}{message && <Alert severity="success">{message}</Alert>}
    {donnees.formationAbsente && <Alert severity="warning">La formation du premier POC manque. Faites reprendre les données du dossier avant de confirmer la facturation.</Alert>}
    {f && <Box>
      <Typography variant="body2">Formation due au POC du {date(f.debuteLe)}. {f.factureEmiseLe ? `Facture déclarée émise le ${date(f.factureEmiseLe)}.` : "Facture à émettre. Cette déclaration ne vaut pas encaissement."}</Typography>
      {f.montantCentimes === null && <Typography variant="body2" color="warning.main">Prix à renseigner. Le tarif applicable au début du POC était absent. Un compte qui modifie les montants peut compléter le prix ici.</Typography>}
      {modifiable && <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 1 }}>
        {f.montantCentimes === null && <Stack spacing={1} sx={{ minWidth: 0, flex: 1 }}>
          <TextField label="Prix de formation HT en euros" value={prix} onChange={(e) => setPrix(e.target.value)} inputProps={{ inputMode: "decimal" }} />
          <Button disabled={attente || !prix.trim()} onClick={() => enregistrer("prix")}>Enregistrer le prix</Button>
        </Stack>}
        {!f.factureEmiseLe && f.montantCentimes !== null && <Stack spacing={1} sx={{ minWidth: 0, flex: 1 }}>
          <TextField type="date" label="Date de facture émise" InputLabelProps={{ shrink: true }} value={facture} onChange={(e) => setFacture(e.target.value)} inputProps={{ min: f.debuteLe.slice(0, 10) }} />
          <Button disabled={attente || !facture} onClick={() => enregistrer("facture")}>Déclarer la facture émise</Button>
        </Stack>}
      </Stack>}
    </Box>}
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(3, minmax(0, 1fr))" }, gap: 1.5 }}>
      {donnees.mois.map((m) => <Box key={m.mois} sx={{ minWidth: 0, p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2, overflowWrap: "anywhere" }} data-facturation-mois={m.mois.slice(0, 7)} data-centimes={m.montantCentimes}>
        <Typography fontWeight={600}>{mois(m.mois)}</Typography>
        {!m.lignes.length ? <Typography variant="body2" color="text.secondary">Aucune période prévue. Datez le POC ou saisissez et activez le contrat dans cet onglet.</Typography> : <>
          <Typography fontWeight={600}>{eurosPrecis(m.montantCentimes)} HT</Typography>
          {m.lignes.map((l, i) => <Box key={i} sx={{ mt: 1 }}>
            <Typography variant="body2">{l.type === "FORMATION_DEJA_DUE" ? `Formation déjà ${f?.factureEmiseLe ? "facturée" : "due"} au POC du ${date(l.debuteLe)}.` : `${LIBELLES[l.type]} : ${date(l.debuteLe)}${l.termineLe && l.termineLe !== l.debuteLe ? ` au ${date(l.termineLe)}` : l.type === "PAYANT" ? ", sans fin renseignée" : ""}.`}</Typography>
            {l.prixARenseigner ? <Typography variant="body2" color="warning.main">Prix à renseigner, total incomplet.</Typography> : l.type !== "FORMATION_DEJA_DUE" && <Typography variant="caption">{eurosPrecis(l.montantCentimes)} HT</Typography>}
            {l.regularisation && <Typography variant="body2" color="warning.main">Non comptée dans le réel {moisDuReel(m.mois)}, déjà arrêté. Régularisation à faire avec la comptabilité.</Typography>}
            {l.rattrapage && <Typography variant="body2" color="warning.main">La formation sera ajoutée au réel {moisDuReel(m.mois)} au prochain arrêté mensuel.</Typography>}
          </Box>)}
        </>}
      </Box>)}
    </Box>
  </Stack>;
}

/** Ventes : lecture à l'ouverture, sans chargement par carte dans la page serveur. */
export function AfficherCalendrierFacturation({ organisationId, modifiable }: { organisationId: number; modifiable: boolean }) {
  const [donnees, setDonnees] = useState<FacturationVue | null>(null);
  const [erreur, setErreur] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [attente, setAttente] = useState(false);
  async function ouvrir() {
    if (donnees) { setOuvert(!ouvert); return; }
    setAttente(true); setErreur("");
    try {
      const r = await fetch(`/api/pilot/organisations/${organisationId}/facturation`);
      if (!r.ok) throw new Error("Calendrier indisponible. Ouvrez l'onglet Argent de la fiche.");
      setDonnees((await r.json()).facturation); setOuvert(true);
    } catch (e) { setErreur(e instanceof Error ? e.message : "Calendrier indisponible."); }
    finally { setAttente(false); }
  }
  return <Box sx={{ px: 2, py: 1 }}>
    <Button disabled={attente} onClick={ouvrir} aria-expanded={ouvert}>{ouvert ? "Fermer le calendrier de facturation" : "Calendrier de facturation"}</Button>
    {erreur && <Alert severity="error">{erreur}</Alert>}
    {ouvert && donnees && <CalendrierFacturation organisationId={organisationId} initial={donnees} modifiable={modifiable} />}
  </Box>;
}
