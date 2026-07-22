"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  Chip,
  Grid,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import {
  IconMessage2,
  IconCircleCheck,
  IconCircleX,
  IconInfoCircle,
} from "@tabler/icons-react";
import { startOfDay, endOfDay, subDays } from "date-fns";
import SectionHeader from "@/components/admin/SectionHeader";
import DateRangePresets from "@/components/DateRangePresets";
import DateRangePicker, { DateRange } from "@/components/DateRangePicker";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import { EXAM_TYPE_KEYS, ExamTypeKey } from "@/lib/smsConfirmationConfig";

/* =============================================================================
   Page Stats No-Show
   -----------------------------------------------------------------------------
   Affiche les compteurs de rappels SMS envoyés (via AI2Xplore) et leur
   conversion en confirmations / annulations côté patient.

   Prérequis d'affichage : le no-show doit être ACTIVÉ pour ce centre, càd :
     - au moins un type d'examen coché dans SmsConfirmationConfig.enabledExamTypes
     - au moins un numéro de poste défini pour ce type dans postesByType

   Sinon, message d'invitation à activer via /parametrage.
============================================================================= */

const EXAM_LABELS: Record<ExamTypeKey, string> = {
  scanner: "Scanner",
  irm: "IRM",
  mammo: "Mammographie",
  radiographie: "Radiographie",
  echographie: "Échographie",
};

type Bucket = { smsSent: number; confirmed: number; cancelled: number };

type StatsResponse = {
  externalCenterCode: string | string[];
  from: string;
  to: string;
  totals: Bucket;
  byType: Record<string, Bucket>;
  byDay: Array<{ day: string } & Bucket>;
};

type ConfigResponse = {
  userProductId: number;
  enabledExamTypes: Record<ExamTypeKey, boolean>;
  postesByType: Partial<Record<ExamTypeKey, string[]>>;
  reminderDays: number[] | null;
  cutoffHours: number | null;
  sendConfirmationSms: boolean;
};

function formatIsoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function KpiTile({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: number | string;
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

/**
 * Vérifie si le no-show est activé côté config : au moins un type coché ET
 * au moins un numéro de poste renseigné pour ce type. Un type activé sans
 * poste ne déclenche pas de rappel (AI2Xplore n'a rien à surveiller).
 */
function isNoShowActivated(cfg: ConfigResponse | null): boolean {
  if (!cfg) return false;
  return EXAM_TYPE_KEYS.some((k) => {
    const enabled = cfg.enabledExamTypes[k];
    const postes = cfg.postesByType[k] ?? [];
    return enabled && postes.length > 0;
  });
}

interface Props {
  params: { id: string };
}

export default function StatsNoShowPage({ params }: Props) {
  const userProductId = Number(params.id);

  const [range, setRange] = useState<DateRange>({
    from: startOfDay(subDays(new Date(), 29)),
    to: endOfDay(new Date()),
  });
  const [showPicker, setShowPicker] = useState(false);

  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch config (une seule fois par userProductId) — pour savoir si activé
  useEffect(() => {
    if (!userProductId) return;
    const controller = new AbortController();
    (async () => {
      setConfigLoading(true);
      try {
        const res = await fetch(
          `/api/sms-confirmation-config?userProductId=${userProductId}`,
          { signal: controller.signal, cache: "no-store" }
        );
        if (!res.ok) {
          setConfig(null);
          return;
        }
        const data = (await res.json()) as ConfigResponse;
        setConfig(data);
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          console.error("Erreur fetch config no-show:", e);
        }
      } finally {
        setConfigLoading(false);
      }
    })();
    return () => controller.abort();
  }, [userProductId]);

  const activated = useMemo(() => isNoShowActivated(config), [config]);

  // Fetch stats (dépend de la range + userProductId, uniquement si activé)
  useEffect(() => {
    if (!userProductId || !activated) return;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const from = formatIsoDay(range.from);
        const to = formatIsoDay(range.to);
        const url = `/api/rdv/stats?userProductId=${userProductId}&from=${from}&to=${to}`;
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
  }, [userProductId, activated, range.from, range.to]);

  /**
   * Types d'examen "en scope" : ceux qui sont ACTIVÉS ET avec au moins un poste.
   * On les met en tête du tableau by-type ; les autres restent visibles avec
   * une pastille "non activé" pour donner le contexte à l'utilisateur.
   */
  const activeTypes = useMemo(
    () =>
      EXAM_TYPE_KEYS.filter(
        (k) => config?.enabledExamTypes[k] && (config?.postesByType[k]?.length ?? 0) > 0
      ),
    [config]
  );

  const byTypeRows = useMemo(() => {
    const rows: Array<{
      key: ExamTypeKey;
      label: string;
      active: boolean;
      bucket: Bucket;
    }> = [];
    for (const k of EXAM_TYPE_KEYS) {
      const active = activeTypes.includes(k);
      const bucket: Bucket = stats?.byType?.[k] ?? { smsSent: 0, confirmed: 0, cancelled: 0 };
      rows.push({ key: k, label: EXAM_LABELS[k], active, bucket });
    }
    // Activés en premier, puis alphabétique
    rows.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
    return rows;
  }, [stats, activeTypes]);

  return (
    <PageContainer
      title="Stats No-Show"
      description="Impact des rappels SMS sur les confirmations et annulations de RDV"
    >
      <Box>
        <SectionHeader
          title="Stats No-Show"
          subtitle="Rappels SMS envoyés et leur conversion en confirmation / annulation, par type d'examen"
          actions={loading ? <Chip size="small" label="chargement…" variant="outlined" /> : undefined}
        />

        {configLoading ? (
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {[0, 1, 2].map((i) => (
              <Grid item xs={12} sm={4} key={i}>
                <KpiTileSkeleton />
              </Grid>
            ))}
          </Grid>
        ) : !activated ? (
          <Card elevation={1} sx={{ p: 4, mt: 1, textAlign: "center" }}>
            <IconInfoCircle size={48} style={{ color: "#48C8AF", marginBottom: 8 }} />
            <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
              L&apos;option No-Show n&apos;est pas activée
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520, mx: "auto" }}>
              Veuillez l&apos;activer pour un type d&apos;examen et un numéro de poste depuis les paramètres du
              centre pour consulter les statistiques.
            </Typography>
          </Card>
        ) : (
          <>
            {/* ---------- Filtres période ---------- */}
            <Card elevation={1} sx={{ p: { xs: 2, md: 2.5 }, mb: 3 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ gap: 1 }}>
                <DateRangePresets range={range} onChange={setRange} />
                <Chip
                  size="small"
                  label={
                    showPicker
                      ? "Masquer le calendrier"
                      : `${range.from.toLocaleDateString("fr-FR")} → ${range.to.toLocaleDateString("fr-FR")}`
                  }
                  variant="outlined"
                  onClick={() => setShowPicker((p) => !p)}
                  sx={{
                    cursor: "pointer",
                    fontWeight: 600,
                    border: "1px solid rgba(72,200,175,0.3)",
                    color: "#2a6f64",
                  }}
                />
              </Stack>
              {showPicker && (
                <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
                  <DateRangePicker value={range} onChange={setRange} />
                </Box>
              )}
            </Card>

            {/* ---------- Tuiles KPI ---------- */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={4}>
                {loading || !stats ? (
                  <KpiTileSkeleton />
                ) : (
                  <KpiTile
                    title="SMS de rappel envoyés"
                    value={stats.totals.smsSent}
                    icon={<IconMessage2 />}
                    color="#48C8AF"
                  />
                )}
              </Grid>
              <Grid item xs={12} sm={4}>
                {loading || !stats ? (
                  <KpiTileSkeleton />
                ) : (
                  <KpiTile
                    title="Confirmations via rappel"
                    value={stats.totals.confirmed}
                    icon={<IconCircleCheck />}
                    color="#22C55E"
                  />
                )}
              </Grid>
              <Grid item xs={12} sm={4}>
                {loading || !stats ? (
                  <KpiTileSkeleton />
                ) : (
                  <KpiTile
                    title="Annulations via rappel"
                    value={stats.totals.cancelled}
                    icon={<IconCircleX />}
                    color="#EF4444"
                  />
                )}
              </Grid>
            </Grid>

            {/* ---------- Ventilation par type d'examen ---------- */}
            <Card elevation={1} sx={{ p: { xs: 2, md: 2.5 }, mb: 3 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
                Détail par type d&apos;examen
              </Typography>
              {loading || !stats ? (
                <Grid container spacing={2}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Grid item xs={12} sm={6} md={4} key={i}>
                      <Skeleton variant="rounded" height={110} />
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Grid container spacing={2}>
                  {byTypeRows.map((row) => (
                    <Grid item xs={12} sm={6} md={4} key={row.key}>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2,
                          border: "1px solid",
                          borderColor: row.active ? "rgba(72,200,175,0.35)" : "divider",
                          bgcolor: row.active ? "rgba(72,200,175,0.05)" : "transparent",
                          opacity: row.active ? 1 : 0.6,
                        }}
                      >
                        <Stack
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          sx={{ mb: 1 }}
                        >
                          <Typography variant="subtitle2" fontWeight={700}>
                            {row.label}
                          </Typography>
                          {!row.active && (
                            <Chip
                              size="small"
                              label="non activé"
                              sx={{
                                height: 20,
                                fontSize: 10,
                                fontWeight: 600,
                                color: "text.secondary",
                              }}
                            />
                          )}
                        </Stack>
                        <Stack direction="row" spacing={2}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="caption" color="text.secondary" noWrap>
                              Envois
                            </Typography>
                            <Typography variant="h6" fontWeight={700}>
                              {row.bucket.smsSent}
                            </Typography>
                          </Box>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="caption" color="text.secondary" noWrap>
                              Confirmations
                            </Typography>
                            <Typography variant="h6" fontWeight={700} sx={{ color: "#22C55E" }}>
                              {row.bucket.confirmed}
                            </Typography>
                          </Box>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="caption" color="text.secondary" noWrap>
                              Annulations
                            </Typography>
                            <Typography variant="h6" fontWeight={700} sx={{ color: "#EF4444" }}>
                              {row.bucket.cancelled}
                            </Typography>
                          </Box>
                        </Stack>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              )}
              {stats && stats.byType.unknown && stats.byType.unknown.smsSent > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
                  Note : {stats.byType.unknown.smsSent} SMS ont été comptés sans type d&apos;examen
                  renseigné (init historique sans champ examType) — non affichés dans le détail
                  par type.
                </Typography>
              )}
            </Card>

            {error && (
              <Typography variant="body2" color="error" sx={{ mt: 2 }}>
                {error}
              </Typography>
            )}
          </>
        )}
      </Box>
    </PageContainer>
  );
}
