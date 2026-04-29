"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Button,
  Card,
  Grid,
  Skeleton,
  Chip,
  Divider,
} from "@mui/material";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  IconChartBar,
  IconGauge,
  IconCalendarCheck,
  IconAlertTriangle,
  IconPhone,
  IconChevronRight,
  IconSettings,
  IconInfoCircle,
} from "@tabler/icons-react";
import { useCentre } from "@/app/context/CentreContext";
import { useTalkBasePath } from "@/utils/talkRoutes";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";

// Recharts (aperçu histogramme)
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import ClientLayout from "./ClientLayout";

interface Call {
  id: number;
  caller: string;
  called: string;
  intent: string;
  firstname: string | null;
  lastname: string | null;
  birthdate: string | null;
  createdAt: string;
  steps: string[];
}

interface IntentConfig {
  value: string;
  sing_label: string;
  label: string;
}

type PreviewPoint = { day: string; total: number };

const intents: IntentConfig[] = [
  { value: "pourcentage", sing_label: "Indice", label: "Indice de performance" },
  { value: "rdv_pris", sing_label: "Prise de RDV", label: "Prises de RDV" },
  // { value: "all", sing_label: "Appel reçu", label: "Appels reçus" },
  { value: "urgency", sing_label: "Urgence", label: "Urgences" },
];

// --- Démo figée ---
const DEMO_MODE = false; // passe à false si tu veux repasser en live
const DEMO_ANCHOR_ISO =
  process.env.NEXT_PUBLIC_DEMO_ANCHOR_ISO || "2025-03-01T12:00:00.000Z";
const DEMO_DAYS = 35; // fenêtre de remap (30–45 ok)

// Aide à reconnaître les aborts (évite "Uncaught (in promise) AbortError")
const isAbortError = (e: unknown) =>
  !!e && typeof e === "object" && (e as any).name === "AbortError";

// Bornes (00:00–23:59) du "jour démo" basé sur l'anchor
function getAnchorDayBounds(anchorIso: string) {
  const anchor = new Date(anchorIso);
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  const end = new Date(anchor);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getIndice(calls: any[]): number {
  if (!calls.length) return 0;

  const errors = calls.reduce((acc: number, c: any) => {
    if (c?.stats?.error_logic && c.stats.error_logic > 0) {
      return acc + 1;
    }
    return acc;
  }, 0);

  return Math.floor((1 - errors / calls.length) * 100);
}

/* ===== Skeleton helpers ===== */
function CountItemSkeleton() {
  return (
    <Box
      sx={{
        pt: 2,
        m: 1,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        width: 150,
      }}
    >
      <Skeleton variant="text" width={60} height={36} />
      <Skeleton variant="text" width={110} height={22} sx={{ mb: 4 }} />
    </Box>
  );
}

function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <Box sx={{ height }}>
      <Skeleton variant="rounded" width="100%" height="100%" />
    </Box>
  );
}

interface TalkPageProps {
    params: {
        id: string; // captured from the URL
    };
}

