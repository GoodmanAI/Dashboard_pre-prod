"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { format, subDays } from "date-fns";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import TuileChiffre from "@/components/shared/TuileChiffre";
import { INK, INK_MUTED, BORDER, OK, DANGER } from "@/lib/jetons";

/**
 * La lecture des ordonnances par Konnect, tous centres (C-OCR.1, remontée par C-STAT.1 ;
 * lot 3 du plan workspace `2026-10-konnect-stats-surveillance-ocr.md`).
 *
 * INTERNE (D4) : aucun centre ne voit ces chiffres. La route du centre écarte les clés
 * `ocr*`, celle-ci est réservée aux ADMIN.
 *
 * Ce qu'on lit : pour chaque champ, ce que le patient a fait de la lecture de l'OCR
 * (gardée, corrigée, ou rien n'avait été lu). **Plancher d'erreurs** : un patient qui
 * valide sans relire compte comme une lecture juste. La période précédente, de même
 * durée, dit si on progresse ; la répartition des scores dit si les seuils du triage
 * sont au bon endroit.
 */

type Ligne = { userProductId: number; jour: string; cle: string; valeur: number };
type Centre = { userProductId: number; nom: string | null; dernierRecu: string };

const CHAMPS: [string, string][] = [
  ["examen", "Examen"],
  ["region", "Région"],
  ["cote", "Côté"],
  ["modalite", "Modalité"],
  ["date_ordonnance", "Date de l'ordonnance"],
  ["prescripteur", "Prescripteur"],
  ["nom", "Nom"],
  ["prenom", "Prénom"],
  ["date_naissance", "Date de naissance"],
];
const SCORES: [string, string][] = [
  ["examen", "Score de l'examen"],
  ["identite", "Score de l'identité (nom)"],
  ["date_naissance", "Score de la date de naissance"],
];

function total(lignes: Ligne[], cle: string): number {
  return lignes.reduce((n, l) => (l.cle === cle ? n + l.valeur : n), 0);
}

/** Part des lectures gardées par le patient, parmi les champs qu'il a remplis. */
function tauxJuste(lignes: Ligne[], champ: string): number | null {
  const juste = total(lignes, `ocr.${champ}.lu_juste`);
  const base = juste + total(lignes, `ocr.${champ}.lu_corrige`) + total(lignes, `ocr.${champ}.non_lu`);
  return base > 0 ? juste / base : null;
}

function pourcent(v: number | null): string {
  return v === null ? "·" : `${Math.round(v * 100)} %`;
}

function Ecart({ avant, apres }: { avant: number | null; apres: number | null }) {
  if (avant === null || apres === null) return <span style={{ color: INK_MUTED }}>·</span>;
  const points = Math.round((apres - avant) * 100);
  const couleur = points > 0 ? OK : points < 0 ? DANGER : INK_MUTED;
  return <span style={{ color: couleur }}>{points > 0 ? `+${points}` : points} pt</span>;
}

function Bloc({ titre, aide, children }: { titre: string; aide?: string; children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2, p: 2, mb: 3, overflowX: "auto" }}>
      <Typography sx={{ fontSize: 15, fontWeight: 700, color: INK }}>{titre}</Typography>
      {aide && <Typography sx={{ fontSize: 12.5, color: INK_MUTED, mt: 0.25, mb: 1.5 }}>{aide}</Typography>}
      {children}
    </Paper>
  );
}

const CELLULE = { fontSize: 13, py: 0.75, fontVariantNumeric: "tabular-nums" as const };

