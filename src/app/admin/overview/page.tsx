"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Box,
  Grid,
  Typography,
  CircularProgress,
  Checkbox,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Button,
  Divider,
  Snackbar,
  Alert,
  TextField,
  InputAdornment,
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Card,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
  LinearProgress,
} from "@mui/material";
import {
  IconSearch,
  IconChevronDown,
  IconUsers,
  IconPhone,
  IconCalendarCheck,
  IconGauge,
  IconAlertTriangle,
} from "@tabler/icons-react";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import { useCentre, ManagedUser } from "@/app/context/CentreContext";

type TodayStats = {
  totalCalls: number;
  nbRDV: number;
  indice: number;
  notPerformedExam: number; // transferReason === "exam_type"
  planningFull: number;     // stats.no_slot_api_retrieve truthy
};

/**
 * Calcule les stats du jour (depuis minuit local) à partir d'un lot d'appels,
 * avec les mêmes formules que la page stats_appel / le dashboard client.
 */
function computeTodayStats(calls: any[]): TodayStats {
  const total = calls.length;
  const nbRDV = calls.reduce((acc, c) => {
    const n = Number(c?.stats?.rdv_booked ?? 0);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
  const errors = calls.reduce((acc, c) => {
    return acc + (c?.stats?.error_logic && c.stats.error_logic > 0 ? 1 : 0);
  }, 0);
  const indice = total > 0 ? Math.floor((1 - errors / total) * 100) : 0;
  const notPerformedExam = calls.reduce(
    (acc, c) => acc + (c?.stats?.transferReason === "exam_type" ? 1 : 0),
    0
  );
  const planningFull = calls.reduce(
    (acc, c) => acc + (c?.stats?.no_slot_api_retrieve ? 1 : 0),
    0
  );
  return {
    totalCalls: total,
    nbRDV,
    indice,
    notPerformedExam,
    planningFull,
  };
}

/** Couleur de l'indice selon la valeur (rouge → orange → vert). */
function indiceColor(v: number): string {
  if (v >= 80) return "#22c55e";
  if (v >= 60) return "#f59e0b";
  return "#ef4444";
}

/**
 * Ligne de stat dans une card centre — layout horizontal :
 * [icône] [label + sous-label optionnel] ... [valeur + breakdown optionnel].
 */
function StatRow({
  label,
  subLabel,
  value,
  breakdown,
  icon,
  valueColor,
}: {
  label: string;
  subLabel?: string;
  value: string | number;
  breakdown?: string;
  icon: React.ReactNode;
  valueColor?: string;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: subLabel ? "flex-start" : "center",
        gap: 1.5,
        py: 0.75,
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: "10px",
          display: "grid",
          placeItems: "center",
          bgcolor: "rgba(72,200,175,0.12)",
          color: "#2a6f64",
          flexShrink: 0,
          mt: subLabel ? 0.25 : 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} noWrap>
          {label}
        </Typography>
        {subLabel && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", lineHeight: 1.35 }}
          >
            {subLabel}
          </Typography>
        )}
      </Box>
      <Box sx={{ textAlign: "right", flexShrink: 0, minWidth: 60 }}>
        <Typography
          variant="h6"
          fontWeight={700}
          sx={{ color: valueColor, lineHeight: 1.2 }}
        >
          {value}
        </Typography>
        {breakdown && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {breakdown}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

type Period = "today" | "week";

/**
 * Card représentant un centre actif avec ses stats sur la période choisie.
 * - "today" : depuis minuit local
 * - "week"  : depuis minuit du jour il y a 6 jours (donc 7 jours inclus avec aujourd'hui)
 */
function CentreTodayCard({ centre, period }: { centre: ManagedUser; period: Period }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<TodayStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const from = new Date();
        from.setHours(0, 0, 0, 0);
        if (period === "week") {
          from.setDate(from.getDate() - 6);
        }
        const to = new Date();
        const url =
          `/api/calls?userProductId=${centre.userProductId}` +
          `&mode=all&from=${from.toISOString()}&to=${to.toISOString()}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const calls = Array.isArray(data) ? data : data?.data ?? [];
        if (!cancelled) setStats(computeTodayStats(calls));
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        if (!cancelled) setError("Erreur");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [centre.userProductId, period]);

  const periodLabel = period === "today" ? "Aujourd'hui" : "7 derniers jours";
  // Refetch (= on a déjà des stats et on recharge) : on garde l'affichage, on dim
  const refetching = loading && !!stats;

  return (
    <Card
      elevation={1}
      onClick={() =>
        router.push(`/admin/clients/${centre.userProductId}/stats_appel`)
      }
      sx={{
        p: 3,
        height: "100%",
        position: "relative",
        overflow: "hidden",
        cursor: "pointer",
        transition: "transform 180ms ease, box-shadow 180ms ease",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: "0 8px 24px rgba(72,200,175,0.15)",
        },
      }}
    >
      {refetching && (
        <LinearProgress
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            bgcolor: "transparent",
            "& .MuiLinearProgress-bar": { bgcolor: "#48C8AF" },
          }}
        />
      )}

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={700} noWrap>
            {centre.name || centre.email}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ID: {centre.userProductId}
          </Typography>
        </Box>
        <Chip
          size="small"
          label={periodLabel}
          variant="outlined"
          sx={{
            transition: "all 250ms ease",
          }}
        />
      </Box>

      <Divider sx={{ mb: 2 }} />

      {loading && !stats ? (
        <Stack spacing={1.5}>
          {[0, 1, 2, 3].map((i) => (
            <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 0.75 }}>
              <Skeleton variant="rounded" width={36} height={36} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Skeleton variant="text" width="35%" height={18} />
                {i === 3 && <Skeleton variant="text" width="75%" height={12} />}
              </Box>
              <Box sx={{ textAlign: "right" }}>
                <Skeleton variant="text" width={48} height={24} />
                {i === 3 && <Skeleton variant="text" width={56} height={12} />}
              </Box>
            </Box>
          ))}
        </Stack>
      ) : error ? (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      ) : stats ? (
        <Stack
          key={period}
          spacing={0.25}
          divider={<Divider sx={{ opacity: 0.5 }} />}
          sx={{
            opacity: refetching ? 0.45 : 1,
            transition: "opacity 250ms ease",
            animation: "fadeStats 300ms ease",
            "@keyframes fadeStats": {
              from: { opacity: 0, transform: "translateY(4px)" },
              to: { opacity: refetching ? 0.45 : 1, transform: "translateY(0)" },
            },
          }}
        >
          <StatRow
            label="Appels"
            value={stats.totalCalls}
            icon={<IconPhone size={18} />}
          />
          <StatRow
            label="RDV pris"
            value={stats.nbRDV}
            icon={<IconCalendarCheck size={18} />}
          />
          <StatRow
            label="Indice"
            value={`${stats.indice}%`}
            icon={<IconGauge size={18} />}
            valueColor={indiceColor(stats.indice)}
          />
          <StatRow
            label="Non traités"
            subLabel="exam non pris en charge + planning complet"
            value={stats.notPerformedExam + stats.planningFull}
            breakdown={`(${stats.notPerformedExam} + ${stats.planningFull})`}
            icon={<IconAlertTriangle size={18} />}
          />
        </Stack>
      ) : null}
    </Card>
  );
}

/**
 * Admin Overview
 * - Permet de choisir quels centres (userProductId) apparaissent dans le sélecteur en haut.
 * - Les centres décochés sont masqués, pas supprimés.
 */
const AdminOverviewPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { allCentres, centres: activeCentres, activeCentreIds, setActiveCentreIds } = useCentre();

  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [snack, setSnack] = useState(false);
  const [period, setPeriod] = useState<Period>("today");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    } else if (session && session.user.role !== "ADMIN") {
      router.push("/client");
    }
  }, [session, status, router]);

  useEffect(() => {
    const initial = activeCentreIds
      ? new Set(activeCentreIds)
      : new Set(allCentres.map((c) => c.id));
    setChecked(initial);
    setDirty(false);
  }, [activeCentreIds, allCentres]);

  const filteredCentres = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allCentres;
    return allCentres.filter((c) => {
      const name = (c.name ?? "").toLowerCase();
      const email = c.email.toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [allCentres, search]);

  const toggle = (id: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setDirty(true);
  };

  const selectAll = () => {
    setChecked(new Set(allCentres.map((c) => c.id)));
    setDirty(true);
  };

  const selectNone = () => {
    setChecked(new Set());
    setDirty(true);
  };

  const save = () => {
    const ids = Array.from(checked);
    if (ids.length === allCentres.length) {
      setActiveCentreIds(null);
    } else {
      setActiveCentreIds(ids);
    }
    setDirty(false);
    setSnack(true);
  };

  if (status === "loading") {
    return (
      <Box sx={{ display: "grid", placeItems: "center", minHeight: "50vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <PageContainer title="Admin Overview" description="Centres actifs">
      <Box>
        <Grid container spacing={3}>
          <Grid item xs={12} lg={8}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
              <Box
                sx={{
                  width: 4,
                  height: 36,
                  borderRadius: 2,
                  bgcolor: "#48C8AF",
                }}
              />
              <Box>
                <Typography variant="h5" fontWeight={800} lineHeight={1.1}>
                  Centres actifs
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Sélection des centres visibles dans le sélecteur
                </Typography>
              </Box>
            </Box>

            <Accordion
              disableGutters
              elevation={1}
              sx={{
                borderRadius: 2,
                "&:before": { display: "none" },
                overflow: "hidden",
              }}
            >
              <AccordionSummary
                expandIcon={<IconChevronDown size={20} />}
                sx={{
                  px: 2.5,
                  py: 1,
                  "& .MuiAccordionSummary-content": {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 2,
                  },
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: "10px",
                      display: "grid",
                      placeItems: "center",
                      bgcolor: "rgba(72,200,175,0.15)",
                      color: "#2a6f64",
                    }}
                  >
                    <IconUsers size={18} />
                  </Box>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
                      Centres actifs
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Centres visibles dans le sélecteur
                    </Typography>
                  </Box>
                </Box>

                <Stack direction="row" spacing={1} alignItems="center" sx={{ pr: 1 }}>
                  <Chip
                    size="small"
                    label={`${checked.size} / ${allCentres.length}`}
                    sx={{
                      bgcolor: "#48C8AF",
                      color: "#fff",
                      fontWeight: 600,
                    }}
                  />
                  {dirty && (
                    <Chip size="small" label="Modifié" color="warning" variant="outlined" />
                  )}
                </Stack>
              </AccordionSummary>

              <AccordionDetails sx={{ px: 2.5, pt: 0, pb: 2 }}>
                <Divider sx={{ mb: 2 }} />

                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Cochez les centres à afficher. Les centres décochés sont masqués (non supprimés).
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={selectAll}>Tout cocher</Button>
                    <Button size="small" onClick={selectNone}>Tout décocher</Button>
                  </Stack>
                </Box>

                <TextField
                  size="small"
                  fullWidth
                  placeholder="Rechercher par nom ou email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  sx={{ mb: 1 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <IconSearch size={18} />
                      </InputAdornment>
                    ),
                  }}
                />

                <List sx={{ maxHeight: 360, overflowY: "auto", bgcolor: "background.paper", py: 0 }}>
                  {filteredCentres.length === 0 && (
                    <ListItem>
                      <ListItemText
                        primary="Aucun centre"
                        secondary={allCentres.length === 0 ? "Chargement en cours…" : "Aucune correspondance"}
                      />
                    </ListItem>
                  )}
                  {filteredCentres.map((c) => {
                    const isChecked = checked.has(c.id);
                    return (
                      <ListItem key={c.id} disablePadding dense>
                        <ListItemButton onClick={() => toggle(c.id)} dense>
                          <ListItemIcon>
                            <Checkbox
                              edge="start"
                              checked={isChecked}
                              tabIndex={-1}
                              disableRipple
                            />
                          </ListItemIcon>
                          <ListItemText
                            primary={`${c.name || c.email} · ID: ${c.userProductId}`}
                            secondary={c.email}
                          />
                        </ListItemButton>
                      </ListItem>
                    );
                  })}
                </List>

                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", mt: 2 }}>
                  <Button
                    variant="contained"
                    disabled={!dirty}
                    onClick={save}
                    sx={{ bgcolor: "#48C8AF", "&:hover": { bgcolor: "#3BA992" } }}
                  >
                    Sauvegarder
                  </Button>
                </Box>
              </AccordionDetails>
            </Accordion>
          </Grid>

          {/* === Cards centres actifs — stats du jour === */}
          <Grid item xs={12} sx={{ mt: 4 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 3,
                flexWrap: "wrap",
                mb: 3,
              }}
            >
              {/* Barre d'accent teal à gauche du titre */}
              <Box
                sx={{
                  width: 4,
                  height: 36,
                  borderRadius: 2,
                  bgcolor: "#48C8AF",
                }}
              />
              <Box>
                <Typography variant="h5" fontWeight={800} lineHeight={1.1}>
                  Stats {period === "today" ? "du jour" : "de la semaine"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {period === "today"
                    ? "Sur la journée · par centre actif"
                    : "7 derniers jours (aujourd'hui inclus) · par centre actif"}
                </Typography>
              </Box>

              <ToggleButtonGroup
                value={period}
                exclusive
                size="small"
                onChange={(_, v) => {
                  if (v) setPeriod(v);
                }}
                sx={{
                  "& .MuiToggleButton-root.Mui-selected": {
                    bgcolor: "#48C8AF",
                    color: "#fff",
                    "&:hover": { bgcolor: "#3BA992" },
                  },
                }}
              >
                <ToggleButton value="today">Aujourd&apos;hui</ToggleButton>
                <ToggleButton value="week">Semaine</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {activeCentres.length === 0 ? (
              <Card sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  Aucun centre actif — coche au moins un centre dans le panneau ci-dessus.
                </Typography>
              </Card>
            ) : (
              <Grid container spacing={3}>
                {activeCentres.map((c) => (
                  <Grid item xs={12} sm={6} md={4} key={c.id}>
                    <CentreTodayCard centre={c} period={period} />
                  </Grid>
                ))}
              </Grid>
            )}
          </Grid>
        </Grid>
      </Box>

      <Snackbar
        open={snack}
        autoHideDuration={2500}
        onClose={() => setSnack(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setSnack(false)}>
          Centres actifs sauvegardés
        </Alert>
      </Snackbar>
    </PageContainer>
  );
};

export default AdminOverviewPage;
