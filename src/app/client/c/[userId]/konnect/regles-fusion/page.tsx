"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  IconButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import { useCentreProduit } from "@/hooks/useCentreProduit";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import ExamTypeBadge, { toExamTypeCode } from "@/components/shared/ExamTypeBadge";
import BarreEnregistrement from "@/components/shared/BarreEnregistrement";
import { useSuiviModifications } from "@/hooks/useSuiviModifications";

/**
 * Règles de fusion d'examens (lot E).
 *
 * Quand un patient demande plusieurs examens qui se font en une seule fois, le
 * portail ne réserve pas un créneau par examen : il les remplace par un examen
 * unique, avec le code que le logiciel de gestion attend pour cet acte groupé.
 *
 * Deux examens au minimum par règle, et le code de l'acte groupé est obligatoire :
 * sans lui il n'y a rien à réserver. Konnect écarte silencieusement toute règle
 * dont un examen n'existe pas chez lui, en bloc et jamais à moitié, pour ne pas
 * convoquer le patient pour un acte qu'il n'a pas demandé.
 *
 * Passe par le socle générique (`/api/product-config`).
 */

const DOMAINE = "konnect.regles-fusion";

const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";
const SURFACE = "#FFFFFF";

type Regle = {
  examens: string[];
  code_ris: string;
  libelle_patient: string;
  actif: boolean;
};

type Examen = { code: string; libelle: string; type: string | null };

const REGLE_VIDE: Regle = { examens: [], code_ris: "", libelle_patient: "", actif: true };

