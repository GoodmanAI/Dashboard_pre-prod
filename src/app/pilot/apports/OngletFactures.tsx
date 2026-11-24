"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Box, Button, Card, Chip, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { IconCopy, IconFileDownload, IconPrinter } from "@tabler/icons-react";
import { Bloc } from "@/pilot/components/Bloc";
import { euros, eurosCourts, eurosPrecis } from "@/pilot/lib/argent";
import { ajouterJours, ajouterMois, jourFr, libelleMois, pourcentage, type Moteur, type Vue } from "@/pilot/lib/apports/calcul";
import type { DonneesApports } from "@/pilot/lib/apports/charger";
import { texteFacture } from "@/pilot/lib/apports/documents";
import { de } from "@/pilot/lib/apports/referentiel";
import { JETONS } from "@/pilot/jetons";
import type { Droits } from "./ApportsAffaires";
import { ChampEnLigne, lireEuros, PastilleFacture, urlDocument, useSauvegarde } from "./commun";

const TABLEAU = { tableLayout: "fixed", "& td, & th": { px: { xs: 0.75, sm: 1.25 }, overflowWrap: "anywhere", fontSize: 13, fontVariantNumeric: "tabular-nums" },
  "& th": { fontSize: 12, overflowWrap: "normal", hyphens: "auto" } } as const;
const MOYENNE = { display: { xs: "none", md: "table-cell" } };
const SECONDAIRE = { display: { xs: "none", lg: "table-cell" } };
const PETITE = { display: { xs: "none", sm: "table-cell" } };
const TRES_LARGE = { display: { xs: "none", xl: "table-cell" } };

