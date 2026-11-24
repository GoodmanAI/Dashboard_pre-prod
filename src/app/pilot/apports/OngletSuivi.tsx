"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Alert, Box, Button, Card, IconButton, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography, useMediaQuery, useTheme } from "@mui/material";
import { IconChevronLeft, IconChevronRight, IconFileDownload, IconFileSpreadsheet, IconPrinter } from "@tabler/icons-react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { Bloc } from "@/pilot/components/Bloc";
import { euros } from "@/pilot/lib/argent";
import { ajouterMois, libelleMois, palierPour, pourcentage, statutCommande, type CalculMois, type GroupeCalcul, type Moteur, type Vue } from "@/pilot/lib/apports/calcul";
import type { DonneesApports } from "@/pilot/lib/apports/charger";
import { JETONS, TEINTES } from "@/pilot/jetons";
import { Point } from "./ApportsAffaires";
import { PastilleFacture, PastilleStatut, urlDocument } from "./commun";
import { Carre } from "./OngletGroupes";

const TABLEAU = { tableLayout: "fixed", "& td, & th": { px: { xs: 0.75, sm: 1.25 }, overflowWrap: "anywhere", fontSize: 13, fontVariantNumeric: "tabular-nums" },
  "& th": { fontSize: 12, overflowWrap: "normal", hyphens: "auto" } } as const;
const MOYENNE = { display: { xs: "none", md: "table-cell" } };
const SECONDAIRE = { display: { xs: "none", lg: "table-cell" } };
const PETITE = { display: { xs: "none", sm: "table-cell" } };
const GRADUATION = { fontSize: 11, fill: JETONS.secondaire };

