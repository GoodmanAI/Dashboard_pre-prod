"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  IconButton,
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
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import { useParams } from "next/navigation";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";

/**
 * Catalogue d'examens LyraeKonnect d'un centre.
 *
 * C'est ici que le client décrit ce que le portail patient proposera. Le
 * Dashboard en est propriétaire (`KonnectExamens`) ; Konnect vient le lire et le
 * met en cache dans sa propre table.
 *
 * **Un tableau plutôt que des accordéons**, contrairement à l'écran de
 * paramétrage : on édite ici des dizaines de lignes homogènes, pas une poignée
 * de réglages hétérogènes. La comparaison ligne à ligne prime sur la mise en
 * valeur de chaque champ.
 *
 * **Une seule sauvegarde, qui remplace l'ensemble.** L'API fait de même : un
 * examen retiré du tableau disparaît réellement. Pas de suppression immédiate au
 * clic — tant qu'on n'a pas enregistré, rien n'est perdu.
 *
 * Le vocabulaire est celui de Xplore (`ordoOblig`, `examenInjecte`), pour ne pas
 * inventer un lexique parallèle à celui du RIS.
 */

type Examen = {
  examen_code: string;
  type_code: string | null;
  libelle: string;
  ordo_oblig: boolean;
  examen_injecte: boolean;
  actif: boolean;
  liste_attente_active: boolean;
  source: string;
};

const LIGNE_VIDE: Examen = {
  examen_code: "",
  type_code: "",
  libelle: "",
  ordo_oblig: false,
  examen_injecte: false,
  actif: true,
  liste_attente_active: false,
  source: "manuel",
};

/** En-tête de colonne avec son explication au survol. */
function Colonne({ titre, aide, largeur }: { titre: string; aide: string; largeur?: number }) {
  return (
    <TableCell sx={{ fontWeight: 600, width: largeur, whiteSpace: "nowrap" }}>
      <Tooltip title={aide} placement="top">
        <span>{titre}</span>
      </Tooltip>
    </TableCell>
  );
}

