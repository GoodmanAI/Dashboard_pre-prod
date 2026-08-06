"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { Phone, Event, WarningAmber } from "@mui/icons-material";
import { IconCheck, IconDownload } from "@tabler/icons-react";
import ExamTypeBadge, { toExamTypeCode } from "@/components/shared/ExamTypeBadge";

/**
 * RejectedPrescriptionsPanel (refonte 2026-08-06).
 * -----------------------------------------------------------------------------
 * Ordonnances rejetees par Xplore (AI2Xplore a echoue apres N tentatives).
 *
 * Design cale sur la card "en attente patient" de /ordonnances-manquantes :
 *   - Borde gauche rouge (au lieu d'orange pour pending)
 *   - Icone WarningAmber + nom patient + chip "refuse il y a Xh"
 *   - Ligne telephone (monospace, selectable)
 *   - Ligne type examen + date RDV + chip heure
 *   - Actions droite : Telecharger PDF + Marquer traite
 *
 * Ne montre PAS :
 *   - Le rdvId (feedback user : bruit visuel inutile)
 *   - Le motif Xplore / rejectAttempts / rejectErrorType (info technique
 *     debug, sortie de l'UI client)
 *
 * Endpoints : GET /api/prescriptions/rejected, POST .../resolve,
 * GET .../download.
 */

const EXAM_LABELS: Record<string, string> = {
  scanner: "Scanner",
  irm: "IRM",
  mammo: "Mammographie",
  radiographie: "Radiographie",
  echographie: "Echographie",
};

type RejectedItem = {
  id: number;
  rdvId: string;
  phone: string;
  firstname: string;
  lastname: string;
  appointmentDate: string | null;
  examType: string | null;
  rejectedAt: string;
  rejectReason: string | null;
  rejectAttempts: number | null;
  rejectErrorType: string | null;
  fileSize: number | null;
  hoursSinceRejected: number;
};

// -- Formatters (repris du pattern PendingPrescriptions) --

