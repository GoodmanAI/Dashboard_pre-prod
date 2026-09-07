"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Select,
  Snackbar,
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
import { IconArrowRight } from "@tabler/icons-react";
import Link from "next/link";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import { cheminCentre } from "@/lib/cheminsCentre";
import { PRODUITS, ORDRE_PRODUITS, type SlugProduit } from "@/lib/produits";
import {
  ORDRE_STATUTS,
  STATUTS,
  demandeConfirmation,
  type StatutCentre,
} from "@/lib/centreStatut";

/**
 * Parc clients — où en est chaque centre, produit par produit (lot 1 du plan
 * `2026-09-completude-config-centres.md`).
 *
 * **Une ligne par couple client × produit**, et c'est le point qui compte : un
 * cabinet peut prendre des appels depuis six mois et ouvrir son portail patient
 * la semaine prochaine. Deux lignes, deux statuts indépendants.
 *
 * Ce que cette page NE fait PAS : couper un service, retirer un produit à un
 * client, ou modifier une configuration. Le statut décide de ce que les écrans
 * affichent comme alertes, rien de plus. Pour couper un robot, c'est
 * `serviceEnabled` dans les réglages du centre ; pour retirer un produit, c'est
 * `/admin/manage-clients`.
 *
 * La colonne « Complétude » vient de `/api/completude` (lot 2), appelée à part :
 * le classement doit s'afficher même si le calcul de complétude échoue, parce
 * qu'il est le geste utile de cette page.
 */

const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";
const SURFACE_MUTED = "#F7FAFB";

type Ligne = {
  userProductId: number;
  userId: number;
  clientNom: string | null;
  clientEmail: string | null;
  produit: SlugProduit | null;
  produitNom: string;
  statut: StatutCentre;
  depuis: string | null;
  note: string | null;
  classe: boolean;
};

type FiltreProduit = SlugProduit | "tous";

/** Ce que `/api/completude` renvoie par centre, en vue d'ensemble. */
type Completude = {
  userProductId: number;
  bloquants: number;
  degrades: number;
  total: number;
  satisfaites: number;
};

/**
 * L'état de complétude d'un centre, en une pastille.
 *
 * Un centre complet affiche « Complet », pas « 12 sur 12 » : le compte n'a
 * d'intérêt que tant qu'il manque quelque chose.
 */
function CelluleCompletude({ c }: { c: Completude | undefined }) {
  if (!c) {
    return <Typography sx={{ fontSize: 13, color: INK_MUTED }}>—</Typography>;
  }
  if (c.bloquants === 0 && c.degrades === 0) {
    return (
      <Typography sx={{ fontSize: 13, color: "#186A3B", fontWeight: 600 }}>
        Complet
      </Typography>
    );
  }
  return (
    <Stack spacing={0.25}>
      <Typography sx={{ fontSize: 13, color: INK, fontWeight: 600 }}>
        {c.satisfaites} sur {c.total}
      </Typography>
      <Typography
        sx={{ fontSize: 11.5, color: c.bloquants > 0 ? "#9B2226" : INK_MUTED }}
      >
        {c.bloquants > 0
          ? `${c.bloquants} information${c.bloquants > 1 ? "s" : ""} essentielle${
              c.bloquants > 1 ? "s" : ""
            } manquante${c.bloquants > 1 ? "s" : ""}`
          : `${c.degrades} à compléter`}
      </Typography>
    </Stack>
  );
}

function PastilleStatut({ statut }: { statut: StatutCentre }) {
  const { libelle, couleur } = STATUTS[statut];
  return (
    <Chip
      label={libelle}
      size="small"
      sx={{
        bgcolor: couleur.fond,
        color: couleur.texte,
        fontWeight: 600,
        fontSize: 12,
      }}
    />
  );
}

function dateCourte(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR");
}

