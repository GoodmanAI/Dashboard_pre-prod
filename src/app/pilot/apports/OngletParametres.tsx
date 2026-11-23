"use client";

import { useState, type ReactNode } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Card, FormControlLabel, Link, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";
import { IconDownload, IconPlus, IconTrash, IconUpload } from "@tabler/icons-react";
import { Bloc } from "@/pilot/components/Bloc";
import { envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { euros, eurosCourts } from "@/pilot/lib/argent";
import { jourFr, pourcentage, prixHt, versTtc, type Moteur } from "@/pilot/lib/apports/calcul";
import type { ApporteurDonnees, DonneesApports } from "@/pilot/lib/apports/charger";
import type { RapportImportCalculateur } from "@/pilot/lib/apports/importer";
import { avisGrille } from "@/pilot/lib/apports/prix";
import { MODES_INSTALLATION } from "@/pilot/lib/apports/referentiel";
import type { Droits } from "./ApportsAffaires";
import { ChampEnLigne, lireEuros, lirePourcent, saisiePourcent, useSauvegarde } from "./commun";

const GRILLE = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 2.5 } as const;

export function OngletParametres({ donnees: d, moteur, droits }: { donnees: DonneesApports; moteur: Moteur; droits: Droits }) {
  const { enregistrer } = useSauvegarde();
  const [erreur, setErreur] = useState<string | null>(null);
  const p = d.parametres, ro = !droits.montants;
  const regler = (champs: Record<string, unknown>) => { setErreur(null); return enregistrer("/api/pilot/apports/parametres", "PATCH", champs); };
  const euro = (cle: keyof typeof p, libelle: string) => <ChampEnLigne size="small" label={libelle} valeur={eurosCourts(p[cle] as number)} desactive={ro}
    inputProps={{ inputMode: "decimal" }} enregistrer={(v) => { const c = lireEuros(v); if (c === null) setErreur(`Vérifiez le champ « ${libelle} ».`); else void regler({ [cle]: c }); }} />;
  const taux = (cle: keyof typeof p, libelle: string) => <ChampEnLigne size="small" label={libelle} valeur={saisiePourcent(p[cle] as number)} desactive={ro}
    inputProps={{ inputMode: "decimal" }} enregistrer={(v) => { const c = lirePourcent(v); if (c === null || c > 10000) setErreur(`Vérifiez le champ « ${libelle} ».`); else void regler({ [cle]: c }); }} />;
  const entier = (cle: keyof typeof p, libelle: string, min: number, max: number) => <ChampEnLigne size="small" type="number" label={libelle} valeur={String(p[cle])} desactive={ro}
    inputProps={{ min, max, step: 1 }} enregistrer={(v) => { const n = Number(v); if (!Number.isInteger(n) || n < min || n > max) setErreur(`« ${libelle} » : un nombre entier de ${min} à ${max}.`); else void regler({ [cle]: n }); }} />;
  const texte = (cle: keyof typeof p, libelle: string) => <ChampEnLigne size="small" label={libelle} valeur={String(p[cle] ?? "")} desactive={ro} enregistrer={(v) => regler({ [cle]: v })} />;
  const bascule = (cle: keyof typeof p, libelle: string) => <FormControlLabel label={libelle} disabled={ro}
    control={<Switch checked={Boolean(p[cle])} onChange={(e) => regler({ [cle]: e.target.checked })} />} />;
  const prix = moteur.parametres.prix, u = prixHt(moteur.parametres), avis = avisGrille(d.grille);

  return <Stack spacing={2.5}>
    {erreur && <Alert severity="warning" onClose={() => setErreur(null)}>{erreur}</Alert>}
    {ro && <Alert severity="info">Réglages en lecture seule pour votre rôle.</Alert>}
    <Card sx={{ p: { xs: 2, sm: 2.75 } }}>
      <Box sx={GRILLE}>
        <Groupe titre="Prix">
          <Typography variant="body2">
            Les prix viennent de la grille tarifaire en vigueur, <Link component={NextLink} href="/pilot/tarifs">page Tarifs</Link>.
          </Typography>
          {avis && <Alert severity="warning">{avis}</Alert>}
          {d.grille.id !== null && <Box component="ul" sx={{ m: 0, pl: 2.5, color: "text.secondary", fontSize: 14, "& li": { mb: 0.25 } }}>
            <li>Grille applicable depuis le {jourFr(d.grille.applicableLe)}.</li>
            <li>Talk {euros(u.talk)} HT et Konnect {euros(u.konnect)} HT par salle et par mois.</li>
            <li>Connecteur RIS : {pourcentage(prix.connecteurRisPdm)} du montant des salles.</li>
            <li>Installation et formation : Talk {euros(prix.installationTalk.ttcCentimes)} TTC {MODES_INSTALLATION[prix.installationTalk.mode]}, Konnect {euros(prix.installationKonnect.ttcCentimes)} TTC {MODES_INSTALLATION[prix.installationKonnect.mode]}.</li>
          </Box>}
          {taux("tvaPdm", "TVA des montants TTC affichés, %")}
        </Groupe>
        <Groupe titre="Paliers de commission">
          {euro("seuil1Centimes", "Palier 1 jusqu'à, € HT par mois")}
          {euro("seuil2Centimes", "Palier 2 jusqu'à, € HT par mois")}
          {taux("taux1Pdm", "Taux palier 1, %")}
          {taux("taux2Pdm", "Taux palier 2, %")}
          {taux("taux3Pdm", "Taux palier 3, %")}
          {euro("autresClientsCentimes", "Autres clients apportés hors outil, € HT par mois")}
        </Groupe>
        <Groupe titre="Calendrier et prévisionnel">
          {entier("delaiEncaissementMois", "Délai entre installation et 1er encaissement, mois", 0, 24)}
          {entier("dureeCommissionMois", "Durée de commission par client, mois (0 : tant qu'actif)", 0, 240)}
          {entier("horizonMois", "Horizon du suivi, mois à venir", 3, 48)}
          {bascule("inclureValidees", "Inclure les commandes validées")}
          {bascule("inclureBcEnvoyes", "Inclure les bons de commande envoyés")}
          {bascule("inclureProspects", "Inclure les prospects datés")}
        </Groupe>
        <Groupe titre="Facturation">
          {texte("clientNom", "Client facturé")}
          {texte("clientAdresse", "Adresse du client")}
          {texte("clientRcs", "RCS du client")}
          {taux("tvaFacturePdm", "TVA sur commission, %")}
          {entier("delaiPaiementJours", "Délai de paiement, jours", 0, 120)}
          <Typography variant="caption" color="text.secondary">L&apos;identité de facturation de chaque apporteur (raison sociale, SIRET, préfixe de numérotation) se règle plus bas, sur sa fiche.</Typography>
        </Groupe>
      </Box>
    </Card>

    <Bloc titre="Types de prestataires">
      <Box sx={{ px: 2.75, pb: 2.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Liste proposée dans la zone « Prestataires » de chaque groupe. Un type par ligne ; l&apos;ordre est celui du menu.</Typography>
        <ChampEnLigne multiligne fullWidth label="Types" valeur={p.typesPrestataires.join("\n")} desactive={ro} sx={{ maxWidth: 420 }}
          enregistrer={(v) => regler({ typesPrestataires: [...new Set(v.split("\n").map((s) => s.trim()).filter(Boolean))] })} />
      </Box>
    </Bloc>

    <Apporteurs d={d} moteur={moteur} ro={ro} regler={regler} />

    <Sauvegarde droits={droits} />

    <Bloc titre="Règles appliquées">
      <Box component="ul" sx={{ m: 0, pl: 5, pr: 2.75, pb: 2.5, color: "text.secondary", fontSize: 14, "& li": { mb: 0.5 } }}>
        <li>Prix de la grille tarifaire en vigueur, hors taxe (Talk et Konnect : {euros(u.talk + u.konnect)} HT, soit {euros(versTtc(u.talk + u.konnect, p))} TTC par salle et par mois).</li>
        <li>Taux déterminé chaque mois sur le portefeuille récurrent HT des clients actifs, appliqué à la totalité des encaissements du mois : {pourcentage(p.taux1Pdm)} jusqu&apos;à {euros(p.seuil1Centimes)}, {pourcentage(p.taux2Pdm)} jusqu&apos;à {euros(p.seuil2Centimes)}, {pourcentage(p.taux3Pdm)} au-delà (plan, art. 2 et 3).</li>
        <li>Assiette : abonnements Talk et Konnect encaissés. Connecteur RIS, installation et formation exclus (plan, art. 4).</li>
        <li>Dans le prévisionnel, les groupes à venir relèvent le taux de tout le portefeuille : la ligne « Socle sécurisé » montre la commission sans aucune nouvelle installation.</li>
        <li>Seuls les prospects validés par écrit par Neuracorp AI ouvrent droit à commission (plan, art. 5).</li>
        <li>Un groupe apporté est un client de Pilot : ses sites, contacts et notes sont ceux de la fiche client.</li>
      </Box>
    </Bloc>
  </Stack>;
}

function Groupe({ titre, children }: { titre: string; children: ReactNode }) {
  return <Stack spacing={1.5} sx={{ minWidth: 0 }}><Typography variant="h3">{titre}</Typography>{children}</Stack>;
}

function Apporteurs({ d, moteur, ro, regler }: { d: DonneesApports; moteur: Moteur; ro: boolean; regler: (c: Record<string, unknown>) => Promise<unknown> }) {
  const { enregistrer } = useSauvegarde();
  return <Bloc titre="Apporteurs d'affaires" nombre={d.apporteurs.length} entete={!ro && <Button startIcon={<IconPlus size={18} />} onClick={() => enregistrer("/api/pilot/apporteurs", "POST", { nom: "Nouvel apporteur" })}>Ajouter un apporteur</Button>}>
    <Stack spacing={2} sx={{ px: { xs: 1.5, sm: 2.75 }, pb: 2.5 }}>
      <Typography variant="body2" color="text.secondary">Chaque groupe est affecté à un apporteur et peut avoir un co-apporteur avec une répartition du chiffre d&apos;affaires. Le taux de commission se calcule sur le portefeuille propre de chaque apporteur.</Typography>
      {d.apporteurs.length > 0 && <TextField select size="small" label="Apporteur par défaut des nouveaux groupes" value={moteur.defaut || ""} disabled={ro} sx={{ maxWidth: 360 }}
        onChange={(e) => regler({ apporteurParDefautId: Number(e.target.value) })}>
        {d.apporteurs.map((a) => <MenuItem key={a.id} value={a.id}>{a.nom}</MenuItem>)}
      </TextField>}
      {d.apporteurs.map((a) => <FicheApporteur key={a.id} a={a} defaut={a.id === moteur.defaut} ro={ro} />)}
      {!d.apporteurs.length && <Typography color="text.secondary">Aucun apporteur. Ajoutez-en un, ou importez les données du calculateur.</Typography>}
    </Stack>
  </Bloc>;
}

function FicheApporteur({ a, defaut, ro }: { a: ApporteurDonnees; defaut: boolean; ro: boolean }) {
  const { enregistrer } = useSauvegarde();
  const url = `/api/pilot/apporteurs/${a.id}`;
  const champ = (cle: keyof ApporteurDonnees, libelle: string, placeholder?: string) => <ChampEnLigne size="small" label={libelle} placeholder={placeholder}
    valeur={(a[cle] as string | null) ?? ""} desactive={ro} enregistrer={(v) => (cle !== "nom" || v.trim()) && enregistrer(url, "PATCH", { [cle]: v })} />;
  return <Card variant="outlined" sx={{ p: 2 }}>
    <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} alignItems="center" sx={{ mb: 1.5 }}>
      <Typography fontWeight={600}>{a.nom}</Typography>
      {defaut && <Typography variant="caption" color="primary.main" fontWeight={600}>par défaut</Typography>}
      <Typography variant="caption" color="text.secondary">{a.groupes} groupe{a.groupes > 1 ? "s" : ""}{a.factures ? `, ${a.factures} facture${a.factures > 1 ? "s" : ""}` : ""}</Typography>
      <FormControlLabel sx={{ ml: "auto" }} label="Commissionné" disabled={ro} control={<Switch checked={a.commissionne} onChange={(e) => enregistrer(url, "PATCH", { commissionne: e.target.checked })} />} />
      {!ro && !a.groupes && !a.factures && <Button color="error" size="small" startIcon={<IconTrash size={16} />} onClick={() => enregistrer(url, "DELETE")}>Retirer</Button>}
    </Stack>
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 1.5 }}>
      {champ("nom", "Nom (représentant)")}
      {champ("structure", "Structure (raison sociale)")}
      {champ("telephone", "Téléphone")}
      {champ("email", "Email")}
      {champ("adresse", "Adresse")}
      {champ("siret", "SIRET")}
      {champ("rcs", "RCS")}
      {champ("tvaIntracom", "N° TVA intracommunautaire")}
      {champ("prefixeFacture", "Préfixe des factures", "ENT-NEU-")}
      {champ("mention", "Mention complémentaire")}
    </Box>
  </Card>;
}

