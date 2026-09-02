"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Link as MuiLink,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCentreProduit } from "@/hooks/useCentreProduit";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";

/**
 * Demandes de rappel des patients LyraeKonnect
 * (chantier `plans/2026-09-konnect-deux-chemins.md`, lot 2).
 *
 * Le seul écran de cette brique qui affiche de la donnée patient. Il liste les
 * patients dont l'examen n'est pas coché « Réservable en ligne » dans le mapping,
 * et qui ont accepté de laisser leur numéro plutôt que d'appeler eux-mêmes.
 *
 * C'EST UNE LISTE D'APPELS À PASSER, pas un dossier médical. On y trouve un nom,
 * un numéro et le libellé de l'examen demandé, et rien d'autre : ni ordonnance, ni
 * questionnaire, ni date de naissance. Le dossier complet reste dans le portail.
 *
 * Pas de barre d'enregistrement : chaque geste part tout de suite. Marquer un
 * patient rappelé est une action, pas un brouillon, et la liste doit dire la
 * vérité à la secrétaire qui la partage avec sa collègue.
 *
 * Même direction artistique que les écrans de configuration du produit : mêmes
 * constantes de couleur, même densité de table.
 */

const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";
const SURFACE = "#FFFFFF";
const SURFACE_MUTED = "#F7FAFB";

type Demande = {
  id: number;
  referenceKonnect: string;
  nom: string;
  prenom: string;
  telephone: string;
  examenLibelle: string;
  statut: string;
  note: string;
  traiteePar: string | null;
  traiteeAt: string | null;
  createdAt: string;
};

const STATUTS: Record<string, { libelle: string; fg: string; bg: string }> = {
  a_rappeler: { libelle: "À rappeler", fg: "#B4602A", bg: "#FCF0E6" },
  rappele: { libelle: "Rappelé", fg: "#1E8A5B", bg: "#E5F5EE" },
  sans_suite: { libelle: "Sans suite", fg: "#5A6B7B", bg: "#F1F5F9" },
};

function EnTete({
  children,
  aide,
  largeur,
}: {
  children: React.ReactNode;
  aide?: string;
  largeur?: number;
}) {
  const cellule = (
    <TableCell
      sx={{
        bgcolor: SURFACE_MUTED,
        color: INK_MUTED,
        fontWeight: 600,
        fontSize: 11.5,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        borderBottom: `1px solid ${BORDER}`,
        width: largeur,
        whiteSpace: "nowrap",
        py: 1.25,
      }}
    >
      {children}
    </TableCell>
  );
  return aide ? (
    <Tooltip title={aide} placement="top">
      {cellule}
    </Tooltip>
  ) : (
    cellule
  );
}

