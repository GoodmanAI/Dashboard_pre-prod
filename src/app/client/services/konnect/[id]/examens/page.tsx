"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useParams } from "next/navigation";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";

/**
 * Mapping d'examens LyraeKonnect d'un centre.
 *
 * **Même principe que l'écran de LyraeTalk** : notre référentiel NEURACORP est
 * pré-rempli à gauche, le client renseigne les équivalents de SON RIS à droite. Un
 * centre qui ouvre cet écran pour la première fois voit toutes les lignes, pas une
 * page blanche.
 *
 * Les deux mappings restent séparés — même RIS, mêmes codes, mais Konnect porte
 * trois réglages que le robot vocal ignore, et le sélecteur de produit fait passer
 * d'un écran à l'autre :
 *
 * - **Ordonnance obligatoire** — le portail exige le dépôt d'une ordonnance ;
 * - **Injecté** — examen avec produit de contraste, il déclenche le questionnaire
 *   d'injection ;
 * - **Liste d'attente** — le patient peut s'inscrire si aucun créneau ne convient.
 *
 * Aucun n'a de sens au téléphone : ils pilotent des écrans du parcours web.
 */

type Ligne = {
  codeExamen: string;
  typeExamen: string | null;
  libelle: string | null;
  codeExamenClient: string;
  typeExamenClient: string;
  libelleClient: string;
  performed: boolean;
  ordoOblig: boolean;
  examenInjecte: boolean;
  listeAttenteActive: boolean;
};

type FiltreAttribution = "tous" | "attribues" | "non_attribues";

const PAR_PAGE = 25;

function EnTete({ titre, aide, largeur }: { titre: string; aide: string; largeur?: number }) {
  return (
    <TableCell sx={{ fontWeight: 600, width: largeur, whiteSpace: "nowrap" }}>
      <Tooltip title={aide} placement="top">
        <span>{titre}</span>
      </Tooltip>
    </TableCell>
  );
}