export default function ReglesFusionKonnect() {
  const { userProductId } = useCentreProduit();

  const [regles, setRegles] = useState<Regle[]>([]);
  const [initial, setInitial] = useState<Regle[]>([]);
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
        const [rConfig, rExamens] = await Promise.all([
          fetch(`/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE}`),
          fetch(`/api/konnect-examens?userProductId=${userProductId}`),
        ]);
        if (!rConfig.ok) throw new Error("Chargement impossible.");
        const dConfig = await rConfig.json();
        if (annule) return;

        const items: any[] = Array.isArray(dConfig?.valeur?.items) ? dConfig.valeur.items : [];
        const chargees: Regle[] = items.map((r) => ({
          examens: Array.isArray(r?.examens) ? r.examens.map(String) : [],
          code_ris: String(r?.code_ris ?? ""),
          libelle_patient: String(r?.libelle_patient ?? ""),
          actif: r?.actif !== false,
        }));
        setRegles(chargees);
        setInitial(chargees);

        if (rExamens.ok) {
          const dEx = await rExamens.json();
          const brut: any[] = Array.isArray(dEx.examens) ? dEx.examens : [];
          setExamens(
            brut
              .filter((e) => e?.performed !== false && String(e?.codeExamen ?? "").trim())
              .map((e) => ({
                code: String(e.codeExamen).trim(),
                libelle:
                  String(e.libelleClient ?? "").trim() ||
                  String(e.libelle ?? "").trim() ||
                  String(e.codeExamen).trim(),
                type:
                  toExamTypeCode(String(e.typeExamenClient ?? "").trim()) ??
                  toExamTypeCode(String(e.typeExamen ?? "").trim()),
              }))
          );
        }
      } catch {
        if (!annule) setErreur("Impossible de charger les règles de fusion.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  const infoExamen = useMemo(() => {
    const m = new Map(examens.map((e) => [e.code, e]));
    return (code: string): Examen => m.get(code) ?? { code, libelle: code, type: null };
  }, [examens]);

  function maj(index: number, champ: keyof Regle, valeur: any) {
    setRegles((p) => p.map((r, i) => (i === index ? { ...r, [champ]: valeur } : r)));
  }

  const etatSuivi = useMemo(() => {
    const out: Record<string, unknown> = {};
    regles.forEach((r, i) => {
      out[`regle:${i}`] = r;
    });
    return out;
  }, [regles]);

  const { modifications, marquerEnregistre } = useSuiviModifications(etatSuivi, !chargement);

  const blocage = useMemo(() => {
    const i = regles.findIndex((r) => r.examens.length < 2);
    if (i >= 0) return `La règle ${i + 1} doit grouper au moins deux examens.`;
    const j = regles.findIndex((r) => !r.code_ris.trim());
    if (j >= 0) return `Il manque le code de l'acte groupé sur la règle ${j + 1}.`;
    const k = regles.findIndex((r) => !r.libelle_patient.trim());
    if (k >= 0) return `Il manque le nom vu par le patient sur la règle ${k + 1}.`;
    return null;
  }, [regles]);

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      const items = regles.map((r) => ({
        examens: r.examens,
        code_ris: r.code_ris.trim(),
        libelle_patient: r.libelle_patient.trim(),
        actif: r.actif,
      }));
      const r = await fetch(
        `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valeur: { items } }),
        }
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "Enregistrement refusé.");
      setInitial(regles);
      marquerEnregistre();
      setSucces(true);
    } catch (e: any) {
      setErreur(e?.message ?? "Enregistrement impossible.");
    } finally {
      setEnregistrement(false);
    }
  }

  if (chargement) {
    return (
      <PageContainer title="Règles de fusion" description="Examens groupés en un seul">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: "var(--accent)" }} />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Règles de fusion" description="Examens groupés en un seul">
      <Box>
        <SectionHeader
          title="Règles de fusion"
          subtitle="Plusieurs examens demandés, un seul rendez-vous"
        />

        <Typography variant="body2" sx={{ color: INK_MUTED, mb: 2.5 }}>
          Certains examens se font en une seule fois. Quand un patient les demande
          ensemble, le portail les remplace par un examen unique, avec le code que
          votre logiciel attend pour cet acte groupé. Il faut au moins deux examens par
          règle.
        </Typography>

        {examens.length === 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Aucun examen dans votre mapping. Complétez le mapping d&apos;examens pour
            pouvoir créer une règle.
          </Alert>
        )}

        <Stack spacing={2}>
          {regles.map((r, i) => (
            <Paper
              key={i}
              variant="outlined"
              sx={{
                borderColor: BORDER,
                borderRadius: 2,
                p: 2,
                opacity: r.actif ? 1 : 0.6,
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK, flexGrow: 1 }}>
                  Règle {i + 1}
                </Typography>
                <Tooltip title={r.actif ? "Règle appliquée" : "Règle en pause"}>
                  <Switch
                    size="small"
                    checked={r.actif}
                    onChange={(e) => maj(i, "actif", e.target.checked)}
                  />
                </Tooltip>
                <Tooltip title="Supprimer cette règle">
                  <IconButton
                    size="small"
                    onClick={() => setRegles((p) => p.filter((_, j) => j !== i))}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>

              <Typography sx={{ fontSize: 11.5, color: INK_MUTED, mb: 0.75 }}>
                Quand le patient demande ces examens
              </Typography>
              <Select
                multiple
                size="small"
                fullWidth
                value={r.examens}
                onChange={(e) =>
                  maj(
                    i,
                    "examens",
                    typeof e.target.value === "string"
                      ? e.target.value.split(",")
                      : e.target.value
                  )
                }
                error={r.examens.length < 2}
                sx={{ fontSize: 13, bgcolor: SURFACE, mb: 2 }}
                renderValue={(selection) => (
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {(selection as string[]).map((code) => (
                      <Chip
                        key={code}
                        size="small"
                        label={infoExamen(code).libelle}
                        sx={{ height: 22, fontSize: 11.5 }}
                      />
                    ))}
                  </Stack>
                )}
              >
                {examens.map((e) => (
                  <MenuItem key={e.code} value={e.code}>
                    <Checkbox size="small" checked={r.examens.includes(e.code)} />
                    {e.type ? (
                      <ExamTypeBadge type={e.type} variant="compact" sx={{ mr: 1 }} />
                    ) : (
                      <Box sx={{ width: 26, mr: 1 }} />
                    )}
                    <ListItemText
                      primary={e.libelle}
                      secondary={e.code}
                      primaryTypographyProps={{ fontSize: 13 }}
                      secondaryTypographyProps={{ fontSize: 11.5 }}
                    />
                  </MenuItem>
                ))}
              </Select>

              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: 11.5, color: INK_MUTED, mb: 0.75 }}>
                    Le code de l&apos;acte groupé, dans votre logiciel
                  </Typography>
                  <TextField
                    size="small"
                    fullWidth
                    value={r.code_ris}
                    error={!r.code_ris.trim()}
                    onChange={(e) => maj(i, "code_ris", e.target.value)}
                    sx={{ "& .MuiOutlinedInput-root": { fontSize: 13, bgcolor: SURFACE } }}
                  />
                </Box>
                <Box sx={{ flex: 1.5 }}>
                  <Typography sx={{ fontSize: 11.5, color: INK_MUTED, mb: 0.75 }}>
                    Le nom que le patient verra
                  </Typography>
                  <TextField
                    size="small"
                    fullWidth
                    value={r.libelle_patient}
                    error={!r.libelle_patient.trim()}
                    onChange={(e) => maj(i, "libelle_patient", e.target.value)}
                    sx={{ "& .MuiOutlinedInput-root": { fontSize: 13, bgcolor: SURFACE } }}
                  />
                </Box>
              </Stack>
            </Paper>
          ))}
        </Stack>

        {regles.length === 0 && (
          <Paper variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2, py: 5 }}>
            <Typography variant="body2" align="center" sx={{ color: INK_MUTED }}>
              Aucune règle. Chaque examen demandé donne son propre rendez-vous.
            </Typography>
          </Paper>
        )}

        <Stack direction="row" sx={{ mt: 2 }}>
          <Button
            startIcon={<AddIcon />}
            disabled={examens.length === 0}
            onClick={() => setRegles((p) => [...p, { ...REGLE_VIDE }])}
            sx={{ textTransform: "none", color: INK }}
          >
            Ajouter une règle
          </Button>
        </Stack>

        {erreur && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {erreur}
          </Alert>
        )}

        <BarreEnregistrement
          modifications={modifications}
          enregistrement={enregistrement}
          onEnregistrer={enregistrer}
          onAnnuler={() => setRegles(initial)}
          blocage={blocage}
          libelle="Enregistrer les règles"
        />

        <Snackbar
          open={succes}
          autoHideDuration={4000}
          onClose={() => setSucces(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity="success" onClose={() => setSucces(false)}>
            Règles enregistrées. Le portail patient les appliquera dans la minute.
          </Alert>
        </Snackbar>
      </Box>
    </PageContainer>
  );
}
