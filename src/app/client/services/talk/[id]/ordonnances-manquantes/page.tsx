"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  IconButton,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { ContentCopy, WarningAmber, CheckCircle } from "@mui/icons-material";
import { IconInfoCircle } from "@tabler/icons-react";
import SectionHeader from "@/components/admin/SectionHeader";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";

/* =============================================================================
   Page "Ordonnances manquantes"
   -----------------------------------------------------------------------------
   Liste les alertes actives : RDVs pour lesquels un lien de depot d'ordonnance
   a ete envoye au patient mais aucun PDF n'a ete recu apres le delai configure
   (defaut 48h). La secretaire voit :
     - Nom + telephone patient (copiable)
     - Date de RDV + type d'examen
     - Depuis combien de temps le lien SMS a ete envoye
   Elle appelle le patient, puis "Marquer traite" fait disparaitre la carte.
============================================================================= */

const EXAM_LABELS: Record<string, string> = {
  scanner: "Scanner",
  irm: "IRM",
  mammo: "Mammographie",
  radiographie: "Radiographie",
  echographie: "Echographie",
};

type AlertItem = {
  id: number;
  rdvId: string;
  phone: string;
  firstname: string;
  lastname: string;
  appointmentDate: string | null;
  examType: string | null;
  status: string;
  createdAt: string;
  alertRaisedAt: string;
  hoursSinceCreated: number;
  hoursSinceAlert: number;
};

function formatFrDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPhoneFr(raw: string): string {
  // Format "06 12 34 56 78" pour lisibilite
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  }
  return raw;
}

interface Props {
  params: { id: string };
}