export function OngletSuivi({ donnees: d, moteur, vue }: { donnees: DonneesApports; moteur: Moteur; vue: Vue }) {
  const mois = useMemo(() => moteur.moisAffiches(), [moteur]);
  const calculs = useMemo(() => mois.map((m) => moteur.calculMois(m, vue)), [moteur, mois, vue]);
  const courant = d.moisCourant;
  const placeG = moteur.groupes.filter((g) => moteur.calendrier(g)?.nature === "place" && moteur.calcul(g).recurrent > 0);
  const venirG = moteur.groupes.filter((g) => moteur.calendrier(g)?.nature === "venir" && moteur.calcul(g).recurrent > 0);
  const sansDate = moteur.groupes.filter((g) => !g.commandeInstalleeLe && statutCommande(g) !== "prospect" && !g.deploiementPrevuLe && moteur.dansVue(g, vue));
  const facture = vue !== "tous" && moteur.commissionne(vue);
  const libelleVue = vue === "tous" ? "Tous les apporteurs" : moteur.apporteur(vue)?.nom ?? "";
  const p = moteur.parametres;

  return <Stack spacing={2.5}>
    <Bloc titre="Commission mensuelle, réalisé et prévisionnel" entete={<Stack direction="row" flexWrap="wrap" useFlexGap gap={2} sx={{ fontSize: 13, color: "text.secondary" }}>
      <span><Carre couleur={TEINTES.menthe} />Groupes en place</span><span><Carre couleur={TEINTES.orange} opacite={0.55} />Groupes à venir</span>
    </Stack>}>
      <Box sx={{ height: 280, px: { xs: 0.5, sm: 2 }, pb: 2 }}><Graphique mois={mois} calculs={calculs} courant={courant} /></Box>
    </Bloc>

    {sansDate.length > 0 && <Alert severity="warning">
      {sansDate.length} groupe{sansDate.length > 1 ? "s" : ""} avec bon de commande envoyé ou commande validée sans date d&apos;installation prévue, donc absent{sansDate.length > 1 ? "s" : ""} du prévisionnel : {sansDate.map((g) => g.nom).join(", ")}.
    </Alert>}

    <Bloc titre={`Mois par mois, ${libelleVue}`} entete={<Stack direction="row" flexWrap="wrap" useFlexGap gap={0.5}>
      <Button size="small" component="a" href={urlDocument("synthese-commissions", { apporteur: vue, telecharger: 1 })} startIcon={<IconFileDownload size={16} />}>Synthèse (HTML)</Button>
      <Button size="small" component="a" href={urlDocument("synthese-commissions", { apporteur: vue, imprimer: 1 })} target="_blank" rel="noopener" startIcon={<IconPrinter size={16} />}>Imprimer ou PDF</Button>
      <Button size="small" component="a" href={`/api/pilot/apports/suivi.csv?apporteur=${vue}`} startIcon={<IconFileSpreadsheet size={16} />}>Exporter en CSV</Button>
    </Stack>}>
      <Typography variant="body2" color="text.secondary" sx={{ px: 2.75, pb: 1 }}>
        Les mois passés sont du réalisé : montants théoriques, ou montants encaissés saisis dans l&apos;onglet Factures. Les mois futurs, en italique sur fond gris, sont prévisionnels. Premier encaissement {p.delaiEncaissementMois} mois après l&apos;installation{p.dureeCommissionMois > 0 ? `, commission versée ${p.dureeCommissionMois} mois par client` : ", commission versée tant que le client reste actif"}.
      </Typography>
      <Box sx={{ px: { xs: 0.5, sm: 1.5 }, pb: 2 }}>
        <Table size="small" sx={TABLEAU}>
          <TableHead><TableRow>
            <TableCell sx={{ width: 90 }}>Mois</TableCell>
            <TableCell align="right">Encaissé en place</TableCell>
            <TableCell align="right" sx={MOYENNE}>Encaissé à venir</TableCell>
            <TableCell align="right" sx={SECONDAIRE}>Portefeuille HT{p.autresClientsCentimes ? " (avec autres clients)" : ""}</TableCell>
            <TableCell align="right" sx={PETITE}>Taux</TableCell>
            <TableCell align="right" sx={MOYENNE}>Commission en place</TableCell>
            <TableCell align="right" sx={MOYENNE}>Commission à venir</TableCell>
            <TableCell align="right">Commission totale HT</TableCell>
            <TableCell align="right" sx={SECONDAIRE} title="Commission si aucune nouvelle commande n'est installée">Socle sécurisé</TableCell>
            {facture && <TableCell sx={PETITE}>Facture</TableCell>}
          </TableRow></TableHead>
          <TableBody>
            {mois.map((m, i) => {
              const c = calculs[i], futur = m > courant;
              const st = facture && m <= courant ? moteur.statutFacture(m, vue as number) : null;
              return <TableRow key={m} sx={{ bgcolor: futur ? JETONS.gris : undefined, "& td": { fontStyle: futur ? "italic" : "normal" },
                "& td:first-of-type": m === courant ? { boxShadow: `inset 3px 0 0 ${TEINTES.menthe}`, fontWeight: 600 } : {} }}>
                <TableCell>{libelleMois(m)}</TableCell>
                <Montant v={c.basePlace} />
                <Montant v={c.baseVenir} sx={MOYENNE} />
                <Montant v={c.portefeuille} sx={SECONDAIRE} />
                <TableCell align="right" sx={PETITE}>{c.tauxPdm === null ? <Typography variant="caption" color="text.secondary">par apporteur</Typography> : pourcentage(c.tauxPdm)}</TableCell>
                <Montant v={c.commissionPlace} sx={MOYENNE} />
                <Montant v={c.commissionVenir} sx={MOYENNE} />
                <Montant v={c.commissionPlace + c.commissionVenir} gras />
                <Montant v={c.socle} sx={SECONDAIRE} />
                {facture && <TableCell sx={PETITE}>{st && (st !== "a_emettre" || c.basePlace > 0) ? <PastilleFacture statut={st} /> : null}</TableCell>}
              </TableRow>;
            })}
            <TotalDouzeMois mois={mois} calculs={calculs} courant={courant} facture={facture} />
          </TableBody>
        </Table>
      </Box>
    </Bloc>

    <ParGroupe mois={mois} calculs={calculs} courant={courant} placeG={placeG} venirG={venirG} moteur={moteur} vue={vue} libelleVue={libelleVue} />
  </Stack>;
}

function Montant({ v, sx, gras }: { v: number; sx?: object; gras?: boolean }) {
  return <TableCell align="right" sx={{ ...sx, color: v ? "text.primary" : "text.disabled", fontWeight: gras ? 600 : 400 }}>{v ? euros(v) : "·"}</TableCell>;
}

function TotalDouzeMois({ mois, calculs, courant, facture }: { mois: string[]; calculs: CalculMois[]; courant: string; facture: boolean }) {
  const fin = ajouterMois(courant, 12);
  const somme = (f: (c: CalculMois) => number) => mois.reduce((t, m, i) => t + (m >= courant && m < fin ? f(calculs[i]) : 0), 0);
  return <TableRow sx={{ "& td": { fontWeight: 700, borderTop: `2px solid ${JETONS.encre}` } }}>
    <TableCell>12 mois</TableCell>
    <Montant v={somme((c) => c.basePlace)} gras />
    <Montant v={somme((c) => c.baseVenir)} sx={MOYENNE} gras />
    <TableCell sx={SECONDAIRE} /><TableCell sx={PETITE} />
    <Montant v={somme((c) => c.commissionPlace)} sx={MOYENNE} gras />
    <Montant v={somme((c) => c.commissionVenir)} sx={MOYENNE} gras />
    <Montant v={somme((c) => c.commissionPlace + c.commissionVenir)} gras />
    <Montant v={somme((c) => c.socle)} sx={SECONDAIRE} gras />
    {facture && <TableCell sx={PETITE} />}
  </TableRow>;
}

