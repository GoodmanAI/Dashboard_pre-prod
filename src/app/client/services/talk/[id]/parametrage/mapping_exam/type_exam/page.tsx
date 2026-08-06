"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  IconButton,
  Portal,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  IconArrowLeft,
  IconDeviceFloppy,
  IconInfoCircle,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import ExamTypeBadge, {
  EXAM_TYPE_LABELS,
} from "@/components/shared/ExamTypeBadge";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";

/**
 * Correspondance des Types d'examens (diminutifs) - refonte 2026-08-06.
 * -----------------------------------------------------------------------------
 * Le "diminutif" est le code court que le bot Lyrae utilise en interne pour
 * routing / synthese vocale (ex: US, MG, RX, MR, CT). Les 5 lignes de la
 * table cote back sont indexees 0..4 -> Echographie, Mammographie, Radio,
 * IRM, Scanner (ordre historique de l'API, inchange par cette refonte).
 *
 * Design aligne sur /parametrage/mapping_exam (chantier UI 2026-08-06) :
 * badges couleur ExamTypeBadge partages, save bar sticky, guard modifs.
 */

const BRAND = "#48C8AF";
const BRAND_DARK = "#2C9B85";
const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";
const SURFACE = "#FFFFFF";
const SURFACE_MUTED = "#F7FAFB";
const SURFACE_HOVER = "#F5FBFA";
const DANGER = "#E1573B";
const WARNING = "#F5A623";

// Ordre d'affichage (indice dans la reponse API mappe sur cette liste).
const EXAM_LIST: { label: string; typeCode: string; description: string }[] = [
  {
    label: "Échographie",
    typeCode: "US",
    description: "Examen par ondes ultrasonores.",
  },
  {
    label: "Mammographie",
    typeCode: "MG",
    description: "Radiographie ciblée sur le sein.",
  },
  {
    label: "Radiographie",
    typeCode: "RX",
    description: "Radiographie classique aux rayons X.",
  },
  {
    label: "IRM",
    typeCode: "MR",
    description: "Imagerie par résonance magnétique.",
  },
  {
    label: "Scanner",
    typeCode: "CT",
    description: "Scanner à rayons X (CT scan).",
  },
];

interface TalkPageProps {
  params: { id: string };
}

interface Mapping {
  [code: string]: { fr: string; diminutif: string };
}

