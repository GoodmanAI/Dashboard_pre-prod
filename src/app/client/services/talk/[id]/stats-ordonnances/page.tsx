"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Card,
  Chip,
  Grid,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import {
  IconSend,
  IconUpload,
  IconCircleCheck,
  IconCircleX,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { startOfDay, endOfDay, subDays } from "date-fns";
import SectionHeader from "@/components/admin/SectionHeader";
import DateRangePresets from "@/components/DateRangePresets";
import DateRangePicker, { DateRange } from "@/components/DateRangePicker";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";

/* =============================================================================
   Page Stats Ordonnances
   -----------------------------------------------------------------------------
   Affiche les compteurs du pipeline d'ordonnances patients :
     - Liens envoyes (requested)   : nb de patients qui ont recu le SMS depot
     - Deposees (uploaded)         : nb de patients qui ont depose leur PDF
     - Acceptees Xplore (acked)    : nb d'ordonnances reussies (deposees dans
                                     Xplore par AI2Xplore avec succes)
     - Refusees Xplore (rejected)  : nb d'ordonnances refusees par Xplore
     - Alertes 48h (alerted)       : nb d'alertes remontees aux secretaires

   Meme design que stats-no-show : cards KPI + tableau daily. Filtre periode
   via DateRangePresets + DateRangePicker.
============================================================================= */

type Totals = {
  requested: number;
  uploaded: number;
  acked: number;
  rejected: number;
  alerted: number;
};

type Rates = {
  uploadRate: number;
  ackRate: number;
  rejectRate: number;
  alertRate: number;
};

type DailyRow = {
  day: string;
  requested: number;
  uploaded: number;
  acked: number;
  rejected: number;
  alerted: number;
};

type StatsResponse = {
  userProductId: number;
  from: string;
  to: string;
  totals: Totals;
  rates: Rates;
  daily: DailyRow[];
};

function formatIsoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatFrDay(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function KpiTile({
  title,
  value,
  subValue,
  icon,
  color,
}: {
  title: string;
  value: number | string;
  subValue?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <Paper sx={{ p: 2, display: "flex", alignItems: "center", gap: 2, minHeight: 96 }} elevation={1}>
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: "10px",
          display: "grid",
          placeItems: "center",
          bgcolor: `${color}25`,
          color,
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" color="text.secondary" noWrap>
          {title}
        </Typography>
        <Typography variant="h5" fontWeight={700} noWrap>
          {value}
        </Typography>
        {subValue && (
          <Typography variant="caption" color="text.secondary" noWrap>
            {subValue}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

function KpiTileSkeleton() {
  return (
    <Paper sx={{ p: 2, display: "flex", alignItems: "center", gap: 2, minHeight: 96 }} elevation={1}>
      <Skeleton variant="rounded" width={48} height={48} sx={{ borderRadius: "10px" }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Skeleton variant="text" width={120} height={18} />
        <Skeleton variant="text" width="60%" height={30} />
      </Box>
    </Paper>
  );
}

interface Props {
  params: { id: string };
}

export default function StatsOrdonnancesPage({ params }: Props) {
  const userProductId = Number(params.id);

  const [range, setRange] = useState<DateRange>({
    from: startOfDay(subDays(new Date(), 29)),
    to: endOfDay(new Date()),
  });

  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userProductId) return;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const from = formatIsoDay(range.from);
        const to = formatIsoDay(range.to);
        const url = `/api/prescriptions/stats?userProductId=${userProductId}&from=${from}&to=${to}`;
        const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as StatsResponse;
        setStats(data);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setError(e?.message || "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [userProductId, range.from, range.to]);

  // Reverse daily pour tableau : plus recent en tete
  const dailyDesc = useMemo(
    () => (stats?.daily ? [...stats.daily].reverse() : []),
    [stats]
  );

  return (
    <PageContainer
      title="Stats ordonnances"
      description="Suivi des liens ordonnances envoyes, deposes, acceptes et refuses"
    >
      <Box>
        <SectionHeader
          title="Stats ordonnances"
          subtitle="Suivi du pipeline : envoi lien SMS -> depot patient -> dépôt Xplore"
          actions={
            <Chip
              size="small"
              label={loading ? "chargement…" : `${stats?.totals.requested ?? 0} liens envoyes`}
              sx={{
                bgcolor: "rgba(72,200,175,0.15)",
                color: "#2a6f64",
                fontWeight: 700,
              }}
            />
          }
        />

        {/* Filtres periode */}
        <Card
          elevation={0}
          sx={{ p: 2, mb: 3, bgcolor: "#F0F7F5", border: "1px solid #d0e6df" }}
        >
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <DateRangePresets range={range} onChange={setRange} />
            <DateRangePicker value={range} onChange={setRange} />
          </Stack>
        </Card>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* KPI cards */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={4} lg={2.4}>
            {loading || !stats ? (
              <KpiTileSkeleton />
            ) : (
              <KpiTile
                title="Liens envoyes"
                value={stats.totals.requested}
                icon={<IconSend size={22} />}
                color="#3b82f6"
              />
            )}
          </Grid>
          <Grid item xs={12} sm={6} md={4} lg={2.4}>
            {loading || !stats ? (
              <KpiTileSkeleton />
            ) : (
              <KpiTile
                title="Ordonnances deposees"
                value={stats.totals.uploaded}
                subValue={`Taux : ${stats.rates.uploadRate}%`}
                icon={<IconUpload size={22} />}
                color="#48C8AF"
              />
            )}
          </Grid>
          <Grid item xs={12} sm={6} md={4} lg={2.4}>
            {loading || !stats ? (
              <KpiTileSkeleton />
            ) : (
              <KpiTile
                title="Acceptees Xplore"
                value={stats.totals.acked}
                subValue={`Succes : ${stats.rates.ackRate}%`}
                icon={<IconCircleCheck size={22} />}
                color="#16a34a"
              />
            )}
          </Grid>
          <Grid item xs={12} sm={6} md={4} lg={2.4}>
            {loading || !stats ? (
              <KpiTileSkeleton />
            ) : (
              <KpiTile
                title="Refusees Xplore"
                value={stats.totals.rejected}
                subValue={`Rejet : ${stats.rates.rejectRate}%`}
                icon={<IconCircleX size={22} />}
                color="#ef4444"
              />
            )}
          </Grid>
          <Grid item xs={12} sm={6} md={4} lg={2.4}>
            {loading || !stats ? (
              <KpiTileSkeleton />
            ) : (
              <KpiTile
                title="Alertes 48h"
                value={stats.totals.alerted}
                subValue={`Alerte : ${stats.rates.alertRate}%`}
                icon={<IconAlertTriangle size={22} />}
                color="#f59e0b"
              />
            )}
          </Grid>
        </Grid>

        {/* Tableau daily */}
        <Card elevation={1} sx={{ p: 0, overflow: "hidden" }}>
          <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid #e5e7eb", bgcolor: "#FAFCFB" }}>
            <Typography variant="subtitle1" fontWeight={700}>
              Detail journalier
            </Typography>
          </Box>
          <TableContainer sx={{ maxHeight: 600 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, bgcolor: "#F0F7F5" }}>Date</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, bgcolor: "#F0F7F5" }}>Envoyes</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, bgcolor: "#F0F7F5" }}>Deposees</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, bgcolor: "#F0F7F5" }}>Acceptees</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, bgcolor: "#F0F7F5" }}>Refusees</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, bgcolor: "#F0F7F5" }}>Alertes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ textAlign: "center", py: 4, color: "text.secondary" }}>
                      Chargement...
                    </TableCell>
                  </TableRow>
                )}
                {!loading && dailyDesc.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ textAlign: "center", py: 4, color: "text.secondary" }}>
                      Aucune donnee pour la periode selectionnee.
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  dailyDesc.map((r) => (
                    <TableRow key={r.day} hover>
                      <TableCell sx={{ fontWeight: 500 }}>{formatFrDay(r.day)}</TableCell>
                      <TableCell align="right">{r.requested}</TableCell>
                      <TableCell align="right">
                        {r.uploaded}
                        {r.requested > 0 && (
                          <Typography component="span" variant="caption" sx={{ color: "text.secondary", ml: 0.5 }}>
                            ({Math.round((r.uploaded / r.requested) * 100)}%)
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ color: r.acked > 0 ? "#16a34a" : "inherit" }}>
                        {r.acked}
                      </TableCell>
                      <TableCell align="right" sx={{ color: r.rejected > 0 ? "#ef4444" : "inherit" }}>
                        {r.rejected}
                      </TableCell>
                      <TableCell align="right" sx={{ color: r.alerted > 0 ? "#f59e0b" : "inherit" }}>
                        {r.alerted}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Box>
    </PageContainer>
  );
}
