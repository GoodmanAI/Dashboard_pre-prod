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
import ExamTypeBadge, { EXAM_TYPE_SHORT } from "@/components/shared/ExamTypeBadge";

/**
 * Mapping d'examens LyraeKonnect d'un centre.
 *
 * Reprend la direction artistique de l'écran équivalent de LyraeTalk
 * (`talk/[id]/parametrage/mapping_exam`) : mêmes constantes de couleur, même badge
 * de modalité, même densité de table. Un client qui a les deux produits retrouve
 * le même écran ; seules changent les colonnes de droite.
 *
 * Le référentiel NEURACORP est pré-rempli à gauche, le client renseigne les
 * équivalents de son RIS à droite. Quand il a déjà LyraeTalk, les codes en sont
 * repris : même logiciel de gestion, donc mêmes codes.
 *
 * Trois réglages n'existent que dans ce produit, parce qu'ils pilotent des écrans
 * du parcours web que le robot vocal n'a pas :
 *
 * - Ordonnance obligatoire : le portail exige le dépôt d'une ordonnance ;
 * - Injecté : déclenche le questionnaire d'injection ;
 * - Liste d'attente : le patient s'inscrit si aucun créneau ne lui convient.
 */

const BRAND = "var(--accent)";
const BRAND_DARK = "var(--accent-press)";
const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";
const SURFACE = "#FFFFFF";
const SURFACE_MUTED = "#F7FAFB";
const SURFACE_HOVER = "#F5FBFA";
const DANGER = "#E1573B";

const PAR_PAGE = 25;

type Ligne = {
  codeExamen: string;
  typeExamen: string | null;
  libelle: string | null;
  codeExamenClient: string;
  codeExamenInjection: string;
  typeExamenClient: string;
  libelleClient: string;
  performed: boolean;
  ordoOblig: boolean;
  examenInjecte: boolean;
  listeAttenteActive: boolean;
};

type FiltreAttribution = "tous" | "attribues" | "non_attribues";