/** Le détail par groupe, quelques mois à la fois : aucune barre horizontale (C-50). */
function ParGroupe({ mois, calculs, courant, placeG, venirG, moteur, vue, libelleVue }: {
  mois: string[]; calculs: CalculMois[]; courant: string; placeG: GroupeCalcul[]; venirG: GroupeCalcul[]; moteur: Moteur; vue: Vue; libelleVue: string;
}) {
  const theme = useTheme(), large = useMediaQuery(theme.breakpoints.up("md")), taille = large ? 6 : 3;
  const indexCourant = Math.max(0, mois.indexOf(courant));
  const [debut, setDebut] = useState(() => Math.max(0, Math.min(indexCourant - 1, mois.length - taille)));
  const premier = Math.max(0, Math.min(debut, mois.length - taille)), fenetre = mois.slice(premier, premier + taille);
  const idx = (m: string) => mois.indexOf(m);
  const fin = ajouterMois(courant, 12);
  const douze = (f: (c: CalculMois) => number) => mois.reduce((t, m, i) => t + (m >= courant && m < fin ? f(calculs[i]) : 0), 0);
  const valeur = (g: GroupeCalcul, nature: "place" | "venir", c: CalculMois) => (nature === "place" ? c.place : c.venir).find((x) => x.groupe.id === g.id)?.base ?? 0;
  const enVue = (g: GroupeCalcul) => moteur.dansVue(g, vue);
  const ligne = (g: GroupeCalcul, nature: "place" | "venir") => <TableRow key={`${nature}-${g.id}`}>
    <TableCell sx={{ pl: 3 }}>{g.nom} {nature === "venir" && <PastilleStatut statut={statutCommande(g)} court />}</TableCell>
    {fenetre.map((m) => <Cellule key={m} m={m} courant={courant} v={valeur(g, nature, calculs[idx(m)])} />)}
    <Montant v={douze((c) => valeur(g, nature, c))} />
  </TableRow>;
  const somme = (libelle: ReactNode, f: (c: CalculMois) => number, avecTotal = true, style: object = {}) => <TableRow sx={{ "& td": { fontWeight: 700, ...style } }}>
    <TableCell>{libelle}</TableCell>
    {fenetre.map((m) => <Cellule key={m} m={m} courant={courant} v={f(calculs[idx(m)])} />)}
    {avecTotal ? <Montant v={douze(f)} gras /> : <TableCell />}
  </TableRow>;
  const section = (libelle: ReactNode, fond: string) => <TableRow><TableCell colSpan={fenetre.length + 2} sx={{ bgcolor: fond, fontWeight: 700, fontSize: 12 }}>{libelle}</TableCell></TableRow>;
  const place = placeG.filter(enVue), venir = venirG.filter(enVue);

  return <Bloc titre={`Suivi par groupe (encaissé HT), ${libelleVue}`} entete={<Stack direction="row" alignItems="center" spacing={0.5}>
    <IconButton aria-label="Mois précédents" disabled={premier === 0} onClick={() => setDebut(Math.max(0, premier - taille))}><IconChevronLeft size={18} /></IconButton>
    <Button size="small" onClick={() => setDebut(Math.max(0, Math.min(indexCourant - 1, mois.length - taille)))}>Mois en cours</Button>
    <IconButton aria-label="Mois suivants" disabled={premier + taille >= mois.length} onClick={() => setDebut(Math.min(mois.length - taille, premier + taille))}><IconChevronRight size={18} /></IconButton>
  </Stack>}>
    <Box sx={{ px: { xs: 0.5, sm: 1.5 }, pb: 2 }}>
      <Table size="small" sx={TABLEAU}>
        <TableHead><TableRow>
          <TableCell sx={{ width: { xs: "34%", md: "26%" } }}>Groupe</TableCell>
          {fenetre.map((m) => <TableCell key={m} align="right" sx={{ bgcolor: m > courant ? JETONS.gris : undefined, fontWeight: m === courant ? 700 : 500 }}>{libelleMois(m)}</TableCell>)}
          <TableCell align="right">12 mois</TableCell>
        </TableRow></TableHead>
        <TableBody>
          {section(<><Point couleur={TEINTES.menthe} />En place, facturés</>, JETONS.accentFond)}
          {place.map((g) => ligne(g, "place"))}
          {!place.length && <TableRow><TableCell colSpan={fenetre.length + 2} sx={{ color: "text.secondary", pl: 3 }}>Aucun groupe installé</TableCell></TableRow>}
          {somme("Encaissé HT en place", (c) => c.basePlace)}
          {section(<><Point couleur={TEINTES.orange} />À venir, prévisionnel</>, "#FFF2E0")}
          {venir.map((g) => ligne(g, "venir"))}
          {!venir.length && <TableRow><TableCell colSpan={fenetre.length + 2} sx={{ color: "text.secondary", pl: 3 }}>Aucune commande datée à venir</TableCell></TableRow>}
          {somme("Encaissé HT à venir", (c) => c.baseVenir)}
          {somme("Portefeuille à la grille HT", (c) => c.portefeuille, false, { borderTop: `2px solid ${JETONS.encre}` })}
          <TableRow><TableCell>Taux appliqué</TableCell>
            {fenetre.map((m) => { const c = calculs[idx(m)]; return <TableCell key={m} align="right" sx={{ bgcolor: m > courant ? JETONS.gris : undefined }}>
              {c.tauxPdm === null ? <Typography variant="caption" color="text.secondary">par apporteur</Typography> : `${pourcentage(c.tauxPdm)} · P${palierPour(c.portefeuille, moteur.parametres)}`}</TableCell>; })}
            <TableCell /></TableRow>
          {somme(<><Point couleur={TEINTES.menthe} />Commission en place</>, (c) => c.commissionPlace)}
          {somme(<><Point couleur={TEINTES.orange} />Commission à venir</>, (c) => c.commissionVenir)}
          {somme("Commission totale HT", (c) => c.commissionPlace + c.commissionVenir, true, { color: "primary.main" })}
          {somme("Socle sécurisé (en place seuls)", (c) => c.socle)}
        </TableBody>
      </Table>
    </Box>
  </Bloc>;
}

