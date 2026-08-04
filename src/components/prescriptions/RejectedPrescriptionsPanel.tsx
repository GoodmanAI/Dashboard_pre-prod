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
import { IconDownload, IconCheck, IconAlertTriangle } from "@tabler/icons-react";

/**
 * RejectedPrescriptionsPanel (chantier prescriptions rejected 2026-08-04).
 * -----------------------------------------------------------------------------
 * Panneau affichant les ordonnances refusees par Xplore (AI2Xplore a echoue
 * apres N tentatives). Chaque item : infos patient + reason + bouton
 * telecharger + bouton "marquer traite manuellement".
 *
 * Alimente par GET /api/prescriptions/rejected?userProductId=X.
 * Actions :
 *   - Telecharger le PDF : GET /api/prescriptions/rejected/[id]/download
 *   - Marquer traite : POST /api/prescriptions/rejected/[id]/resolve
 *
 * Design cale sur celui de la page "Ordonnances manquantes" (meme card,
 * meme layout Stack, meme chip pour l'age).
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

function formatFrDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
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
    // Ouvre dans un nouvel onglet — le browser gere le download via
    // Content-Disposition: attachment du serveur.
    window.open(`/api/prescriptions/rejected/${id}/download`, "_blank");
  };

  const handleResolve = async (id: number) => {
    if (
      !confirm(
        "Confirmer que cette ordonnance a bien ete redeposee manuellement dans Xplore ?"
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
      setSnack({ msg: "Ordonnance marquee comme traitee.", kind: "success" });
      // Retire l'item de la liste immediatement (optimistic)
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
          Aucune ordonnance rejetee a traiter.
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5, color: "#7A8FA6" }}>
          Xplore a bien accepte toutes les ordonnances deposees recemment.
        </Typography>
      </Card>
    );
  }

  return (
    <>
      <Alert severity="warning" sx={{ mb: 2 }}>
        <strong>{items.length} ordonnance{items.length > 1 ? "s" : ""} refusee{items.length > 1 ? "s" : ""} par Xplore.</strong> Telecharge le PDF, redepose-le
        manuellement dans Xplore, puis clique &laquo; Marquer traite &raquo;.
      </Alert>

      <Stack spacing={2}>
        {items.map((it) => (
          <Card
            key={it.id}
            sx={{
              p: 2,
              borderLeft: "4px solid #ef4444",
              transition: "box-shadow 0.15s",
              "&:hover": { boxShadow: "0 4px 12px rgba(239,68,68,0.15)" },
            }}
          >
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              justifyContent="space-between"
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <IconAlertTriangle size={18} color="#ef4444" />
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#1F3448" }}>
                    {it.firstname} {it.lastname}
                  </Typography>
                  {it.examType && (
                    <Chip
                      size="small"
                      label={EXAM_LABELS[it.examType] ?? it.examType}
                      sx={{ bgcolor: "#F1F5F9", color: "#1F3448" }}
                    />
                  )}
                  <Chip
                    size="small"
                    label={`refuse il y a ${Math.floor(it.hoursSinceRejected)}h`}
                    sx={{ bgcolor: "rgba(239,68,68,0.15)", color: "#b91c1c", fontWeight: 700 }}
                  />
                </Stack>

                <Typography variant="body2" sx={{ color: "#7A8FA6", mb: 1 }}>
                  RDV #{it.rdvId} — Telephone : {it.phone} — RDV le{" "}
                  {formatFrDateTime(it.appointmentDate)}
                </Typography>

                <Alert severity="error" sx={{ mt: 1, py: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
                    Motif de refus Xplore :
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 12 }}>
                    {it.rejectReason ?? "(aucun motif fourni)"}
                  </Typography>
                  {(it.rejectAttempts !== null || it.rejectErrorType) && (
                    <Typography variant="caption" sx={{ color: "#7A8FA6", mt: 0.5, display: "block" }}>
                      {it.rejectAttempts !== null && `${it.rejectAttempts} tentative${it.rejectAttempts > 1 ? "s" : ""}`}
                      {it.rejectAttempts !== null && it.rejectErrorType && " · "}
                      {it.rejectErrorType && `type: ${it.rejectErrorType}`}
                    </Typography>
                  )}
                </Alert>

                <Typography variant="caption" sx={{ color: "#7A8FA6", mt: 1, display: "block" }}>
                  Rejete le {formatFrDateTime(it.rejectedAt)} · Fichier : {formatFileSize(it.fileSize)}
                </Typography>
              </Box>

              <Stack
                direction={{ xs: "row", md: "column" }}
                spacing={1}
                sx={{ minWidth: { md: 180 } }}
              >
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<IconDownload size={16} />}
                  onClick={() => handleDownload(it.id)}
                  sx={{ textTransform: "none", fontWeight: 600 }}
                  fullWidth
                >
                  Telecharger le PDF
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<IconCheck size={16} />}
                  onClick={() => handleResolve(it.id)}
                  disabled={resolving.has(it.id)}
                  sx={{
                    bgcolor: "#48C8AF",
                    "&:hover": { bgcolor: "#3aa896" },
                    textTransform: "none",
                    fontWeight: 600,
                  }}
                  fullWidth
                >
                  {resolving.has(it.id) ? "..." : "Marquer traite"}
                </Button>
              </Stack>
            </Stack>
          </Card>
        ))}
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