export default function ParcClients() {
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState<number | null>(null);
  const [filtre, setFiltre] = useState<FiltreProduit>("tous");

  // Note en cours d'édition, par centre. Séparée de `lignes` pour qu'une frappe
  // ne redessine pas le tableau entier.
  const [notes, setNotes] = useState<Record<number, string>>({});

  // Complétude par centre, chargée à part (cf. `rechargerCompletude`).
  const [completudes, setCompletudes] = useState<Record<number, Completude>>({});

  // Confirmation de passage en production, et les manques bloquants à montrer
  // avant de valider. `null` tant que le détail n'est pas revenu.
  const [aConfirmer, setAConfirmer] = useState<Ligne | null>(null);
  const [manquesConfirmation, setManquesConfirmation] = useState<
    Array<{ cle: string; libelle: string; manque: string }> | null
  >(null);

  const recharger = useCallback(async () => {
    try {
      const r = await fetch("/api/centre-statut");
      if (!r.ok) throw new Error();
      const d = await r.json();
      const liste: Ligne[] = Array.isArray(d.rows) ? d.rows : [];
      setLignes(liste);
      setNotes(
        Object.fromEntries(liste.map((l) => [l.userProductId, l.note ?? ""]))
      );
      setErreur(null);
    } catch {
      setErreur("Impossible de charger le parc.");
    } finally {
      setChargement(false);
    }
  }, []);

  /**
   * La complétude est chargée séparément, et son échec n'est pas remonté comme
   * une erreur : le classement reste utilisable sans elle, et c'est lui le geste
   * de cette page. La colonne affiche alors un tiret.
   */
  const rechargerCompletude = useCallback(async () => {
    try {
      const r = await fetch("/api/completude");
      if (!r.ok) return;
      const d = await r.json();
      const rows: Completude[] = Array.isArray(d.rows) ? d.rows : [];
      setCompletudes(
        Object.fromEntries(rows.map((c) => [c.userProductId, c]))
      );
    } catch {
      // Colonne vide, rien d'autre.
    }
  }, []);

  useEffect(() => {
    void recharger();
    void rechargerCompletude();
  }, [recharger, rechargerCompletude]);

  const enregistrer = useCallback(
    async (ligne: Ligne, statut: StatutCentre, note?: string) => {
      setOccupe(ligne.userProductId);
      try {
        const r = await fetch("/api/centre-statut", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userProductId: ligne.userProductId,
            statut,
            ...(note === undefined ? {} : { note }),
          }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error ?? "Enregistrement impossible.");
        setMessage(
          d.aChange
            ? `${ligne.clientNom ?? "Ce centre"} : ${STATUTS[statut].libelle.toLowerCase()}.`
            : "Note enregistrée."
        );
        await recharger();
      } catch (e: any) {
        setErreur(e?.message ?? "Enregistrement impossible.");
      } finally {
        setOccupe(null);
      }
    },
    [recharger]
  );

  const changerStatut = useCallback(
    (ligne: Ligne, cible: StatutCentre) => {
      if (cible === ligne.statut) return;
      if (demandeConfirmation(ligne.statut, cible)) {
        setManquesConfirmation(null);
        setAConfirmer(ligne);
        // Le détail des manques n'est pas dans la vue d'ensemble : on le
        // demande à l'ouverture. Le dialogue s'affiche sans attendre, le
        // passage en production n'est jamais bloqué par ce chargement.
        void (async () => {
          try {
            const r = await fetch(
              `/api/completude?userProductId=${ligne.userProductId}`
            );
            if (!r.ok) return;
            const d = await r.json();
            const bloquants = (Array.isArray(d.manques) ? d.manques : []).filter(
              (m: any) => m?.criticite === "bloquant"
            );
            setManquesConfirmation(bloquants);
          } catch {
            // Sans le détail, le dialogue reste utilisable : il dit seulement
            // ce que le passage en production implique.
          }
        })();
        return;
      }
      void enregistrer(ligne, cible);
    },
    [enregistrer]
  );

  const visibles = useMemo(
    () => (filtre === "tous" ? lignes : lignes.filter((l) => l.produit === filtre)),
    [lignes, filtre]
  );

  const compteurs = useMemo(() => {
    const c: Record<StatutCentre, number> = {
      integration: 0,
      production: 0,
      arrete: 0,
    };
    visibles.forEach((l) => {
      c[l.statut] += 1;
    });
    return c;
  }, [visibles]);

  return (
    <PageContainer title="Parc clients" description="Où en est chaque centre">
      <Box>
        <SectionHeader
          title="Parc clients"
          subtitle="Où en est chaque centre, produit par produit. Le statut décide des alertes de configuration affichées au client, rien d'autre."
        />

        {erreur && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErreur(null)}>
            {erreur}
          </Alert>
        )}

        <Paper variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2, p: 2, mb: 2 }}>
          <Stack
            direction="row"
            spacing={2}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
          >
            <ToggleButtonGroup
              size="small"
              exclusive
              value={filtre}
              onChange={(_, v) => v && setFiltre(v)}
            >
              <ToggleButton value="tous" sx={{ textTransform: "none" }}>
                Tous les produits
              </ToggleButton>
              {ORDRE_PRODUITS.map((slug) => (
                <ToggleButton key={slug} value={slug} sx={{ textTransform: "none" }}>
                  {PRODUITS[slug].libelle}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Box sx={{ flexGrow: 1 }} />

            {ORDRE_STATUTS.map((s) => (
              <Stack key={s} direction="row" spacing={0.75} alignItems="center">
                <PastilleStatut statut={s} />
                <Typography sx={{ fontSize: 13, color: INK, fontWeight: 600 }}>
                  {compteurs[s]}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2, overflow: "hidden" }}>
          {chargement ? (
            <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
              <CircularProgress size={22} />
            </Box>
          ) : visibles.length === 0 ? (
            <Box sx={{ p: 4 }}>
              <Typography sx={{ fontSize: 13.5, color: INK_MUTED }}>
                Aucun centre pour ce filtre.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: SURFACE_MUTED }}>
                    <TableCell sx={{ fontWeight: 700, color: INK }}>Client</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: INK }}>Produit</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: INK, minWidth: 190 }}>
                      Statut
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: INK }}>Complétude</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: INK }}>Depuis</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: INK, minWidth: 240 }}>
                      Note interne
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibles.map((l) => (
                    <TableRow key={l.userProductId} hover>
                      <TableCell>
                        <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: INK }}>
                          {l.clientNom ?? `Centre ${l.userProductId}`}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: INK_MUTED }}>
                          {l.clientEmail ?? ""}
                        </Typography>
                      </TableCell>

                      <TableCell>
                        <Typography sx={{ fontSize: 13, color: INK }}>
                          {l.produit ? PRODUITS[l.produit].libelle : l.produitNom}
                        </Typography>
                      </TableCell>

                      <TableCell>
                        <Select
                          size="small"
                          value={l.statut}
                          disabled={occupe === l.userProductId}
                          onChange={(e) =>
                            changerStatut(l, e.target.value as StatutCentre)
                          }
                          sx={{ fontSize: 13, minWidth: 175 }}
                        >
                          {ORDRE_STATUTS.map((s) => (
                            <MenuItem key={s} value={s} sx={{ fontSize: 13 }}>
                              {STATUTS[s].libelle}
                            </MenuItem>
                          ))}
                        </Select>
                        {!l.classe && (
                          <Typography sx={{ fontSize: 11.5, color: INK_MUTED, mt: 0.5 }}>
                            Jamais classé
                          </Typography>
                        )}
                      </TableCell>

                      <TableCell>
                        <CelluleCompletude c={completudes[l.userProductId]} />
                      </TableCell>

                      <TableCell>
                        <Typography sx={{ fontSize: 13, color: INK_MUTED }}>
                          {dateCourte(l.depuis)}
                        </Typography>
                      </TableCell>

                      <TableCell>
                        <TextField
                          size="small"
                          fullWidth
                          placeholder="En attente des numéros du groupe"
                          value={notes[l.userProductId] ?? ""}
                          disabled={occupe === l.userProductId}
                          onChange={(e) =>
                            setNotes((p) => ({ ...p, [l.userProductId]: e.target.value }))
                          }
                          onBlur={() => {
                            const v = notes[l.userProductId] ?? "";
                            if (v.trim() !== (l.note ?? "").trim()) {
                              void enregistrer(l, l.statut, v);
                            }
                          }}
                          inputProps={{ style: { fontSize: 13 } }}
                        />
                      </TableCell>

                      <TableCell align="right">
                        <Button
                          component={Link}
                          href={
                            l.produit
                              ? cheminCentre(l.userId, l.produit)
                              : `/admin/clients/${l.userId}`
                          }
                          size="small"
                          endIcon={<IconArrowRight size={15} />}
                          sx={{ textTransform: "none", whiteSpace: "nowrap" }}
                        >
                          Ouvrir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Paper>

        <Typography sx={{ fontSize: 12, color: INK_MUTED, mt: 2 }}>
          Un centre jamais classé est traité comme étant en intégration : aucune alerte de
          configuration ne s&apos;affiche chez son client tant qu&apos;il n&apos;est pas
          passé en production.
        </Typography>
      </Box>

      <Dialog open={aConfirmer !== null} onClose={() => setAConfirmer(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: INK }}>
          Passer ce centre en production ?
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5, color: INK, mb: 1.5 }}>
            {aConfirmer?.clientNom ?? "Ce centre"}
            {aConfirmer?.produit ? `, ${PRODUITS[aConfirmer.produit].libelle}` : ""}.
          </Typography>
          <Typography sx={{ fontSize: 13, color: INK_MUTED }}>
            Les alertes de configuration deviennent visibles par le client. Une information
            essentielle manquante lui sera signalée dès sa prochaine connexion.
          </Typography>

          {manquesConfirmation !== null && manquesConfirmation.length > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.5 }}>
                {manquesConfirmation.length} information
                {manquesConfirmation.length > 1 ? "s" : ""} essentielle
                {manquesConfirmation.length > 1 ? "s" : ""} manque
                {manquesConfirmation.length > 1 ? "nt" : ""} encore
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {manquesConfirmation.map((m) => (
                  <li key={m.cle}>
                    <Typography sx={{ fontSize: 12.5 }}>
                      <strong>{m.libelle}</strong> : {m.manque}
                    </Typography>
                  </li>
                ))}
              </Box>
              <Typography sx={{ fontSize: 12.5, mt: 1 }}>
                Vous pouvez passer le centre en production quand même. Le client verra ces
                alertes.
              </Typography>
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAConfirmer(null)} sx={{ textTransform: "none" }}>
            Annuler
          </Button>
          <Button
            variant="contained"
            disableElevation
            sx={{ textTransform: "none", bgcolor: "var(--accent)" }}
            onClick={() => {
              const l = aConfirmer;
              setAConfirmer(null);
              setManquesConfirmation(null);
              if (l) {
                void enregistrer(l, "production").then(rechargerCompletude);
              }
            }}
          >
            Passer en production
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={message !== null}
        autoHideDuration={3000}
        onClose={() => setMessage(null)}
        message={message ?? ""}
      />
    </PageContainer>
  );
}