export default function TalkPage({ params }: TalkPageProps) {
  const [filledSections, setFilledSections] = useState(0);
  const [totalSections, setTotalSections] = useState(0);
  const { data: session, status } = useSession();
  const router = useRouter();
  const { selectedUserId } = useCentre();
  const userProductId = Number(params.id);
  const basePath = useTalkBasePath(userProductId);

  // Compteurs par intention
  const [callsCountByIntent, setCallsCountByIntent] = useState<number[]>([]);
  const [loadingCounts, setLoadingCounts] = useState<boolean>(true);

  // Données d’aperçu histogramme (droite)
  const [previewData, setPreviewData] = useState<PreviewPoint[]>([]);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(true);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Redirige si non authentifié
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    }
  }, [status, router]);

  useEffect(() => {
  if (!userProductId) return;

  (async () => {
    try {
      const res = await fetch(`/api/configuration/informationnel?userProductId=${userProductId}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (json.success) {
        setFilledSections(json.filledSections ?? 0);
        setTotalSections(json.totalSections ?? 0);
      }
    } catch (e) {
      console.error("Erreur récupération info counter:", e);
    }
  })();
}, [userProductId]);

  // Charge les compteurs par intention (24h démo gelées)
  useEffect(() => {
    if (status !== "authenticated") return;

    const controller = new AbortController();

    (async () => {
      try {
        setLoadingCounts(true);

        const params = new URLSearchParams();
        // 24h côté API

        // démo gelée
        if (DEMO_MODE) {
          params.set("demo", "1");
          params.set("demoDays", String(DEMO_DAYS));
          params.set("anchor", DEMO_ANCHOR_ISO);
          params.set("demoPreserveDow", "1");
        }

        // centre sélectionné
        if (selectedUserId) params.set("asUserId", String(selectedUserId));

        const res = await fetch(`/api/calls?userProductId=${userProductId}&mode=all`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!res.ok) throw new Error("Erreur récupération appels");
        const data: Call[] = await res.json();
        console.log("calls", data);

        // stricte journée d'anchor (00:00–23:59)
        const { start, end } = getAnchorDayBounds(new Date().toISOString());

        const todaysCalls = data.filter((c) => {
          console.log(new Date(c.createdAt));
          console.log("start", start);
          console.log("end", end);

          const d = new Date(c.createdAt);
          return d >= start && d <= end;
        });

        const counts = intents.map((it) => {

          if (it.value === "all") {
            return todaysCalls.length;
          }

          if (it.value === "urgency") {
            return todaysCalls.reduce((acc, c: any) => {
              const emergency = c.stats?.emergency;

              const isEmergency =
                emergency === true ||
                emergency === "true" ||
                emergency === 1 ||
                (Array.isArray(emergency) && emergency.length > 0) ||
                (typeof emergency === "object" && emergency !== null);

              return acc + (isEmergency ? 1 : 0);
            }, 0);
          }

          if (it.value === "pourcentage") {
            return getIndice(todaysCalls);
          }

          return todaysCalls.reduce((acc, c: any) => {
            console.log(c.stats);
            return c.stats?.rdv_booked != 0 ? acc + c.stats?.rdv_booked : acc;
          }, 0);

        });


        setCallsCountByIntent(counts);
      } catch (e) {
        if (!isAbortError(e)) {
          setCallsCountByIntent(intents.map(() => 0));
        }
      } finally {
        setLoadingCounts(false);
      }
    })();

    return () => controller.abort();
  }, [status, selectedUserId, userProductId]);

  // Charge l’aperçu histogramme (30j démo gelés)
  useEffect(() => {
    if (status !== "authenticated") return;

    const controller = new AbortController();

    (async () => {
      try {
        setLoadingPreview(true);

        const params = new URLSearchParams();
        if (DEMO_MODE) {
          params.set("demo", "1");
          params.set("demoDays", String(DEMO_DAYS));
          params.set("anchor", DEMO_ANCHOR_ISO);
          params.set("demoPreserveDow", "1");
        }
        if (selectedUserId) params.set("asUserId", String(selectedUserId));

        const res = await fetch(`/api/calls?userProductId=${userProductId}&mode=all`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Erreur récupération stats");
        const calls: Call[] = await res.json();

        // groupement par JOUR ISO (stable)
        const byIso = new Map<string, number>();
        for (const c of calls) {
          const d = new Date(c.createdAt);
          const iso = d.toISOString().slice(0, 10);
          byIso.set(iso, (byIso.get(iso) || 0) + 1);
        }

        const points = Array.from(byIso.entries())
          .map(([iso, total]) => ({
            iso,
            day: new Date(iso).toLocaleDateString(),
            total,
          }))
          .sort((a, b) => (a.iso < b.iso ? -1 : 1));

        setPreviewData(points.slice(-14).map(({ day, total }) => ({ day, total })));
      } catch (e) {
        if (!isAbortError(e)) setPreviewData([]);
      } finally {
        setLoadingPreview(false);
      }
    })();

    return () => controller.abort();
  }, [status, selectedUserId, userProductId]);

  if (!mounted) return null;

  /* === Petits sous-composants locaux pour la DA === */

  const KpiTile = ({
    label,
    value,
    icon,
    loading,
    valueColor,
  }: {
    label: string;
    value: string | number;
    icon: React.ReactNode;
    loading?: boolean;
    valueColor?: string;
  }) => (
    <Card sx={{ p: 2.5, height: "100%" }} elevation={1}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: "12px",
            display: "grid",
            placeItems: "center",
            bgcolor: "rgba(72,200,175,0.12)",
            color: "#2a6f64",
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="caption" color="text.secondary" noWrap>
            {label}
          </Typography>
          {loading ? (
            <Skeleton variant="text" width={80} height={28} />
          ) : (
            <Typography
              variant="h5"
              fontWeight={800}
              sx={{ color: valueColor, lineHeight: 1.2 }}
              noWrap
            >
              {value}
            </Typography>
          )}
        </Box>
      </Box>
    </Card>
  );

  const NavCard = ({
    title,
    description,
    icon,
    href,
    badge,
  }: {
    title: string;
    description: string;
    icon: React.ReactNode;
    href: string;
    badge?: React.ReactNode;
  }) => (
    <Card
      elevation={1}
      onClick={() => router.push(href)}
      sx={{
        p: 2.5,
        height: "100%",
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        cursor: "pointer",
        transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease",
        border: "1px solid transparent",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: "0 8px 24px rgba(72,200,175,0.15)",
          borderColor: "rgba(72,200,175,0.4)",
        },
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: "10px",
          display: "grid",
          placeItems: "center",
          bgcolor: "rgba(72,200,175,0.12)",
          color: "#2a6f64",
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Typography variant="subtitle1" fontWeight={700} noWrap>
            {title}
          </Typography>
          {badge}
        </Box>
        <Typography variant="caption" color="text.secondary">
          {description}
        </Typography>
      </Box>
      <Box sx={{ color: "#9ca3af", flexShrink: 0 }}>
        <IconChevronRight size={18} />
      </Box>
    </Card>
  );

  // Indice (utilisé pour la couleur de la tuile)
  const indiceValue = Number(callsCountByIntent[0] ?? 0);
  const indiceColor =
    indiceValue >= 80 ? "#22c55e" : indiceValue >= 60 ? "#f59e0b" : "#ef4444";

  // Total appels du jour : on dérive depuis les compteurs ou calculs existants
  // (somme indirecte non précise — on utilise rdv_pris+urgences faute de mieux,
  // ou on attend que loadingCounts soit fini pour fallback)
  const totalCallsToday = previewData.length > 0 ? previewData[previewData.length - 1]?.total ?? 0 : 0;

  return (
    <ClientLayout>
      <PageContainer title="LyraeTalk" description="Vue d'ensemble du service vocal">
        <Box>
          <SectionHeader
            title="LyraeTalk"
            subtitle="Vue d'ensemble du service vocal · 24 dernières heures"
          />

          {/* === Row 1 : KPI tiles === */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <KpiTile
                label="Indice de performance"
                value={`${indiceValue}%`}
                icon={<IconGauge size={20} />}
                loading={loadingCounts}
                valueColor={indiceColor}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <KpiTile
                label="Prises de RDV"
                value={callsCountByIntent[1] ?? 0}
                icon={<IconCalendarCheck size={20} />}
                loading={loadingCounts}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <KpiTile
                label="Urgences"
                value={callsCountByIntent[2] ?? 0}
                icon={<IconAlertTriangle size={20} />}
                loading={loadingCounts}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <KpiTile
                label="Appels (aujourd'hui)"
                value={totalCallsToday}
                icon={<IconPhone size={20} />}
                loading={loadingPreview}
              />
            </Grid>
          </Grid>

          {/* === Row 2 : Histogramme + bouton détails === */}
          <Card sx={{ p: 3, mb: 3 }} elevation={1}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 2,
                flexWrap: "wrap",
                mb: 1,
              }}
            >
              <Box>
                <Typography
                  variant="overline"
                  sx={{ color: "#2a6f64", fontWeight: 700, letterSpacing: 1 }}
                >
                  Activité — 14 derniers jours
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Nombre d&apos;appels par jour
                </Typography>
              </Box>
              <Button
                variant="outlined"
                startIcon={<IconChartBar size={18} />}
                onClick={() => router.push(`${basePath}/stats_appel`)}
                sx={{
                  borderColor: "#48C8AF",
                  color: "#2a6f64",
                  fontWeight: 600,
                  "&:hover": { borderColor: "#3BA992", bgcolor: "rgba(72,200,175,0.08)" },
                }}
              >
                Statistiques détaillées
              </Button>
            </Box>
            <Divider sx={{ mb: 2 }} />

            {loadingPreview ? (
              <ChartSkeleton height={280} />
            ) : previewData.length === 0 ? (
              <Box sx={{ py: 6, textAlign: "center" }}>
                <Typography color="text.secondary">
                  Aucune donnée à afficher pour la période.
                </Typography>
              </Box>
            ) : (
              <Box sx={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={previewData}>
                    <CartesianGrid stroke="#f0f0f0" strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid rgba(72,200,175,0.3)",
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="total" fill="#48C8AF" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Card>

          {/* === Row 3 : Accès rapide aux pages métier === */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              mb: 2,
            }}
          >
            <Box sx={{ width: 4, height: 28, borderRadius: 1, bgcolor: "#48C8AF" }} />
            <Typography variant="subtitle1" fontWeight={800}>
              Accès rapide
            </Typography>
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={6}>
              <NavCard
                title="Liste des appels"
                description="Historique, recherche, transcriptions"
                icon={<IconPhone size={20} />}
                href={`${basePath}/calls`}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={6}>
              <NavCard
                title="Statistiques d'appels"
                description="Indicateurs détaillés et analyses"
                icon={<IconChartBar size={20} />}
                href={`${basePath}/stats_appel`}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={6}>
              <NavCard
                title="Module informationnel"
                description="Infos centre, accès, horaires, examens"
                icon={<IconInfoCircle size={20} />}
                href={`${basePath}/informationnel`}
                badge={
                  loadingCounts ? (
                    <Skeleton variant="rounded" width={42} height={20} />
                  ) : totalSections > 0 ? (
                    <Chip
                      size="small"
                      label={`${filledSections}/${totalSections}`}
                      sx={{
                        height: 20,
                        bgcolor: "rgba(72,200,175,0.15)",
                        color: "#2a6f64",
                        fontWeight: 600,
                        fontSize: 11,
                      }}
                    />
                  ) : undefined
                }
              />
            </Grid>
            <Grid item xs={12} sm={6} md={6}>
              <NavCard
                title="Paramétrage Talk"
                description="Voix, mapping, questions, options du bot"
                icon={<IconSettings size={20} />}
                href={`${basePath}/parametrage`}
              />
            </Grid>
          </Grid>
        </Box>
      </PageContainer>
    </ClientLayout>
  );
}
