"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { WarningAmber, CheckCircle } from "@mui/icons-material";
import { IconInfoCircle } from "@tabler/icons-react";
import { io as ioClient, Socket } from "socket.io-client";
import SectionHeader from "@/components/admin/SectionHeader";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import {
  ALERT_AFTER_HOURS_MAX,
  ALERT_AFTER_HOURS_MIN,
  DEFAULT_ALERT_AFTER_HOURS,
} from "@/lib/prescriptionConfig";

/* =============================================================================
   Page "Ordonnances manquantes"
   -----------------------------------------------------------------------------
   Affiche les patients dont le lien de depot d'ordonnance a ete envoye il y a
   plus de X heures et qui n'ont toujours pas depose leur PDF (status=PENDING,
   alertResolvedAt IS NULL).

   Timeline dynamique :
     - Selecteur (dropdown des presets 24/48/72/96/168h + input libre borne)
     - Valeur par defaut = alertAfterHours de la config centre
     - Le changement recharge la liste immediatement
     - Ne persiste pas cote serveur (juste un filtre UI)

   Actions secretaire :
     - Cliquer sur le numero pour le copier
     - Appeler tel:xxx via le lien direct
     - "Marquer traite" -> POST /alerts/{id}/resolve (fait disparaitre la carte)
============================================================================= */

const EXAM_LABELS: Record<string, string> = {
  scanner: "Scanner",
  irm: "IRM",
  mammo: "Mammographie",
  radiographie: "Radiographie",
  echographie: "Echographie",
};