export default function CatalogueExamensPage() {
  const params = useParams();
  const userProductId = Number(params?.id);

  const [examens, setExamens] = useState<Examen[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    if (!userProductId) return;
    let annule = false;
    (async () => {
      try {
        const r = await fetch(`/api/konnect-examens?userProductId=${userProductId}`);
        if (!r.ok) throw new Error("Chargement impossible.");
        const data = await r.json();
        if (!annule) setExamens(Array.isArray(data.examens) ? data.examens : []);
      } catch {
        if (!annule) setErreur("Impossible de charger le catalogue.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  function maj(index: number, champ: keyof Examen, valeur: any) {
    setExamens((prev) =>
      prev.map((e, i) => (i === index ? { ...e, [champ]: valeur } : e))
    );
  }

  /**
   * Doublon détecté à la saisie plutôt qu'au refus du serveur : le client voit
   * immédiatement quelle ligne pose problème, sans avoir à interpréter un
   * message d'erreur global.
   */
  const doublons = useMemo(() => {
    const vus = new Map<string, number>();
    const marques = new Set<number>();
    examens.forEach((e, i) => {
      const code = e.examen_code.trim();
      if (!code) return;
      if (vus.has(code)) {
        marques.add(i);
        marques.add(vus.get(code)!);
      } else {
        vus.set(code, i);
      }
    });
    return marques;
  }, [examens]);

  const incomplets = examens.some(
    (e) => !e.examen_code.trim() || !e.libelle.trim()
  );

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      const r = await fetch(`/api/konnect-examens?userProductId=${userProductId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examens: examens.map((e) => ({
            ...e,
            type_code: e.type_code?.trim() || null,
          })),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "Enregistrement refusé.");
      setSucces(true);
    } catch (e: any) {
      setErreur(e?.message ?? "Enregistrement impossible.");
    } finally {
      setEnregistrement(false);
    }
  }

  if (chargement) {
    return (
      <PageContainer title="Catalogue d'examens" description="Examens proposés au patient">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Catalogue d'examens" description="Examens proposés au patient">
      <Box>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
          Catalogue d&apos;examens
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Les examens que le portail patient peut proposer. Le <strong>code</strong> est
          celui de votre RIS : c&apos;est lui qui sert à créer le rendez-vous, il doit
          correspondre exactement. Le <strong>libellé</strong>, lui, est ce que lit le
          patient.
        </Typography>

        <TableContainer component={Paper} variant="outlined" sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <Colonne
                  titre="Code RIS"
                  aide="Le code de l'examen dans votre RIS. Doit correspondre exactement, sinon la réservation échoue."
                  largeur={160}
                />
                <Colonne
                  titre="Type"
                  aide="Code du type d'examen (regroupement RIS). Facultatif."
                  largeur={110}
                />
                <Colonne titre="Libellé patient" aide="Ce que le patient lit à l'écran." />
                <Colonne
                  titre="Ordonnance"
                  aide="L'ordonnance est obligatoire pour cet examen."
                  largeur={110}
                />
                <Colonne
                  titre="Injecté"
                  aide="Examen avec injection de produit de contraste."
                  largeur={90}
                />
                <Colonne
                  titre="Actif"
                  aide="Décoché, l'examen n'est plus proposé au patient — sans être supprimé."
                  largeur={80}
                />
                <Colonne
                  titre="Liste d'attente"
                  aide="Le patient peut s'inscrire en liste d'attente pour cet examen."
                  largeur={120}
                />
                <TableCell sx={{ width: 56 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {examens.map((e, i) => (
                <TableRow key={i} hover>
                  <TableCell>
                    <TextField
                      size="small"
                      fullWidth
                      value={e.examen_code}
                      error={doublons.has(i) || !e.examen_code.trim()}
                      helperText={doublons.has(i) ? "Code en double" : undefined}
                      onChange={(ev) => maj(i, "examen_code", ev.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      fullWidth
                      value={e.type_code ?? ""}
                      onChange={(ev) => maj(i, "type_code", ev.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      fullWidth
                      value={e.libelle}
                      error={!e.libelle.trim()}
                      onChange={(ev) => maj(i, "libelle", ev.target.value)}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Checkbox
                      checked={e.ordo_oblig}
                      onChange={(ev) => maj(i, "ordo_oblig", ev.target.checked)}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Checkbox
                      checked={e.examen_injecte}
                      onChange={(ev) => maj(i, "examen_injecte", ev.target.checked)}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Checkbox
                      checked={e.actif}
                      onChange={(ev) => maj(i, "actif", ev.target.checked)}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Checkbox
                      checked={e.liste_attente_active}
                      onChange={(ev) => maj(i, "liste_attente_active", ev.target.checked)}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Retirer cette ligne">
                      <IconButton
                        size="small"
                        onClick={() =>
                          setExamens((prev) => prev.filter((_, j) => j !== i))
                        }
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {examens.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                    <Typography variant="body2" color="text.secondary">
                      Aucun examen. Ajoutez-en un pour que le portail patient
                      puisse proposer des rendez-vous.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button
            startIcon={<AddIcon />}
            onClick={() => setExamens((prev) => [...prev, { ...LIGNE_VIDE }])}
          >
            Ajouter un examen
          </Button>
        </Stack>

        {doublons.size > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Deux lignes portent le même code RIS. Chaque examen doit avoir un code
            unique.
          </Alert>
        )}
        {incomplets && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Le code RIS et le libellé sont obligatoires : un examen sans libellé
            s&apos;afficherait comme une ligne vide chez le patient.
          </Alert>
        )}
        {erreur && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {erreur}
          </Alert>
        )}

        <Box sx={{ mt: 3, display: "flex", justifyContent: "flex-end" }}>
          <Button
            variant="contained"
            size="large"
            onClick={enregistrer}
            disabled={enregistrement || doublons.size > 0 || incomplets}
            sx={{
              bgcolor: "var(--accent)",
              fontWeight: 600,
              "&:hover": { bgcolor: "var(--accent-press)" },
            }}
          >
            {enregistrement ? "Enregistrement…" : "Enregistrer le catalogue"}
          </Button>
        </Box>

        <Snackbar
          open={succes}
          autoHideDuration={4000}
          onClose={() => setSucces(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity="success" onClose={() => setSucces(false)}>
            Catalogue enregistré. Le portail patient l&apos;appliquera dans la minute.
          </Alert>
        </Snackbar>
      </Box>
    </PageContainer>
  );
}