export default function EditTypeExam({ params }: TalkPageProps) {
  const userProductId = Number(params.id);
  const router = useRouter();
  const { data: sessionData } = useSession();
  const readOnly = !!sessionData?.user?.isSecretary;

  const [mapping, setMapping] = useState<Mapping>({});
  const [originalMapping, setOriginalMapping] = useState<Mapping>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/configuration/mapping/type_exam?userProductId=${userProductId}`
        );
        const data = await res.json();
        const mapped: Mapping = Object.fromEntries(
          Object.entries(data).map(([code, val]: any, index) => [
            code,
            {
              fr: EXAM_LIST[index]?.label ?? code,
              diminutif: val.diminutif ?? code,
            },
          ])
        );
        setMapping(mapped);
        setOriginalMapping(JSON.parse(JSON.stringify(mapped)));
      } catch {
        setSnack({
          open: true,
          message: "Erreur de chargement",
          severity: "error",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [userProductId]);

  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const code of Object.keys(mapping)) {
      if (mapping[code]?.diminutif !== originalMapping[code]?.diminutif) n++;
    }
    return n;
  }, [mapping, originalMapping]);

  const guard = useUnsavedChangesGuard(dirtyCount > 0, {
    message: `Vous avez ${dirtyCount} modification${
      dirtyCount > 1 ? "s" : ""
    } non enregistrée${dirtyCount > 1 ? "s" : ""}. Voulez-vous vraiment quitter sans sauvegarder ?`,
  });

  const handleChange = (code: string, value: string) => {
    setMapping((prev) => ({
      ...prev,
      [code]: { ...prev[code], diminutif: value.toUpperCase() },
    }));
  };

  const handleReset = () => {
    if (!confirm(`Annuler les ${dirtyCount} modifications non sauvegardées ?`)) return;
    setMapping(JSON.parse(JSON.stringify(originalMapping)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(
        `/api/configuration/mapping/type_exam?userProductId=${userProductId}`,
        {
          method: "POST",
          body: JSON.stringify(mapping),
          headers: { "Content-Type": "application/json" },
        }
      );
      if (!response.ok) throw new Error("Save failed");
      setOriginalMapping(JSON.parse(JSON.stringify(mapping)));
      setSnack({
        open: true,
        message: `${dirtyCount} diminutif${
          dirtyCount > 1 ? "s" : ""
        } enregistré${dirtyCount > 1 ? "s" : ""}`,
        severity: "success",
      });
    } catch {
      setSnack({
        open: true,
        message: "Erreur lors de la sauvegarde",
        severity: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const entries = Object.entries(mapping);

  return (
    <Box sx={{ pb: 12, px: { xs: 2, sm: 3 }, py: 3 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <IconButton
          onClick={() => {
            if (dirtyCount > 0) {
              const ok = confirm(
                `Vous avez ${dirtyCount} modification${
                  dirtyCount > 1 ? "s" : ""
                } non enregistrée${
                  dirtyCount > 1 ? "s" : ""
                }. Quitter sans sauvegarder ?`
              );
              if (!ok) return;
            }
            guard.disable();
            router.back();
          }}
          size="small"
          sx={{
            color: INK_MUTED,
            "&:hover": { color: INK, bgcolor: SURFACE_MUTED },
          }}
        >
          <IconArrowLeft size={18} />
        </IconButton>
        <Box>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              color: INK,
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            Diminutifs des types d&apos;examens
          </Typography>
          <Typography variant="body2" sx={{ color: INK_MUTED, mt: 0.25 }}>
            Code court utilisé par le bot Lyrae pour identifier chaque
            modalité d&apos;imagerie (radiographie, échographie…). Ces
            diminutifs sont techniques et n&apos;apparaissent pas au patient.
          </Typography>
        </Box>
      </Stack>

      {readOnly && (
        <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
          Mode lecture seule — votre compte secrétaire ne permet pas de modifier
          la configuration.
        </Alert>
      )}

      {/* KPI bar */}
      {!loading && dirtyCount > 0 && (
        <Box sx={{ mb: 2 }}>
          <Chip
            size="small"
            label={`${dirtyCount} modification${
              dirtyCount > 1 ? "s" : ""
            } non enregistrée${dirtyCount > 1 ? "s" : ""}`}
            sx={{
              bgcolor: "#FFF4E5",
              color: "#8A5A00",
              fontWeight: 600,
              fontSize: 12,
              height: 24,
              border: `1px solid ${WARNING}`,
            }}
          />
        </Box>
      )}

      {loading ? (
        <Stack alignItems="center" sx={{ py: 8 }}>
          <CircularProgress sx={{ color: BRAND }} />
        </Stack>
      ) : entries.length === 0 ? (
        <Box
          sx={{
            textAlign: "center",
            py: 8,
            border: `1.5px dashed ${BORDER}`,
            borderRadius: 3,
            bgcolor: SURFACE_MUTED,
          }}
        >
          <Typography sx={{ color: INK, fontWeight: 600 }}>
            Aucun type d&apos;examen configuré
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1.5} sx={{ maxWidth: 720 }}>
          {entries.map(([code, item], index) => {
            const meta = EXAM_LIST[index];
            const typeCode = meta?.typeCode ?? "";
            const label = meta?.label ?? item.fr;
            const description = meta?.description ?? "";
            const original = originalMapping[code]?.diminutif ?? "";
            const changed = item.diminutif !== original;

            return (
              <Card
                key={code}
                elevation={0}
                sx={{
                  p: 2,
                  border: `1px solid ${changed ? BRAND : BORDER}`,
                  borderRadius: 2,
                  bgcolor: SURFACE,
                  transition: "all 0.15s ease",
                  "&:hover": {
                    borderColor: changed ? BRAND : "#C8D4DB",
                    bgcolor: SURFACE_HOVER,
                  },
                  ...(changed && {
                    boxShadow: `0 0 0 3px rgba(72, 200, 175, 0.12)`,
                  }),
                }}
              >
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={2}
                  alignItems={{ xs: "stretch", sm: "center" }}
                >
                  {/* Badge + libelle + description */}
                  <Stack
                    direction="row"
                    spacing={1.5}
                    alignItems="center"
                    sx={{ flex: 1, minWidth: 0 }}
                  >
                    {typeCode && (
                      <ExamTypeBadge type={typeCode} variant="large" />
                    )}
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        sx={{
                          fontWeight: 700,
                          color: INK,
                          fontSize: 15,
                          lineHeight: 1.3,
                        }}
                      >
                        {EXAM_TYPE_LABELS[typeCode] ?? label}
                      </Typography>
                      {description && (
                        <Typography
                          variant="caption"
                          sx={{ color: INK_MUTED, display: "block", mt: 0.25 }}
                        >
                          {description}
                        </Typography>
                      )}
                    </Box>
                  </Stack>

                  {/* Input diminutif */}
                  <Box sx={{ minWidth: { sm: 220 } }}>
                    <Typography
                      variant="caption"
                      sx={{
                        color: INK_MUTED,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        display: "block",
                        mb: 0.5,
                      }}
                    >
                      Diminutif
                    </Typography>
                    <TextField
                      value={item.diminutif}
                      onChange={(e) => handleChange(code, e.target.value)}
                      disabled={readOnly}
                      size="small"
                      fullWidth
                      inputProps={{
                        maxLength: 8,
                        style: {
                          fontFamily: "monospace",
                          fontWeight: 700,
                          fontSize: 14,
                          letterSpacing: "0.05em",
                        },
                      }}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          bgcolor: SURFACE,
                          "& fieldset": { borderColor: BORDER },
                          "&:hover fieldset": { borderColor: "#B9C7CE" },
                          "&.Mui-focused fieldset": {
                            borderColor: BRAND,
                            borderWidth: 2,
                          },
                        },
                      }}
                    />
                  </Box>
                </Stack>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* Aide contextuelle */}
      {!loading && entries.length > 0 && (
        <Box sx={{ mt: 3, maxWidth: 720 }}>
          <Stack
            direction="row"
            spacing={1}
            alignItems="flex-start"
            sx={{
              p: 2,
              bgcolor: "#F5FDFB",
              border: `1px solid #D0EEE7`,
              borderRadius: 2,
            }}
          >
            <IconInfoCircle
              size={18}
              color={BRAND_DARK}
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK }}>
                À quoi servent ces diminutifs ?
              </Typography>
              <Typography variant="caption" sx={{ color: INK_MUTED }}>
                Le bot Lyrae les utilise en interne pour classer les demandes
                de rendez-vous par modalité. Ils doivent rester courts (2 à 8
                caractères, sans espaces) et cohérents avec ce que votre
                système RIS/PACS utilise déjà. Les valeurs par défaut (US, MG,
                RX, MR, CT) fonctionnent dans la grande majorité des cas.
              </Typography>
            </Box>
          </Stack>
        </Box>
      )}

      {/* Sticky action bar */}
      <Box
        sx={{
          position: "fixed",
          bottom: 16,
          right: 24,
          zIndex: 10,
          display: "flex",
          gap: 1.5,
          bgcolor: SURFACE,
          border: `1px solid ${BORDER}`,
          borderRadius: 3,
          px: 2,
          py: 1.25,
          boxShadow: "0 10px 30px rgba(15, 42, 63, 0.10)",
          alignItems: "center",
        }}
      >
        {dirtyCount > 0 && !readOnly && (
          <>
            <Typography
              variant="body2"
              sx={{ color: INK_MUTED, fontWeight: 500 }}
            >
              {dirtyCount} modif.
            </Typography>
            <Button
              onClick={handleReset}
              disabled={saving}
              size="small"
              sx={{
                textTransform: "none",
                color: INK_MUTED,
                "&:hover": { color: DANGER },
              }}
            >
              Annuler
            </Button>
          </>
        )}
        {!readOnly && (
          <Button
            size="small"
            variant="contained"
            startIcon={
              saving ? (
                <CircularProgress size={14} sx={{ color: "#fff" }} />
              ) : (
                <IconDeviceFloppy size={15} />
              )
            }
            onClick={handleSave}
            disabled={saving || dirtyCount === 0}
            disableElevation
            sx={{
              bgcolor: BRAND,
              color: "#fff",
              fontWeight: 600,
              textTransform: "none",
              px: 2.5,
              "&:hover": { bgcolor: BRAND_DARK },
              "&.Mui-disabled": { bgcolor: "#D5DFE5", color: "#8FA0AE" },
            }}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        )}
      </Box>

      <Portal>
        <Snackbar
          anchorOrigin={{ vertical: "top", horizontal: "right" }}
          open={snack.open}
          autoHideDuration={3000}
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
        >
          <Alert
            severity={snack.severity}
            variant="filled"
            sx={{
              fontWeight: 500,
              bgcolor: snack.severity === "error" ? DANGER : BRAND_DARK,
            }}
          >
            {snack.message}
          </Alert>
        </Snackbar>
      </Portal>
    </Box>
  );
}