export default function KonnectOcrAdmin() {
  const [semaines, setSemaines] = useState(4);
  const [centre, setCentre] = useState<number | "tous">("tous");
  const [donnees, setDonnees] = useState<{ lignes: Ligne[]; centres: Centre[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    setDonnees(null);
    // Le double de la période : la seconde moitié est la période regardée, la première
    // sert de comparaison.
    fetch(`/api/admin/konnect-ocr?semaines=${semaines * 2}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => !annule && setDonnees({ lignes: d.lignes ?? [], centres: d.centres ?? [] }))
      .catch(() => !annule && setErreur("Lecture impossible. Vérifiez que vous êtes connecté en admin."));
    return () => {
      annule = true;
    };
  }, [semaines]);

  const { courante, precedente } = useMemo(() => {
    const lignes = (donnees?.lignes ?? []).filter((l) => centre === "tous" || l.userProductId === centre);
    const coupure = format(subDays(new Date(), semaines * 7), "yyyy-MM-dd");
    return {
      courante: lignes.filter((l) => l.jour > coupure),
      precedente: lignes.filter((l) => l.jour <= coupure),
    };
  }, [donnees, centre, semaines]);

  const fiches = total(courante, "ocr.fiches");
  const demandes = total(courante, "demandes_deposees");
  const chemins = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of courante) {
      if (l.cle.startsWith("ocr_chemin.")) m.set(l.cle.slice(11), (m.get(l.cle.slice(11)) ?? 0) + l.valeur);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [courante]);

  return (
    <PageContainer title="OCR de Konnect" description="Lecture des ordonnances, tous centres">
      <Box>
        <SectionHeader
          title="OCR de Konnect"
          subtitle="Ce que les patients gardent ou corrigent de la lecture de leur ordonnance. Interne, aucun centre ne le voit."
        />

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 3 }} alignItems={{ sm: "center" }}>
          <TextField
            select
            size="small"
            label="Centre"
            value={centre}
            onChange={(e) => setCentre(e.target.value === "tous" ? "tous" : Number(e.target.value))}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="tous">Tous les centres</MenuItem>
            {(donnees?.centres ?? []).map((c) => (
              <MenuItem key={c.userProductId} value={c.userProductId}>
                {c.nom ?? `Centre ${c.userProductId}`}
              </MenuItem>
            ))}
          </TextField>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={semaines}
            onChange={(_, v) => v && setSemaines(v)}
          >
            {[1, 4, 8, 12].map((n) => (
              <ToggleButton key={n} value={n} sx={{ textTransform: "none", px: 1.5 }}>
                {n === 1 ? "1 semaine" : `${n} semaines`}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Stack>

        {erreur && <Alert severity="error" sx={{ mb: 2 }}>{erreur}</Alert>}
        {!donnees && !erreur && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress sx={{ color: "var(--accent)" }} />
          </Box>
        )}

        {donnees && (
          <>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, minmax(0, 1fr))" },
                gap: 1.5,
                mb: 3,
              }}
            >
              <TuileChiffre libelle="Ordonnances lues par l'OCR" valeur={fiches} />
              <TuileChiffre
                libelle="Part des demandes"
                valeur={demandes > 0 ? pourcent(fiches / demandes) : "·"}
                detail={`${fiches} sur ${demandes} demandes`}
                aide="Les autres sont passées par la saisie guidée, ou n'ont pas atteint la validation."
              />
              <TuileChiffre libelle="Reprises de photo demandées" valeur={total(courante, "ocr_reprise_photo")} />
              <TuileChiffre
                libelle="Examen lu juste"
                valeur={pourcent(tauxJuste(courante, "examen"))}
                detail={`avant : ${pourcent(tauxJuste(precedente, "examen"))}`}
              />
            </Box>

            <Bloc
              titre="Champ par champ"
              aide="Lu juste : le patient a gardé la lecture. Taux : lu juste parmi les champs remplis. Écart : en points, contre la période précédente de même durée."
            >
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {["Champ", "Lu juste", "Corrigé", "Non lu", "Sans objet", "Taux", "Écart"].map((t) => (
                      <TableCell key={t} sx={{ ...CELLULE, fontWeight: 700, color: INK_MUTED }}>
                        {t}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {CHAMPS.map(([champ, libelle]) => (
                    <TableRow key={champ}>
                      <TableCell sx={CELLULE}>{libelle}</TableCell>
                      {["lu_juste", "lu_corrige", "non_lu", "sans_objet"].map((r) => (
                        <TableCell key={r} sx={CELLULE}>
                          {total(courante, `ocr.${champ}.${r}`)}
                        </TableCell>
                      ))}
                      <TableCell sx={{ ...CELLULE, fontWeight: 600 }}>{pourcent(tauxJuste(courante, champ))}</TableCell>
                      <TableCell sx={CELLULE}>
                        <Ecart avant={tauxJuste(precedente, champ)} apres={tauxJuste(courante, champ)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Bloc>

            <Bloc
              titre="Scores et résultat"
              aide="Par tranche de score : combien de lectures gardées et corrigées. Un seuil du triage est bien placé si les corrections se concentrent sous lui."
            >
              {SCORES.map(([score, libelle]) => {
                const paliers = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]
                  .map((p) => ({
                    p,
                    juste: total(courante, `ocrs.${score}.lu_juste.${p}`),
                    corrige: total(courante, `ocrs.${score}.lu_corrige.${p}`),
                  }))
                  .filter((x) => x.juste + x.corrige > 0);
                return (
                  <Box key={score} sx={{ mb: 2 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK, mb: 0.5 }}>{libelle}</Typography>
                    {paliers.length === 0 ? (
                      <Typography sx={{ fontSize: 12.5, color: INK_MUTED }}>Aucune lecture sur la période.</Typography>
                    ) : (
                      <Table size="small" sx={{ maxWidth: 420 }}>
                        <TableBody>
                          {paliers.map((x) => (
                            <TableRow key={x.p}>
                              <TableCell sx={CELLULE}>
                                {x.p} à {x.p + 9}
                              </TableCell>
                              <TableCell sx={CELLULE}>{x.juste} justes</TableCell>
                              <TableCell sx={CELLULE}>{x.corrige} corrigés</TableCell>
                              <TableCell sx={{ ...CELLULE, fontWeight: 600 }}>
                                {pourcent(x.juste / (x.juste + x.corrige))}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </Box>
                );
              })}
            </Bloc>

            <Bloc titre="Chemins de lecture" aide="Texte natif d'un PDF, ou OCR de l'image.">
              {chemins.length === 0 ? (
                <Typography sx={{ fontSize: 12.5, color: INK_MUTED }}>Aucune lecture sur la période.</Typography>
              ) : (
                chemins.map(([chemin, n]) => (
                  <Typography key={chemin} sx={{ fontSize: 13, color: INK }}>
                    {chemin} : {n}
                  </Typography>
                ))
              )}
            </Bloc>

            <Bloc
              titre="Dernière remontée par centre"
              aide="Konnect remonte ses compteurs chaque nuit. Un centre sans remontée depuis plus de deux jours a un cron arrêté ou un pont coupé."
            >
              {donnees.centres.length === 0 ? (
                <Typography sx={{ fontSize: 12.5, color: INK_MUTED }}>Aucun centre n&apos;a encore remonté.</Typography>
              ) : (
                donnees.centres.map((c) => {
                  const vieux = Date.now() - new Date(c.dernierRecu).getTime() > 2 * 24 * 3600 * 1000;
                  return (
                    <Typography key={c.userProductId} sx={{ fontSize: 13, color: vieux ? DANGER : INK }}>
                      {c.nom ?? `Centre ${c.userProductId}`} : {new Date(c.dernierRecu).toLocaleString("fr-FR")}
                    </Typography>
                  );
                })
              )}
            </Bloc>
          </>
        )}
      </Box>
    </PageContainer>
  );
}