export default function MappingExamensKonnect() {
  const params = useParams();
  const userProductId = Number(params?.id);

  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);
  const [amorce, setAmorce] = useState(false);
  const [origine, setOrigine] = useState<string | null>(null);
  const [avertissement, setAvertissement] = useState<string | null>(null);

  const [recherche, setRecherche] = useState("");
  const [filtreType, setFiltreType] = useState("tous");
  const [filtreAttribution, setFiltreAttribution] = useState<FiltreAttribution>("tous");
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!userProductId) return;
    let annule = false;
    (async () => {
      try {
        const r = await fetch(`/api/konnect-examens?userProductId=${userProductId}`);
        if (!r.ok) throw new Error("Chargement impossible.");
        const data = await r.json();
        if (annule) return;
        setLignes(Array.isArray(data.examens) ? data.examens : []);
        setAmorce(Boolean(data.amorce));
        setOrigine(data.source ?? null);
        if (data.source === "indisponible") {
          setAvertissement(
            data.motif ??
              "Le référentiel d'examens n'a pas pu être chargé. Contactez l'équipe technique."
          );
        }
      } catch {
        if (!annule) setErreur("Impossible de charger le mapping.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  function maj(codeExamen: string, champ: keyof Ligne, valeur: any) {
    setLignes((prev) =>
      prev.map((l) => (l.codeExamen === codeExamen ? { ...l, [champ]: valeur } : l))
    );
  }

  const types = useMemo(() => {
    const set = new Set<string>();
    lignes.forEach((l) => l.typeExamen && set.add(l.typeExamen));
    return Array.from(set).sort();
  }, [lignes]);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return lignes.filter((l) => {
      if (filtreType !== "tous" && l.typeExamen !== filtreType) return false;
      const attribue = Boolean(l.codeExamenClient.trim());
      if (filtreAttribution === "attribues" && !attribue) return false;
      if (filtreAttribution === "non_attribues" && attribue) return false;
      if (!q) return true;
      return [l.codeExamen, l.libelle, l.codeExamenClient, l.libelleClient]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [lignes, recherche, filtreType, filtreAttribution]);

  const attribues = useMemo(
    () => lignes.filter((l) => l.performed && l.codeExamenClient.trim()).length,
    [lignes]
  );

  /**
   * Deux lignes qui visent le même code RIS : Konnect ne saurait pas laquelle
   * appliquer. Détecté ici pour montrer les lignes fautives, et refusé par l'API.
   */
  const codesRisEnDouble = useMemo(() => {
    const compte = new Map<string, number>();
    lignes.forEach((l) => {
      const c = l.codeExamenClient.trim();
      if (!c || !l.performed) return;
      compte.set(c, (compte.get(c) ?? 0) + 1);
    });
    return new Set(
      Array.from(compte.entries())
        .filter(([, n]) => n > 1)
        .map(([c]) => c)
    );
  }, [lignes]);

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      const r = await fetch(`/api/konnect-examens?userProductId=${userProductId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examens: lignes }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "Enregistrement refusé.");
      setAmorce(false);
      setSucces(true);
    } catch (e: any) {
      setErreur(e?.message ?? "Enregistrement impossible.");
    } finally {
      setEnregistrement(false);
    }
  }

  if (chargement) {
    return (
      <PageContainer title="Mapping d'examens" description="Correspondance avec votre RIS">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      </PageContainer>
    );
  }

  const visibles = filtrees.slice(page * PAR_PAGE, page * PAR_PAGE + PAR_PAGE);

  return (
    <PageContainer title="Mapping d'examens" description="Correspondance avec votre RIS">
      <Box>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
          Mapping d&apos;examens
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          À gauche, notre référentiel. À droite, les codes de <strong>votre RIS</strong> :
          ce sont eux qui servent à créer le rendez-vous, ils doivent correspondre
          exactement. Un examen sans code RIS n&apos;est pas proposé au patient.
        </Typography>

        {amorce && origine === "talk" && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <strong>Repris de votre mapping LyraeTalk.</strong> Vos codes RIS sont déjà
            là — c&apos;est le même RIS, donc les mêmes codes. Il vous reste à cocher les
            trois colonnes de droite, propres au portail web : ordonnance obligatoire,
            examen injecté, liste d&apos;attente. Rien n&apos;est transmis au portail tant
            que vous n&apos;avez pas enregistré, et les deux mappings resteront ensuite
            indépendants.
          </Alert>
        )}
        {amorce && origine === "blob" && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Ce mapping n&apos;a jamais été enregistré : les lignes ci-dessous sont notre
            référentiel, à compléter avec vos codes RIS. Rien n&apos;est transmis au
            portail patient tant que vous n&apos;avez pas enregistré.
          </Alert>
        )}
        {avertissement && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {avertissement}
          </Alert>
        )}

        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{ mb: 2 }}
          alignItems={{ md: "center" }}
        >
          <TextField
            size="small"
            label="Rechercher"
            value={recherche}
            onChange={(e) => {
              setRecherche(e.target.value);
              setPage(0);
            }}
            sx={{ minWidth: 240 }}
          />
          <TextField
            size="small"
            select
            label="Type"
            value={filtreType}
            onChange={(e) => {
              setFiltreType(e.target.value);
              setPage(0);
            }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="tous">Tous les types</MenuItem>
            {types.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            select
            label="Attribution"
            value={filtreAttribution}
            onChange={(e) => {
              setFiltreAttribution(e.target.value as FiltreAttribution);
              setPage(0);
            }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="tous">Tous</MenuItem>
            <MenuItem value="attribues">Avec code RIS</MenuItem>
            <MenuItem value="non_attribues">Sans code RIS</MenuItem>
          </TextField>
          <Box sx={{ flexGrow: 1 }} />
          <Chip
            label={`${attribues} examen${attribues > 1 ? "s" : ""} proposé${
              attribues > 1 ? "s" : ""
            } au patient`}
            color={attribues > 0 ? "success" : "default"}
            variant="outlined"
          />
        </Stack>

        <TableContainer component={Paper} variant="outlined" sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 1100 }}>
            <TableHead>
              <TableRow>
                <EnTete
                  titre="Pratiqué"
                  aide="Décoché, l'examen n'est jamais proposé au patient."
                  largeur={90}
                />
                <EnTete titre="Type" aide="Notre type d'examen." largeur={90} />
                <EnTete titre="Code interne" aide="Notre code de référence." largeur={140} />
                <EnTete titre="Libellé interne" aide="Notre libellé de référence." />
                <EnTete
                  titre="Code RIS"
                  aide="Le code de cet examen dans VOTRE RIS. Sans lui, l'examen n'est pas réservable."
                  largeur={150}
                />
                <EnTete titre="Type RIS" aide="Le type dans votre RIS. Facultatif." largeur={110} />
                <EnTete
                  titre="Libellé patient"
                  aide="Ce que lit le patient. Vide, notre libellé est utilisé."
                  largeur={200}
                />
                <EnTete
                  titre="Ordonnance"
                  aide="Le portail exige le dépôt d'une ordonnance pour cet examen."
                  largeur={100}
                />
                <EnTete
                  titre="Injecté"
                  aide="Examen avec produit de contraste : déclenche le questionnaire d'injection."
                  largeur={90}
                />
                <EnTete
                  titre="Liste d'attente"
                  aide="Le patient peut s'inscrire si aucun créneau ne lui convient."
                  largeur={120}
                />
              </TableRow>
            </TableHead>
            <TableBody>
              {visibles.map((l) => {
                const enDouble =
                  l.performed && codesRisEnDouble.has(l.codeExamenClient.trim());
                return (
                  <TableRow key={l.codeExamen} hover sx={{ opacity: l.performed ? 1 : 0.5 }}>
                    <TableCell align="center">
                      <Checkbox
                        checked={l.performed}
                        onChange={(e) => maj(l.codeExamen, "performed", e.target.checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {l.typeExamen ?? "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: "monospace" }}>
                        {l.codeExamen}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{l.libelle ?? "—"}</Typography>
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        fullWidth
                        value={l.codeExamenClient}
                        error={enDouble}
                        helperText={enDouble ? "Code en double" : undefined}
                        disabled={!l.performed}
                        onChange={(e) =>
                          maj(l.codeExamen, "codeExamenClient", e.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        fullWidth
                        value={l.typeExamenClient}
                        disabled={!l.performed}
                        onChange={(e) =>
                          maj(l.codeExamen, "typeExamenClient", e.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        fullWidth
                        placeholder={l.libelle ?? ""}
                        value={l.libelleClient}
                        disabled={!l.performed}
                        onChange={(e) => maj(l.codeExamen, "libelleClient", e.target.value)}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Checkbox
                        checked={l.ordoOblig}
                        disabled={!l.performed}
                        onChange={(e) => maj(l.codeExamen, "ordoOblig", e.target.checked)}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Checkbox
                        checked={l.examenInjecte}
                        disabled={!l.performed}
                        onChange={(e) => maj(l.codeExamen, "examenInjecte", e.target.checked)}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Checkbox
                        checked={l.listeAttenteActive}
                        disabled={!l.performed}
                        onChange={(e) =>
                          maj(l.codeExamen, "listeAttenteActive", e.target.checked)
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtrees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 5 }}>
                    <Typography variant="body2" color="text.secondary">
                      {lignes.length === 0
                        ? "Aucun examen au référentiel."
                        : "Aucun examen ne correspond à ces filtres."}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={filtrees.length}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={PAR_PAGE}
            rowsPerPageOptions={[PAR_PAGE]}
            labelRowsPerPage="Par page"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} sur ${count}`}
          />
        </TableContainer>

        {codesRisEnDouble.size > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Un même code RIS est attribué à plusieurs examens. Le portail ne saurait pas
            lequel réserver : chaque code doit être unique.
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
            disabled={enregistrement || codesRisEnDouble.size > 0 || lignes.length === 0}
            sx={{
              bgcolor: "var(--accent)",
              fontWeight: 600,
              "&:hover": { bgcolor: "var(--accent-press)" },
            }}
          >
            {enregistrement ? "Enregistrement…" : "Enregistrer le mapping"}
          </Button>
        </Box>

        <Snackbar
          open={succes}
          autoHideDuration={4000}
          onClose={() => setSucces(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity="success" onClose={() => setSucces(false)}>
            Mapping enregistré. Le portail patient l&apos;appliquera dans la minute.
          </Alert>
        </Snackbar>
      </Box>
    </PageContainer>
  );
}