/** Presets d'heures pour le selecteur rapide. */
const PRESET_HOURS = [24, 48, 72, 96, 168];

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
  alertRaisedAt: string | null;
  hoursSinceCreated: number;
  hoursSinceAlert: number | null;
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

  // ---- Timeline UI ---------------------------------------------------------
  // thresholdHours = seuil actuellement applique (envoye au serveur)
  // defaultHours   = alertAfterHours du centre (retourne par le serveur au 1er load)
  // customInput    = valeur libre saisie par l'utilisateur (pour l'input "Autre")
  const [thresholdHours, setThresholdHours] = useState<number>(DEFAULT_ALERT_AFTER_HOURS);
  const [defaultHours, setDefaultHours] = useState<number>(DEFAULT_ALERT_AFTER_HOURS);
  const [customInput, setCustomInput] = useState<string>("");
  const [selectValue, setSelectValue] = useState<string>(String(DEFAULT_ALERT_AFTER_HOURS));

  // ---- Filtre type d'examen -----------------------------------------------
  // "all" = pas de filtre. Sinon la valeur brute d'examType (scanner, irm, etc.)
  // Applique cote client sur les items retournes par l'API.
  const [examFilter, setExamFilter] = useState<string>("all");

  const load = useCallback(
    async (hoursOverride?: number) => {
      if (!userProductId) return;
      const hours = hoursOverride ?? thresholdHours;
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `/api/prescriptions/alerts?userProductId=${userProductId}&hoursThreshold=${hours}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setItems(Array.isArray(data.items) ? data.items : []);
        if (Number.isFinite(data?.defaultHours)) {
          setDefaultHours(data.defaultHours);
        }
        // Le serveur peut clamp/ignorer le param si hors bornes, on realigne
        // le state UI sur la valeur effectivement appliquee
        if (Number.isFinite(data?.thresholdHours) && data.thresholdHours !== hours) {
          setThresholdHours(data.thresholdHours);
        }
      } catch (err: any) {
        setError(err?.message || "Impossible de charger les alertes");
      } finally {
        setLoading(false);
      }
    },
    [userProductId, thresholdHours]
  );

  useEffect(() => {
    load();
    // Poll fallback long : les uploads/resolves passent par websocket pour un
    // refresh instantane (voir hook plus bas), le poll capte seulement les
    // rows qui deviennent "actives" par vieillissement (createdAt franchit
    // le threshold sans autre event declenche).
    const interval = setInterval(() => load(), 5 * 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProductId, thresholdHours]);

  // Websocket : refresh instantane sur upload/resolve emis par le backend
  // (meme event "prescription-alerts-updated" que le hook du badge navbar).
  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    if (!userProductId) return;
    let cancelled = false;
    (async () => {
      try {
        await fetch("/api/socket");
        if (cancelled) return;
        const socket = ioClient({ path: "/api/socket" });
        socketRef.current = socket;
        socket.on("prescription-alerts-updated", () => {
          if (!cancelled) load();
        });
      } catch {
        // Socket KO : le poll 5min sert de fallback
      }
    })();
    return () => {
      cancelled = true;
      if (socketRef.current) {
        socketRef.current.off("prescription-alerts-updated");
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [userProductId, load]);

  // Sync selectValue avec thresholdHours au premier load pour reflechir la config centre
  useEffect(() => {
    // Si le defaultHours du serveur n'est pas dans les presets, ajuste la selection
    const val = String(thresholdHours);
    if (PRESET_HOURS.includes(thresholdHours)) {
      setSelectValue(val);
    } else {
      setSelectValue("custom");
      setCustomInput(val);
    }
  }, [thresholdHours]);

  const handleSelectChange = useCallback((newVal: string) => {
    setSelectValue(newVal);
    if (newVal === "custom") {
      // On attend la saisie de l'utilisateur avant de trigger un reload
      return;
    }
    const hours = Number.parseInt(newVal, 10);
    if (Number.isFinite(hours)) {
      setThresholdHours(hours);
    }
  }, []);

  const handleCustomApply = useCallback(() => {
    const n = Number.parseInt(customInput, 10);
    if (
      !Number.isFinite(n) ||
      n < ALERT_AFTER_HOURS_MIN ||
      n > ALERT_AFTER_HOURS_MAX
    ) {
      setSnack({
        open: true,
        msg: `Valeur invalide (${ALERT_AFTER_HOURS_MIN}-${ALERT_AFTER_HOURS_MAX}h)`,
        sev: "error",
      });
      return;
    }
    setThresholdHours(n);
  }, [customInput]);

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

  // Liste des types d'examens presents dans les items courants (source de
  // verite pour peupler le filtre — pas besoin d'aller chercher la config
  // centre, on ne montre que ce qui est reellement en attente).
  const availableExamTypes = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      if (it.examType) set.add(it.examType);
    }
    return Array.from(set).sort();
  }, [items]);

  const orderedItems = useMemo(() => {
    const filtered =
      examFilter === "all"
        ? items
        : items.filter((it) => it.examType === examFilter);
    return [...filtered].sort(
      (a, b) => b.hoursSinceCreated - a.hoursSinceCreated
    );
  }, [items, examFilter]);

  return (
    <PageContainer
      title="Ordonnances manquantes"
      description="RDVs pour lesquels aucune ordonnance n'a ete deposee dans les delais"
    >
      <Box>
        <SectionHeader
          title="Ordonnances manquantes"
          subtitle="Patients dont le lien de depot a ete envoye il y a plus de X heures sans upload"
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

        {/* Barre de filtres : timeline + type d'examen */}
        <Card
          elevation={0}
          sx={{ p: 2, mb: 2, bgcolor: "#F0F7F5", border: "1px solid #d0e6df" }}
        >
          <Stack spacing={2}>
            {/* Timeline */}
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems={{ xs: "stretch", sm: "center" }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, color: "#2a6f64", minWidth: 200 }}>
                Afficher les patients en attente depuis :
              </Typography>
              <Select
                size="small"
                value={selectValue}
                onChange={(e) => handleSelectChange(e.target.value as string)}
                sx={{ minWidth: 140, bgcolor: "#FFF" }}
              >
                {PRESET_HOURS.map((h) => (
                  <MenuItem key={h} value={String(h)}>
                    {h}h{h === defaultHours ? " (defaut centre)" : ""}
                  </MenuItem>
                ))}
                <MenuItem value="custom">Autre…</MenuItem>
              </Select>
              {selectValue === "custom" && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField
                    size="small"
                    type="number"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    inputProps={{
                      min: ALERT_AFTER_HOURS_MIN,
                      max: ALERT_AFTER_HOURS_MAX,
                      step: 1,
                      style: { width: 70 },
                    }}
                    sx={{ bgcolor: "#FFF" }}
                    placeholder="heures"
                  />
                  <Typography variant="body2" color="text.secondary">
                    h
                  </Typography>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={handleCustomApply}
                    sx={{ bgcolor: "#48C8AF", "&:hover": { bgcolor: "#3AB19B" } }}
                  >
                    Appliquer
                  </Button>
                </Stack>
              )}
            </Stack>

            {/* Type d'examen : uniquement les types reellement en attente */}
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems={{ xs: "stretch", sm: "center" }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, color: "#2a6f64", minWidth: 200 }}>
                Filtrer par type d&apos;examen :
              </Typography>
              <Select
                size="small"
                value={examFilter}
                onChange={(e) => setExamFilter(e.target.value as string)}
                sx={{ minWidth: 200, bgcolor: "#FFF" }}
                disabled={availableExamTypes.length === 0}
              >
                <MenuItem value="all">
                  Tous les examens ({items.length})
                </MenuItem>
                {availableExamTypes.map((t) => {
                  const count = items.filter((it) => it.examType === t).length;
                  return (
                    <MenuItem key={t} value={t}>
                      {EXAM_LABELS[t] ?? t} ({count})
                    </MenuItem>
                  );
                })}
              </Select>
            </Stack>
          </Stack>
        </Card>

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
              Aucun patient n&apos;a depasse le seuil de {thresholdHours}h sans deposer son ordonnance.
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
              // Critical = 2x le seuil configure (ex: 48h de seuil -> critical > 96h)
              const critical = item.hoursSinceCreated > thresholdHours * 2;
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
                          label={`${Math.round(item.hoursSinceCreated)}h sans upload`}
                          sx={{
                            bgcolor: critical ? "rgba(185,28,28,0.15)" : "rgba(234,88,12,0.15)",
                            color: critical ? "#b91c1c" : "#c2410c",
                            fontWeight: 700,
                          }}
                        />
                      </Stack>

                      <Box sx={{ mb: 1 }}>
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
                      </Box>

                      <Typography variant="body2" color="text.secondary">
                        {examLabel} · RDV du {formatFrDate(item.appointmentDate)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Lien SMS envoye le {formatFrDate(item.createdAt)}
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