function Cellule({ m, courant, v }: { m: string; courant: string; v: number }) {
  return <TableCell align="right" sx={{ bgcolor: m > courant ? JETONS.gris : undefined, fontStyle: m > courant ? "italic" : "normal", color: v ? "text.primary" : "text.disabled",
    boxShadow: m === courant ? `inset 2px 0 0 ${TEINTES.menthe}` : undefined }}>{v ? euros(v) : "·"}</TableCell>;
}

function Graphique({ mois, calculs, courant }: { mois: string[]; calculs: CalculMois[]; courant: string }) {
  const donnees = mois.map((m, i) => ({ mois: m, libelle: libelleMois(m), place: calculs[i].commissionPlace, venir: calculs[i].commissionVenir, taux: calculs[i].tauxPdm }));
  return <ResponsiveContainer width="100%" height="100%">
    <BarChart data={donnees} margin={{ top: 12, right: 8, left: 8, bottom: 0 }}>
      <defs>
        <pattern id="hachures-apport" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <rect width="6" height="6" fill={TEINTES.orange} opacity={0.35} /><rect width="3" height="6" fill={TEINTES.orange} />
        </pattern>
      </defs>
      <CartesianGrid vertical={false} stroke={JETONS.filet} />
      <XAxis dataKey="libelle" tick={GRADUATION} interval="preserveStartEnd" tickLine={false} axisLine={{ stroke: JETONS.filet }} />
      <YAxis tickFormatter={(v: number) => euros(v)} tick={GRADUATION} width={72} axisLine={false} tickLine={false} />
      <Tooltip content={<Bulle courant={courant} />} cursor={{ fill: JETONS.gris }} />
      <ReferenceLine x={libelleMois(courant)} stroke={JETONS.secondaire} strokeDasharray="4 4" />
      <Bar dataKey="place" stackId="c" fill={TEINTES.menthe} name="En place" maxBarSize={28} />
      <Bar dataKey="venir" stackId="c" fill="url(#hachures-apport)" name="À venir" maxBarSize={28} radius={[4, 4, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>;
}

function Bulle({ active, payload, courant }: TooltipProps<number, string> & { courant: string }) {
  if (!active || !payload?.length) return null;
  const x = payload[0].payload as { mois: string; place: number; venir: number; taux: number | null };
  return <Card sx={{ p: 1.25, minWidth: 200, fontSize: 13, boxShadow: JETONS.ombreFlottante }}>
    <Typography fontWeight={600} fontSize={13}>{libelleMois(x.mois, true)}{x.mois > courant && <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}> (prévisionnel)</Box>}</Typography>
    {([["En place", x.place, TEINTES.menthe], ["À venir", x.venir, TEINTES.orange], ["Total HT", x.place + x.venir, null]] as const).map(([l, v, c]) =>
      <Stack key={l} direction="row" justifyContent="space-between" spacing={2}><span>{c && <Point couleur={c} />}{l}</span><b>{euros(v)}</b></Stack>)}
    <Stack direction="row" justifyContent="space-between" spacing={2}><span>Taux</span><b>{x.taux === null ? "par apporteur" : pourcentage(x.taux)}</b></Stack>
  </Card>;
}