function formatFrDateOnly(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatFrTimeOnly(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFrDateShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPhoneFr(phone: string): string {
  if (!phone) return "";
  // 0612345678 -> 06 12 34 56 78
  const clean = phone.replace(/\D/g, "");
  if (clean.length === 10) {
    return clean.match(/.{1,2}/g)?.join(" ") ?? phone;
  }
  return phone;
}

export default function RejectedPrescriptionsPanel({
  userProductId,
}: {
  userProductId: number;
}) {
  const [items, setItems] = useState<RejectedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Set<number>>(new Set());
  const [snack, setSnack] = useState<{ msg: string; kind: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(userProductId)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/prescriptions/rejected?userProductId=${userProductId}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e: any) {
      setError(e?.message ?? "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [userProductId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDownload = (id: number) => {
    // Le browser gere le download via Content-Disposition: attachment.
    window.open(`/api/prescriptions/rejected/${id}/download`, "_blank");
  };

  const handleResolve = async (id: number) => {
    if (
      !confirm(
        "Confirmer que cette ordonnance a bien été redéposée manuellement dans Xplore ?"
      )
    )
      return;
    setResolving((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/prescriptions/rejected/${id}/resolve`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSnack({ msg: "Ordonnance marquée comme traitée.", kind: "success" });
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch (e: any) {
      setSnack({ msg: e?.message ?? "Erreur", kind: "error" });
    } finally {
      setResolving((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <Stack alignItems="center" sx={{ py: 6 }}>
        <CircularProgress sx={{ "& .MuiCircularProgress-svg": { color: "#48C8AF" } }} />
      </Stack>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (items.length === 0) {
    return (
      <Card sx={{ p: 4, textAlign: "center", bgcolor: "#F0FDF4" }}>
        <IconCheck size={32} color="#16a34a" />
        <Typography sx={{ mt: 1, color: "#15803d", fontWeight: 600 }}>
          Aucune ordonnance rejetée à traiter.
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5, color: "#7A8FA6" }}>
          Xplore a bien accepté toutes les ordonnances déposées récemment.
        </Typography>
      </Card>
    );
  }

  return (
    <>
      <Alert severity="warning" sx={{ mb: 2 }}>
        <strong>
          {items.length} ordonnance{items.length > 1 ? "s" : ""} refusée
          {items.length > 1 ? "s" : ""} par Xplore.
        </strong>{" "}
        Téléchargez le PDF, redéposez-le manuellement dans Xplore, puis cliquez
        sur « Marquer traité ».
      </Alert>

      <Stack spacing={2}>
        {items.map((it) => {
          const examLabel = it.examType
            ? EXAM_LABELS[it.examType] ?? it.examType
            : "Examen non spécifié";
          const formattedPhone = formatPhoneFr(it.phone);
          const hoursSince = Math.round(it.hoursSinceRejected);

          return (
            <Card
              key={it.id}
              elevation={1}
              sx={{
                borderLeft: "4px solid #b91c1c",
                p: { xs: 2, sm: 2.5 },
              }}
            >
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                justifyContent="space-between"
                alignItems={{ xs: "stretch", md: "center" }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {/* Ligne 1 : icone warn + nom + chip age */}
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1.5}
                    sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 1 }}
                  >
                    <WarningAmber sx={{ color: "#b91c1c" }} />
                    <Typography variant="h6" fontWeight={700}>
                      {it.firstname} {it.lastname.toUpperCase()}
                    </Typography>
                    <Chip
                      size="small"
                      label={`refusée il y a ${hoursSince}h`}
                      sx={{
                        bgcolor: "rgba(185,28,28,0.15)",
                        color: "#b91c1c",
                        fontWeight: 700,
                      }}
                    />
                  </Stack>

                  {/* Ligne 2 : icone tel + numero formate */}
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{ mb: 1.5 }}
                  >
                    <Phone sx={{ fontSize: 20, color: "#2a6f64" }} />
                    <Typography
                      variant="body1"
                      sx={{
                        fontWeight: 700,
                        color: "#2a6f64",
                        fontFamily: "monospace",
                        letterSpacing: 0.5,
                        userSelect: "all",
                      }}
                    >
                      {formattedPhone}
                    </Typography>
                  </Stack>

                  {/* Ligne 3 : type examen + date RDV + chip heure */}
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{ mb: 0.5, flexWrap: "wrap", rowGap: 0.5 }}
                  >
                    {toExamTypeCode(it.examType) && (
                      <ExamTypeBadge type={toExamTypeCode(it.examType)!} />
                    )}
                    <Typography
                      variant="subtitle1"
                      sx={{ fontWeight: 700, color: "#1F3448" }}
                    >
                      {examLabel}
                    </Typography>
                    <Typography variant="body2" sx={{ color: "#7A8FA6" }}>
                      ·
                    </Typography>
                    <Event sx={{ fontSize: 18, color: "#7A8FA6" }} />
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600, color: "#1F3448" }}
                    >
                      {formatFrDateOnly(it.appointmentDate)}
                    </Typography>
                    {formatFrTimeOnly(it.appointmentDate) && (
                      <Chip
                        size="small"
                        label={formatFrTimeOnly(it.appointmentDate)}
                        sx={{
                          bgcolor: "#E6F7F3",
                          color: "#2a6f64",
                          fontWeight: 700,
                          fontFamily: "monospace",
                          height: 22,
                        }}
                      />
                    )}
                  </Stack>

                  <Typography variant="caption" color="text.secondary">
                    Refusée le {formatFrDateShort(it.rejectedAt)}
                  </Typography>
                </Box>

                {/* Actions : Telecharger + Marquer traite */}
                <Stack
                  direction={{ xs: "row", md: "column" }}
                  spacing={1}
                  sx={{ flexShrink: 0, minWidth: { md: 200 } }}
                >
                  <Button
                    variant="outlined"
                    startIcon={<IconDownload size={16} />}
                    onClick={() => handleDownload(it.id)}
                    fullWidth
                    sx={{
                      textTransform: "none",
                      fontWeight: 600,
                      borderColor: "#E4EAEE",
                      color: "#1F3448",
                      "&:hover": {
                        borderColor: "#48C8AF",
                        color: "#48C8AF",
                        bgcolor: "#F5FDFB",
                      },
                    }}
                  >
                    Télécharger PDF
                  </Button>
                  <Button
                    variant="contained"
                    disabled={resolving.has(it.id)}
                    onClick={() => handleResolve(it.id)}
                    fullWidth
                    disableElevation
                    sx={{
                      bgcolor: "#48C8AF",
                      "&:hover": { bgcolor: "#3AB19B" },
                      textTransform: "none",
                      fontWeight: 600,
                    }}
                  >
                    {resolving.has(it.id) ? (
                      <CircularProgress size={20} sx={{ color: "#FFF" }} />
                    ) : (
                      "Marquer traité"
                    )}
                  </Button>
                </Stack>
              </Stack>
            </Card>
          );
        })}
      </Stack>

      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          severity={snack?.kind ?? "success"}
          onClose={() => setSnack(null)}
          sx={{ width: "100%" }}
        >
          {snack?.msg}
        </Alert>
      </Snackbar>
    </>
  );
}