/** Sauvegarde de secours, et import des données du calculateur des apporteurs. */
function Sauvegarde({ droits }: { droits: Droits }) {
  const router = useRouter();
  const [texte, setTexte] = useState("");
  const [rapport, setRapport] = useState<RapportImportCalculateur | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  if (!droits.exporter) return <Bloc titre="Sauvegarde et import" vide="La sauvegarde et l'import des données du calculateur sont réservés au super-administrateur." />;
  async function lancer(essai: boolean) {
    setEnvoi(true); setErreur(null);
    try {
      const r = await envoyer<{ rapport: RapportImportCalculateur }>("/api/pilot/apports/import", "POST", undefined, { donnees: texte, essai });
      setRapport(r.rapport);
      if (!essai) { setTexte(""); router.refresh(); }
    } catch (e) { setErreur(e instanceof Error ? e.message : "L'import a échoué."); setRapport(null); }
    finally { setEnvoi(false); }
  }
  return <Bloc titre="Sauvegarde et import" entete={<Button component="a" href="/api/pilot/apports/export" startIcon={<IconDownload size={18} />}>Télécharger la sauvegarde (.json)</Button>}>
    <Stack spacing={1.5} sx={{ px: { xs: 1.5, sm: 2.75 }, pb: 2.5 }}>
      <Typography variant="body2" color="text.secondary">
        La sauvegarde reprend le format du calculateur : apporteurs, réglages, groupes, sites, salles et factures. Pour reprendre les données du calculateur, collez ci-dessous le texte de son bouton « Copier toutes les données », ou choisissez son fichier .json. Vérifiez d&apos;abord : rien n&apos;est écrit tant que vous n&apos;avez pas confirmé.
      </Typography>
      <TextField multiline minRows={4} maxRows={12} value={texte} onChange={(e) => { setTexte(e.target.value); setRapport(null); }} placeholder='{"version":2,"params":…,"groups":…,"invoices":…}'
        inputProps={{ spellCheck: false, "aria-label": "Sauvegarde du calculateur", style: { fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 12 } }} />
      <Stack direction="row" flexWrap="wrap" useFlexGap gap={1}>
        <Button component="label" startIcon={<IconUpload size={18} />}>Choisir un fichier .json
          <input hidden type="file" accept="application/json,.json" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            if (f.size > 5 * 1024 * 1024) { setErreur("Fichier trop lourd : 5 Mo au plus."); return; }
            setTexte(await f.text()); setRapport(null); e.target.value = "";
          }} />
        </Button>
        <Button variant="outlined" disabled={!texte.trim() || envoi} onClick={() => lancer(true)}>Vérifier</Button>
        <Button variant="contained" disabled={!rapport?.essai || envoi} onClick={() => lancer(false)}>Importer</Button>
      </Stack>
      {erreur && <Alert severity="error">{erreur}</Alert>}
      {rapport && <Alert severity={rapport.essai ? "info" : "success"}>
        <Typography fontWeight={600} fontSize={14} sx={{ mb: 0.5 }}>{rapport.essai ? "Vérification : voici ce que l'import ferait." : "Import terminé."}</Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          <li>Apporteurs : {rapport.apporteurs.crees} créé{rapport.apporteurs.crees > 1 ? "s" : ""}, {rapport.apporteurs.retrouves} retrouvé{rapport.apporteurs.retrouves > 1 ? "s" : ""}</li>
          <li>Groupes : {rapport.groupes.crees} nouveau{rapport.groupes.crees > 1 ? "x" : ""} client{rapport.groupes.crees > 1 ? "s" : ""}, {rapport.groupes.rattaches} rattaché{rapport.groupes.rattaches > 1 ? "s" : ""} à un client existant, {rapport.groupes.dejaImportes} déjà importé{rapport.groupes.dejaImportes > 1 ? "s" : ""}, {rapport.groupes.ignores} écarté{rapport.groupes.ignores > 1 ? "s" : ""}</li>
          <li>{rapport.sites} site{rapport.sites > 1 ? "s" : ""}, {rapport.salles} salle{rapport.salles > 1 ? "s" : ""}, {rapport.contacts} interlocuteur{rapport.contacts > 1 ? "s" : ""}, {rapport.prestataires} prestataire{rapport.prestataires > 1 ? "s" : ""}</li>
          <li>Factures : {rapport.factures.importees} reprise{rapport.factures.importees > 1 ? "s" : ""}, {rapport.factures.ignorees} écartée{rapport.factures.ignorees > 1 ? "s" : ""}</li>
          <li>Réglages : {rapport.parametres ? "repris" : "inchangés"}</li>
        </Box>
        {rapport.avertissements.length > 0 && <>
          <Typography fontWeight={600} fontSize={13} sx={{ mt: 1 }}>À vérifier</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>{rapport.avertissements.slice(0, 30).map((a, i) => <li key={i}>{a}</li>)}</Box>
          {rapport.avertissements.length > 30 && <Typography variant="caption">Et {rapport.avertissements.length - 30} autres.</Typography>}
        </>}
      </Alert>}
    </Stack>
  </Bloc>;
}