export function OngletFactures({ donnees: d, moteur, vue, droits, aller }: {
  donnees: DonneesApports; moteur: Moteur; vue: Vue; droits: Droits; aller: (c: Record<string, string | null>) => void;
}) {
  const recherche = useSearchParams()!;
  if (vue !== "tous" && !moteur.commissionne(vue)) return <Card sx={{ p: 4, textAlign: "center" }}>
    <Typography variant="h2" sx={{ mb: 1 }}>{moteur.apporteur(vue)?.nom} n&apos;est pas commissionné</Typography>
    <Typography color="text.secondary">Aucune facture d&apos;apport d&apos;affaires pour cet intervenant.</Typography>
  </Card>;
  const choisi = Number(recherche.get("facturant"));
  const facturant = vue !== "tous" ? vue : moteur.commissionne(choisi) ? choisi : moteur.commissionne(moteur.defaut) ? moteur.defaut : moteur.commissionnes[0]?.id;
  if (!facturant) return <Card sx={{ p: 4, textAlign: "center" }}><Typography color="text.secondary">Aucun apporteur commissionné. Ajoutez-en un dans les Réglages.</Typography></Card>;
  const nom = moteur.apporteur(facturant)?.nom ?? "";
  const selecteur = vue === "tous" && <TextField select size="small" label="Apporteur facturant" value={facturant} sx={{ minWidth: 240 }}
    onChange={(e) => aller({ facturant: e.target.value, mois: null })}>
    {moteur.commissionnes.map((a) => <MenuItem key={a.id} value={a.id}>{a.nom}{a.structure ? ` (${a.structure})` : ""}</MenuItem>)}
  </TextField>;
  const mois = moteur.moisFacturables(facturant);
  if (!mois.length) return <Stack spacing={2}>
    {selecteur && <Box>{selecteur}</Box>}
    <Card sx={{ p: 4, textAlign: "center" }}>
      <Typography variant="h2" sx={{ mb: 1 }}>Aucune facture pour {nom}</Typography>
      <Typography color="text.secondary">Les factures apparaissent dès qu&apos;un groupe de cet apporteur a une date de commande installée. Le premier mois facturable est le mois d&apos;encaissement qui suit, à terme échu.</Typography>
    </Card>
  </Stack>;
  const demande = recherche.get("mois");
  const ouvert = demande && mois.includes(demande) ? demande
    : mois.find((m) => moteur.statutFacture(m, facturant) === "a_emettre" && moteur.calculFacture(m, facturant).commissionCentimes > 0) ?? mois[0];

  return <Stack spacing={2.5}>
    <Bloc titre={`Factures mensuelles ${de(nom)} à ${d.parametres.clientNom.replace(/, SAS$/, "")}`} entete={selecteur || undefined}>
      <Typography variant="body2" color="text.secondary" sx={{ px: 2.75, pb: 1 }}>Une facture par mois civil, émise à terme échu sur les montants encaissés auprès des groupes installés. Choisissez une ligne pour la préparer.</Typography>
      <Box sx={{ px: { xs: 0.5, sm: 1.5 }, pb: 2 }}>
        <Table size="small" sx={TABLEAU}>
          <TableHead><TableRow>
            <TableCell sx={{ width: { xs: "38%", sm: "24%", lg: "18%" } }}>Mois d&apos;encaissement</TableCell><TableCell>Statut</TableCell><TableCell sx={MOYENNE}>N°</TableCell>
            <TableCell align="right" sx={PETITE}>Base HT</TableCell><TableCell align="right" sx={SECONDAIRE}>Taux</TableCell>
            <TableCell align="right" sx={MOYENNE}>Commission HT</TableCell><TableCell align="right">TTC</TableCell>
            <TableCell sx={SECONDAIRE}>Émise le</TableCell><TableCell sx={SECONDAIRE}>Échéance</TableCell><TableCell sx={SECONDAIRE}>Payée le</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {mois.map((m) => {
              const st = moteur.statutFacture(m, facturant), f = moteur.calculFacture(m, facturant), x = moteur.facture(facturant, m);
              return <TableRow key={m} hover selected={m === ouvert} tabIndex={0} sx={{ cursor: "pointer" }} onClick={() => aller({ mois: m })}
                onKeyDown={(e) => { if (e.key === "Enter") aller({ mois: m }); }} aria-label={`Facture ${de(libelleMois(m, true))}`}>
                <TableCell sx={{ fontWeight: 600 }}>{libelleMois(m, true)}</TableCell>
                <TableCell><PastilleFacture statut={st} /></TableCell>
                <TableCell sx={MOYENNE}>{x?.numero ?? ""}</TableCell>
                <TableCell align="right" sx={PETITE}>{euros(f.baseCentimes)}</TableCell>
                <TableCell align="right" sx={SECONDAIRE}>{pourcentage(f.tauxPdm)}</TableCell>
                <TableCell align="right" sx={MOYENNE}>{eurosPrecis(f.commissionCentimes)}</TableCell>
                <TableCell align="right">{eurosPrecis(f.ttcCentimes)}</TableCell>
                <TableCell sx={SECONDAIRE}>{jourFr(x?.emiseLe)}</TableCell>
                <TableCell sx={SECONDAIRE}>{jourFr(x?.echeanceLe)}</TableCell>
                <TableCell sx={SECONDAIRE}>{jourFr(x?.payeeLe)}</TableCell>
              </TableRow>;
            })}
          </TableBody>
        </Table>
      </Box>
    </Bloc>
    <DetailFacture key={`${facturant}-${ouvert}`} d={d} moteur={moteur} apporteurId={facturant} mois={ouvert} modifiable={droits.montants}
      fixer={() => { if (demande !== ouvert) aller({ mois: ouvert }); }} />
  </Stack>;
}