/** « il y a 3 jours », plus parlant qu'une date pour une file d'appels. */
function depuis(iso: string): string {
  const jours = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return "hier";
  return `il y a ${jours} jours`;
}

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function DemandesRappelKonnect() {
  const { userProductId } = useCentreProduit();

  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!userProductId) return;
    try {
      const r = await fetch(`/api/konnect-demandes-rappel?userProductId=${userProductId}`);
      if (!r.ok) throw new Error("Chargement impossible.");
      const data = await r.json();
      const liste: Demande[] = Array.isArray(data.demandes) ? data.demandes : [];
      setDemandes(liste);
      setNotes(Object.fromEntries(liste.map((d) => [d.id, d.note ?? ""])));
      setErreur(null);
    } catch {
      setErreur("Impossible de charger les demandes de rappel.");
    } finally {
      setChargement(false);
    }
  }, [userProductId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function majuster(d: Demande, statut: string) {
    setEnCours(d.id);
    setErreur(null);
    try {
      const r = await fetch(`/api/konnect-demandes-rappel?userProductId=${userProductId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id, statut, note: notes[d.id] ?? "" }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "Enregistrement refusé.");
      setDemandes((p) => p.map((x) => (x.id === d.id ? { ...x, statut, note: notes[d.id] ?? "" } : x)));
      setMessage(
        statut === "a_rappeler"
          ? "Demande remise dans la file."
          : statut === "rappele"
            ? "Patient marqué rappelé."
            : "Demande classée sans suite."
      );
    } catch (e: any) {
      setErreur(e?.message ?? "Enregistrement impossible.");
    } finally {
      setEnCours(null);
    }
  }

  const aRappeler = useMemo(
    () => demandes.filter((d) => d.statut === "a_rappeler").length,
    [demandes]
  );

  if (chargement) {
    return (
      <PageContainer title="Demandes de rappel" description="Les patients à rappeler">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: "var(--accent)" }} />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Demandes de rappel" description="Les patients à rappeler">
      <Box>
        <SectionHeader
          title="Demandes de rappel"
          subtitle="Les patients qui attendent votre appel"
          actions={
            <Chip
              label={
                aRappeler === 0
                  ? "Aucun appel en attente"
                  : `${aRappeler} appel${aRappeler > 1 ? "s" : ""} à passer`
              }
              sx={{
                fontWeight: 600,
                color: aRappeler > 0 ? "#B4602A" : INK_MUTED,
                bgcolor: aRappeler > 0 ? "#FCF0E6" : SURFACE_MUTED,
              }}
            />
          }
        />

        <Typography variant="body2" sx={{ color: INK_MUTED, mb: 2.5 }}>
          Ces patients ont demandé un examen que vous ne laissez pas réserver en ligne.
          Ils ont laissé leur numéro plutôt que d&apos;appeler eux-mêmes. Vous les
          rappelez, vous cochez, et la ligne sort de la file. Pour changer les examens
          concernés, allez dans le mapping d&apos;examens et la colonne
          « Réservable en ligne ».
        </Typography>

        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{ overflowX: "auto", borderColor: BORDER, borderRadius: 2 }}
        >
          <Table size="small" sx={{ minWidth: 1100 }}>
            <TableHead>
              <TableRow>
                <EnTete aide="Depuis combien de temps le patient attend." largeur={130}>
                  Reçue
                </EnTete>
                <EnTete largeur={220}>Patient</EnTete>
                <EnTete aide="Cliquez pour composer depuis un poste équipé." largeur={160}>
                  Téléphone
                </EnTete>
                <EnTete aide="L'examen demandé, tel qu'il est nommé dans votre mapping.">
                  Examen demandé
                </EnTete>
                <EnTete aide="Pour vous. Le patient ne la voit jamais." largeur={240}>
                  Note
                </EnTete>
                <EnTete largeur={120}>Statut</EnTete>
                <EnTete largeur={220}>Action</EnTete>
              </TableRow>
            </TableHead>
            <TableBody>
              {demandes.map((d) => {
                const s = STATUTS[d.statut] ?? STATUTS.a_rappeler;
                const traitee = d.statut !== "a_rappeler";
                return (
                  <TableRow
                    key={d.id}
                    hover
                    sx={{
                      "&:nth-of-type(odd)": { bgcolor: "#FBFDFC" },
                      "& > td": { borderBottom: `1px solid ${BORDER}`, py: 1 },
                      opacity: traitee ? 0.6 : 1,
                    }}
                  >
                    <TableCell>
                      <Typography sx={{ fontSize: 13, color: INK }}>
                        {depuis(d.createdAt)}
                      </Typography>
                      <Typography sx={{ fontSize: 11.5, color: INK_MUTED }}>
                        {dateCourte(d.createdAt)}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK }}>
                        {[d.prenom, d.nom].filter(Boolean).join(" ") || "Nom non renseigné"}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <MuiLink
                        href={`tel:${d.telephone}`}
                        underline="hover"
                        sx={{ fontSize: 13, fontFamily: "monospace", color: "var(--accent-press)" }}
                      >
                        {d.telephone}
                      </MuiLink>
                    </TableCell>

                    <TableCell>
                      <Typography sx={{ fontSize: 13, color: INK }}>
                        {d.examenLibelle || "Examen non précisé"}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <TextField
                        size="small"
                        fullWidth
                        multiline
                        maxRows={3}
                        placeholder="Ce que vous voulez retenir"
                        value={notes[d.id] ?? ""}
                        onChange={(e) =>
                          setNotes((p) => ({ ...p, [d.id]: e.target.value }))
                        }
                        sx={{ "& .MuiOutlinedInput-root": { fontSize: 12.5, bgcolor: SURFACE } }}
                      />
                    </TableCell>

                    <TableCell>
                      <Chip
                        size="small"
                        label={s.libelle}
                        sx={{ fontWeight: 600, fontSize: 11.5, color: s.fg, bgcolor: s.bg }}
                      />
                      {traitee && d.traiteePar && (
                        <Typography sx={{ fontSize: 11, color: INK_MUTED, mt: 0.5 }}>
                          par {d.traiteePar}
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {traitee ? (
                          <Button
                            size="small"
                            disabled={enCours === d.id}
                            onClick={() => void majuster(d, "a_rappeler")}
                            sx={{ textTransform: "none", fontSize: 12.5 }}
                          >
                            Remettre à rappeler
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="small"
                              variant="contained"
                              disableElevation
                              disabled={enCours === d.id}
                              onClick={() => void majuster(d, "rappele")}
                              sx={{
                                textTransform: "none",
                                fontSize: 12.5,
                                bgcolor: "var(--accent)",
                                "&:hover": { bgcolor: "var(--accent-press)" },
                              }}
                            >
                              Rappelé
                            </Button>
                            <Button
                              size="small"
                              disabled={enCours === d.id}
                              onClick={() => void majuster(d, "sans_suite")}
                              sx={{ textTransform: "none", fontSize: 12.5, color: INK_MUTED }}
                            >
                              Sans suite
                            </Button>
                          </>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}

              {demandes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                    <Typography variant="body2" sx={{ color: INK_MUTED }}>
                      Aucune demande de rappel. Soit tous vos examens sont réservables en
                      ligne, soit aucun patient n&apos;a encore laissé son numéro.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Typography variant="body2" sx={{ color: INK_MUTED, mt: 2 }}>
          Une demande rappelée ou classée sans suite est supprimée au bout de 90 jours.
          Une demande encore à rappeler est gardée, quel que soit son âge.
        </Typography>

        {erreur && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {erreur}
          </Alert>
        )}

        <Snackbar
          open={message !== null}
          autoHideDuration={4000}
          onClose={() => setMessage(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity="success" onClose={() => setMessage(null)}>
            {message}
          </Alert>
        </Snackbar>
      </Box>
    </PageContainer>
  );
}