function EnTete({
  children,
  aide,
  largeur,
  align = "left",
}: {
  children: React.ReactNode;
  aide?: string;
  largeur?: number;
  align?: "left" | "center";
}) {
  const cellule = (
    <TableCell
      align={align}
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

/** Champ de saisie compact, à la densité de la table de LyraeTalk. */
function Champ({
  valeur,
  onChange,
  disabled,
  erreur,
  placeholder,
}: {
  valeur: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  erreur?: boolean;
  placeholder?: string;
}) {
  return (
    <TextField
      size="small"
      fullWidth
      value={valeur}
      disabled={disabled}
      error={erreur}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      sx={{
        "& .MuiOutlinedInput-root": {
          fontSize: 13,
          bgcolor: disabled ? "transparent" : SURFACE,
          "& fieldset": { borderColor: BORDER },
          "&:hover fieldset": { borderColor: BRAND },
          "&.Mui-focused fieldset": { borderColor: BRAND },
        },
      }}
    />
  );
}

/** Case à cocher aux couleurs du produit actif. */
function Case({
  coche,
  onChange,
  disabled,
}: {
  coche: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Checkbox
      checked={coche}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      sx={{ color: BORDER, "&.Mui-checked": { color: BRAND } }}
    />
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
        // Seul le cas « rien à proposer » mérite un message : d'où viennent les
        // lignes n'intéresse pas le client, il veut juste remplir son tableau.
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
   * Deux lignes qui visent le même code : le portail ne saurait pas laquelle
   * réserver. Marqué ici sur les lignes fautives, et refusé par l'API.
   */
  const codesEnDouble = useMemo(() => {
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
          <CircularProgress sx={{ color: BRAND }} />
        </Box>
      </PageContainer>
    );
  }

  const visibles = filtrees.slice(page * PAR_PAGE, page * PAR_PAGE + PAR_PAGE);

  return (
    <PageContainer title="Mapping d'examens" description="Correspondance avec votre RIS">
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700, color: INK, mb: 0.5 }}>
          Mapping d&apos;examens
        </Typography>
        <Typography variant="body2" sx={{ color: INK_MUTED, mb: 2.5 }}>
          À gauche, notre référentiel. À droite, les codes de{" "}
          <strong>votre logiciel de gestion</strong> : ce sont eux qui servent à créer
          le rendez-vous, ils doivent correspondre exactement. Un examen sans code
          n&apos;est pas proposé au patient.
        </Typography>

        {avertissement && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {avertissement}
          </Alert>
        )}

        <Paper
          variant="outlined"
          sx={{ p: 2, mb: 2, borderColor: BORDER, borderRadius: 2, bgcolor: SURFACE }}
        >
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            alignItems={{ md: "center" }}
          >
            <TextField
              size="small"
              placeholder="Rechercher un examen"
              value={recherche}
              onChange={(e) => {
                setRecherche(e.target.value);
                setPage(0);
              }}
              sx={{ minWidth: 260 }}
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
              sx={{ minWidth: 170 }}
            >
              <MenuItem value="tous">Tous les types</MenuItem>
              {types.map((t) => (
                <MenuItem key={t} value={t}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <ExamTypeBadge type={t} variant="compact" />
                    <Typography variant="body2">{EXAM_TYPE_SHORT[t] ?? t}</Typography>
                  </Stack>
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
              <MenuItem value="attribues">Avec code</MenuItem>
              <MenuItem value="non_attribues">Sans code</MenuItem>
            </TextField>
            <Box sx={{ flexGrow: 1 }} />
            <Chip
              label={`${attribues} examen${attribues > 1 ? "s" : ""} proposé${
                attribues > 1 ? "s" : ""
              } au patient`}
              sx={{
                fontWeight: 600,
                color: attribues > 0 ? BRAND_DARK : INK_MUTED,
                bgcolor: attribues > 0 ? "rgba(var(--accent-rgb), 0.12)" : SURFACE_MUTED,
              }}
            />
          </Stack>
        </Paper>

        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{ overflowX: "auto", borderColor: BORDER, borderRadius: 2 }}
        >
          <Table size="small" sx={{ minWidth: 1300 }}>
            <TableHead>
              <TableRow>
                <EnTete
                  aide="Décoché, l'examen n'est jamais proposé au patient."
                  largeur={90}
                  align="center"
                >
                  Pratiqué
                </EnTete>
                <EnTete aide="Notre référentiel : modalité, libellé et code internes.">
                  Examen
                </EnTete>
                <EnTete
                  aide="Le code de cet examen dans votre logiciel de gestion. Sans lui, l'examen n'est pas réservable."
                  largeur={150}
                >
                  Code
                </EnTete>
                <EnTete
                  aide="Le code de la version AVEC injection, si votre logiciel en a un distinct. Laissez vide sinon."
                  largeur={150}
                >
                  Code injecté
                </EnTete>
                <EnTete aide="Le type dans votre logiciel. Facultatif." largeur={110}>
                  Type
                </EnTete>
                <EnTete
                  aide="Ce que lit le patient. Laissé vide, notre libellé est utilisé."
                  largeur={210}
                >
                  Libellé patient
                </EnTete>
                <EnTete
                  aide="Le portail exige le dépôt d'une ordonnance pour cet examen."
                  largeur={105}
                  align="center"
                >
                  Ordonnance
                </EnTete>
                <EnTete
                  aide="Examen avec produit de contraste. Déclenche le questionnaire d'injection."
                  largeur={90}
                  align="center"
                >
                  Injecté
                </EnTete>
                <EnTete
                  aide="Le patient peut s'inscrire si aucun créneau ne lui convient."
                  largeur={120}
                  align="center"
                >
                  Liste d&apos;attente
                </EnTete>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibles.map((l) => {
                const enDouble = l.performed && codesEnDouble.has(l.codeExamenClient.trim());
                return (
                  <TableRow
                    key={l.codeExamen}
                    hover
                    sx={{
                      "&:nth-of-type(odd)": { bgcolor: "#FBFDFC" },
                      "&:hover": { bgcolor: SURFACE_HOVER + " !important" },
                      "& > td": { borderBottom: `1px solid ${BORDER}`, py: 1 },
                      opacity: l.performed ? 1 : 0.45,
                    }}
                  >
                    <TableCell align="center">
                      <Case
                        coche={l.performed}
                        onChange={(v) => maj(l.codeExamen, "performed", v)}
                      />
                    </TableCell>

                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <ExamTypeBadge type={l.typeExamen ?? ""} />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            sx={{
                              fontWeight: 600,
                              fontSize: 13,
                              color: INK,
                              lineHeight: 1.3,
                            }}
                          >
                            {l.libelle ?? l.codeExamen}
                          </Typography>
                          <Typography
                            sx={{ fontSize: 11, color: INK_MUTED, fontFamily: "monospace" }}
                          >
                            {l.codeExamen}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>

                    <TableCell>
                      <Champ
                        valeur={l.codeExamenClient}
                        erreur={enDouble}
                        disabled={!l.performed}
                        onChange={(v) => maj(l.codeExamen, "codeExamenClient", v)}
                      />
                      {enDouble && (
                        <Typography sx={{ fontSize: 11, color: DANGER, mt: 0.25 }}>
                          Code en double
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Champ
                        valeur={l.codeExamenInjection ?? ""}
                        disabled={!l.performed}
                        onChange={(v) => maj(l.codeExamen, "codeExamenInjection", v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Champ
                        valeur={l.typeExamenClient}
                        disabled={!l.performed}
                        onChange={(v) => maj(l.codeExamen, "typeExamenClient", v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Champ
                        valeur={l.libelleClient}
                        placeholder={l.libelle ?? ""}
                        disabled={!l.performed}
                        onChange={(v) => maj(l.codeExamen, "libelleClient", v)}
                      />
                    </TableCell>

                    <TableCell align="center">
                      <Case
                        coche={l.ordoOblig}
                        disabled={!l.performed}
                        onChange={(v) => maj(l.codeExamen, "ordoOblig", v)}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Case
                        coche={l.examenInjecte}
                        disabled={!l.performed}
                        onChange={(v) => maj(l.codeExamen, "examenInjecte", v)}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Case
                        coche={l.listeAttenteActive}
                        disabled={!l.performed}
                        onChange={(v) => maj(l.codeExamen, "listeAttenteActive", v)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtrees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                    <Typography variant="body2" sx={{ color: INK_MUTED }}>
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
            labelDisplayedRows={({ from, to, count }) => `${from} à ${to} sur ${count}`}
            sx={{ borderTop: `1px solid ${BORDER}`, color: INK_MUTED }}
          />
        </TableContainer>

        {codesEnDouble.size > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Un même code est attribué à plusieurs examens. Le portail ne saurait pas
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
            disabled={enregistrement || codesEnDouble.size > 0 || lignes.length === 0}
            sx={{
              bgcolor: BRAND,
              fontWeight: 600,
              textTransform: "none",
              px: 3,
              "&:hover": { bgcolor: BRAND_DARK },
              "&.Mui-disabled": { bgcolor: "#D5DFE5", color: "#8FA0AE" },
            }}
          >
            {enregistrement ? "Enregistrement en cours" : "Enregistrer le mapping"}
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