function DetailFacture({ d, moteur, apporteurId, mois, modifiable, fixer }: { d: DonneesApports; moteur: Moteur; apporteurId: number; mois: string; modifiable: boolean; fixer: () => void }) {
  const { enregistrer } = useSauvegarde();
  const [message, setMessage] = useState<string | null>(null);
  const st = moteur.statutFacture(mois, apporteurId), f = moteur.calculFacture(mois, apporteurId), x = moteur.facture(apporteurId, mois);
  const fige = f.fige, passe = mois < d.moisCourant;
  const prefixe = moteur.apporteur(apporteurId) ? d.apporteurs.find((a) => a.id === apporteurId)?.prefixeFacture ?? "" : "";
  const numeroDefaut = `${prefixe}${mois}`;
  const agir = (action: string, extra: object = {}) => { fixer(); return enregistrer("/api/pilot/apports/factures", "POST", { apporteurId, mois, action, ...extra }); };
  const ro = !modifiable;
  const premierJour = `${ajouterMois(mois, 1)}-01`;
  const lignesTotal = f.lignes.reduce((t, l) => ({ sites: t.sites + l.sites, salles: t.salles + l.salles }), { sites: 0, salles: 0 });

  return <Bloc titre={`Facture ${de(libelleMois(mois, true))}`} entete={<PastilleFacture statut={st} />}>
    <Stack spacing={2} sx={{ px: { xs: 1.5, sm: 2.75 }, pb: 2.5 }}>
      {!passe && <Alert severity="info">Mois en cours : la facture pourra être émise à partir du {jourFr(premierJour)}. Les montants affichés sont provisoires.</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 340px" }, gap: 2.5, alignItems: "start" }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h3" sx={{ mb: 0.5 }}>Encaissements HT par groupe</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{fige ? "Facture émise : les montants sont figés." : "Montants du groupe entier, la part de l'apporteur s'applique ensuite. Par défaut, l'abonnement théorique ; saisissez le montant réellement encaissé s'il diffère (remise, impayé, prorata)."}</Typography>
          <Table size="small" sx={TABLEAU}>
            <TableHead><TableRow>
              <TableCell sx={{ width: { xs: "34%", md: "26%" } }}>Groupe</TableCell><TableCell sx={TRES_LARGE}>Talk</TableCell><TableCell sx={TRES_LARGE}>Konnect</TableCell>
              <TableCell align="right" sx={SECONDAIRE}>Sites</TableCell><TableCell align="right" sx={SECONDAIRE}>Salles</TableCell>
              <TableCell align="right" sx={PETITE} title="Abonnement théorique du groupe entier">Théorique</TableCell><TableCell align="right" title="Encaissé auprès du groupe entier">Encaissé</TableCell><TableCell align="right">Commission</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {f.lignes.map((l) => {
                const saisi = x?.encaissements?.[String(l.organisationId)];
                return <TableRow key={l.organisationId}>
                  <TableCell>{l.nom}</TableCell>
                  <TableCell sx={TRES_LARGE}><OuiNon v={l.talk} /></TableCell><TableCell sx={TRES_LARGE}><OuiNon v={l.konnect} /></TableCell>
                  <TableCell align="right" sx={SECONDAIRE}>{l.sites}</TableCell><TableCell align="right" sx={SECONDAIRE}>{l.salles}</TableCell>
                  <TableCell align="right" sx={PETITE}>{eurosPrecis(l.theoriqueCentimes)}</TableCell>
                  <TableCell align="right">{fige || ro ? eurosPrecis(l.baseCentimes) :
                    <ChampEnLigne size="small" valeur={typeof saisi === "number" ? eurosCourts(saisi) : ""} placeholder={eurosCourts(l.theoriqueCentimes)}
                      inputProps={{ inputMode: "decimal", "aria-label": `Encaissé, ${l.nom}`, style: { textAlign: "right" } }} sx={{ maxWidth: 130 }}
                      enregistrer={(v) => {
                        const c = v.trim() === "" ? null : lireEuros(v);
                        if (v.trim() !== "" && c === null) { setMessage("Montant illisible : saisissez par exemple 350 ou 350,50."); return; }
                        setMessage(null);
                        void agir("encaissement", { organisationId: l.organisationId, centimes: c });
                      }} />}</TableCell>
                  <TableCell align="right">{eurosPrecis(l.commissionCentimes)}</TableCell>
                </TableRow>;
              })}
              {!f.lignes.length && <TableRow><TableCell colSpan={8} sx={{ color: "text.secondary" }}>Aucun groupe facturé ce mois.</TableCell></TableRow>}
              <TableRow sx={{ "& td": { fontWeight: 700, bgcolor: JETONS.gris } }}>
                <TableCell>Total</TableCell><TableCell sx={TRES_LARGE} /><TableCell sx={TRES_LARGE} />
                <TableCell align="right" sx={SECONDAIRE}>{lignesTotal.sites}</TableCell><TableCell align="right" sx={SECONDAIRE}>{lignesTotal.salles}</TableCell>
                <TableCell sx={PETITE} /><TableCell align="right">{eurosPrecis(f.baseCentimes)}</TableCell><TableCell align="right">{eurosPrecis(f.commissionCentimes)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Taux {pourcentage(f.tauxPdm)} déterminé sur un portefeuille récurrent de {euros(f.portefeuilleCentimes)} HT{d.parametres.autresClientsCentimes && apporteurId === moteur.defaut ? " (dont autres clients)" : ""}.</Typography>
          {message && <Alert severity="warning" sx={{ mt: 1 }}>{message}</Alert>}
        </Box>

        <Stack spacing={1.5}>
          <Card variant="outlined" sx={{ p: 2 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>Montant à facturer</Typography>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline"><span>Commission HT</span><Typography sx={{ fontSize: 22, fontWeight: 700 }}>{eurosPrecis(f.commissionCentimes)}</Typography></Stack>
            <Stack direction="row" justifyContent="space-between"><span>TVA {pourcentage(d.parametres.tvaFacturePdm)}</span><span>{eurosPrecis(f.tvaCentimes)}</span></Stack>
            <Stack direction="row" justifyContent="space-between" sx={{ fontWeight: 700 }}><span>Total TTC</span><span>{eurosPrecis(f.ttcCentimes)}</span></Stack>
          </Card>
          <ChampEnLigne size="small" label="N° de facture" placeholder={numeroDefaut} valeur={x?.numero} desactive={ro || fige} enregistrer={(v) => agir("modifier", { numero: v })} />
          <ChampEnLigne size="small" type="date" label="Date d'émission" valeur={x?.emiseLe} desactive={ro || fige} enregistrer={(v) => agir("modifier", { emiseLe: v })} />
          {fige && <>
            <Typography variant="body2">Échéance : <b>{jourFr(x?.echeanceLe) || (x?.emiseLe ? jourFr(ajouterJours(x.emiseLe, d.parametres.delaiPaiementJours)) : "")}</b></Typography>
            <ChampEnLigne size="small" type="date" label="Payée le" valeur={x?.payeeLe} desactive={ro} enregistrer={(v) => agir("modifier", { payeeLe: v })} />
          </>}
          <Stack direction="row" flexWrap="wrap" useFlexGap gap={1}>
            {!ro && !fige && passe && f.commissionCentimes > 0 && <Button variant="contained" onClick={() => agir("emettre")}>Marquer émise</Button>}
            {!ro && fige && st !== "payee" && <Button variant="contained" onClick={() => agir("payer")}>Marquer payée</Button>}
            {!ro && fige && <Button onClick={() => agir("rouvrir")}>Rouvrir</Button>}
            <Button component="a" href={urlDocument("facture", { apporteur: apporteurId, mois, telecharger: 1 })} startIcon={<IconFileDownload size={16} />}>Télécharger (.html)</Button>
            <Button component="a" href={urlDocument("facture", { apporteur: apporteurId, mois, imprimer: 1 })} target="_blank" rel="noopener" startIcon={<IconPrinter size={16} />}>Imprimer ou PDF</Button>
            <Button startIcon={<IconCopy size={16} />} onClick={async () => {
              try { await navigator.clipboard.writeText(texteFacture(d, apporteurId, mois)); setMessage("Détail copié."); }
              catch { setMessage("Copie refusée par le navigateur."); }
            }}>Copier le détail</Button>
          </Stack>
        </Stack>
      </Box>
    </Stack>
  </Bloc>;
}

function OuiNon({ v }: { v: string }) {
  if (!v) return null;
  return <Chip size="small" label={v} color={v === "Oui" ? "success" : v === "Non" ? "default" : "warning"} />;
}