export default function OrdonnancesManquantesPage({ params }: Props) {
  const userProductId = Number(params.id);
  const [items, setItems] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Set<number>>(new Set());
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: "success" | "error" | "info" }>(
    { open: false, msg: "", sev: "success" }
  );

  const load = useCallback(async () => {
    if (!userProductId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/prescriptions/alerts?userProductId=${userProductId}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err: any) {
      setError(err?.message || "Impossible de charger les alertes");
    } finally {
      setLoading(false);
    }
  }, [userProductId]);

  useEffect(() => {
    load();
    // Rafraichissement automatique toutes les 5 min pour voir arriver les nouvelles alertes
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  const handleCopy = useCallback((phone: string) => {
    navigator.clipboard.writeText(phone).then(
      () => setSnack({ open: true, msg: `Numero copie : ${phone}`, sev: "info" }),
      () => setSnack({ open: true, msg: "Impossible de copier", sev: "error" })
    );
  }, []);

  const handleResolve = useCallback(
    async (id: number) => {
      setResolving((prev) => new Set(prev).add(id));
      try {
        const res = await fetch(`/api/prescriptions/alerts/${id}/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userProductId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        setItems((prev) => prev.filter((i) => i.id !== id));
        setSnack({ open: true, msg: "Alerte marquee comme traitee", sev: "success" });
      } catch (err: any) {
        setSnack({ open: true, msg: err?.message || "Echec", sev: "error" });
      } finally {
        setResolving((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [userProductId]
  );

  const orderedItems = useMemo(
    () => [...items].sort((a, b) => b.hoursSinceAlert - a.hoursSinceAlert),
    [items]
  );

  return (
    <PageContainer
      title="Ordonnances manquantes"
      description="RDVs pour lesquels aucune ordonnance n'a ete deposee dans les delais"
    >
      <Box>
        <SectionHeader
          title="Ordonnances manquantes"
          subtitle="Alertes actives : patients a rappeler pour recuperer leur ordonnance"
          actions={
            <Chip
              size="small"
              label={loading ? "chargement…" : `${orderedItems.length} en attente`}
              sx={{
                bgcolor: orderedItems.length > 0 ? "rgba(239,68,68,0.15)" : "rgba(72,200,175,0.15)",
                color: orderedItems.length > 0 ? "#b91c1c" : "#2a6f64",
                fontWeight: 700,
              }}
            />
          }
        />

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress sx={{ color: "#48C8AF" }} />
          </Stack>
        ) : orderedItems.length === 0 ? (
          <Card elevation={1} sx={{ p: 5, textAlign: "center" }}>
            <CheckCircle sx={{ fontSize: 56, color: "#22C55E", mb: 1.5 }} />
            <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
              Aucune alerte en cours
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Tous les RDVs necessitant une ordonnance sont a jour, ou aucun delai n&apos;a
              encore ete depasse.
            </Typography>
          </Card>
        ) : (
          <Stack spacing={2}>
            <Alert
              severity="info"
              icon={<IconInfoCircle size={20} />}
              sx={{ borderRadius: 2 }}
            >
              Cliquez sur le numero pour le copier. Une fois le patient rappele, cliquez
              &laquo; Marquer traite &raquo; pour retirer la carte de la liste. Le RDV reste
              en attente d&apos;ordonnance tant que le PDF n&apos;a pas ete depose sur la
              plateforme.
            </Alert>

            {orderedItems.map((item) => {
              const critical = item.hoursSinceAlert > 24; // 24h+ depuis alerte = tres en retard
              const examLabel = item.examType
                ? EXAM_LABELS[item.examType] ?? item.examType
                : "Examen non specifie";
              const formattedPhone = formatPhoneFr(item.phone);

              return (
                <Card
                  key={item.id}
                  elevation={1}
                  sx={{
                    borderLeft: `4px solid ${critical ? "#b91c1c" : "#EA580C"}`,
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
                      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                        <WarningAmber sx={{ color: critical ? "#b91c1c" : "#EA580C" }} />
                        <Typography variant="h6" fontWeight={700}>
                          {item.firstname} {item.lastname.toUpperCase()}
                        </Typography>
                        <Chip
                          size="small"
                          label={`${Math.round(item.hoursSinceAlert)}h depuis alerte`}
                          sx={{
                            bgcolor: critical ? "rgba(185,28,28,0.15)" : "rgba(234,88,12,0.15)",
                            color: critical ? "#b91c1c" : "#c2410c",
                            fontWeight: 700,
                          }}
                        />
                      </Stack>

                      <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 1, sm: 3 }} sx={{ mb: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography variant="body2" color="text.secondary">
                            📞
                          </Typography>
                          <Typography
                            variant="body1"
                            component="a"
                            href={`tel:${item.phone.replace(/\D/g, "")}`}
                            sx={{
                              fontWeight: 700,
                              color: "#2a6f64",
                              textDecoration: "none",
                              "&:hover": { textDecoration: "underline" },
                              fontFamily: "monospace",
                              letterSpacing: 0.5,
                            }}
                          >
                            {formattedPhone}
                          </Typography>
                          <Tooltip title="Copier le numero">
                            <IconButton
                              size="small"
                              onClick={() => handleCopy(formattedPhone)}
                              sx={{ color: "text.secondary" }}
                            >
                              <ContentCopy fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </Stack>

                      <Typography variant="body2" color="text.secondary">
                        🩻 {examLabel} · RDV du {formatFrDate(item.appointmentDate)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Lien SMS envoye il y a {Math.round(item.hoursSinceCreated)}h · RDV ref.{" "}
                        {item.rdvId}
                      </Typography>
                    </Box>

                    <Box sx={{ flexShrink: 0 }}>
                      <Button
                        variant="contained"
                        disabled={resolving.has(item.id)}
                        onClick={() => handleResolve(item.id)}
                        sx={{
                          bgcolor: "#48C8AF",
                          "&:hover": { bgcolor: "#3AB19B" },
                          minWidth: 180,
                        }}
                      >
                        {resolving.has(item.id) ? (
                          <CircularProgress size={20} sx={{ color: "#FFF" }} />
                        ) : (
                          "Marquer traite"
                        )}
                      </Button>
                    </Box>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}

        <Snackbar
          open={snack.open}
          autoHideDuration={2800}
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          <Alert
            onClose={() => setSnack((s) => ({ ...s, open: false }))}
            severity={snack.sev}
            variant="filled"
            sx={{ width: "100%" }}
          >
            {snack.msg}
          </Alert>
        </Snackbar>
      </Box>
    </PageContainer>
  );
}
