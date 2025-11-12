"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Skeleton, // <= NEW
} from "@mui/material";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { IconEye, IconChartBar } from "@tabler/icons-react";
import { useCentre } from "@/app/context/CentreContext";

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
  { value: "all",          sing_label: "Appel reçu",  label: "Appels reçus" },
  { value: "prise de rdv", sing_label: "Rendez-vous", label: "Rendez-vous" },
  { value: "urgence",      sing_label: "Urgence",     label: "Urgences" },
];

// --- Démo figée ---
const DEMO_MODE = true; // passe à false si tu veux repasser en live
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
  const { data: session, status } = useSession();
  const router = useRouter();
  const { selectedUserId, selectedCentre } = useCentre();
  const userProductId = Number(params.id);

  // Compteurs par intention
  const [callsCountByIntent, setCallsCountByIntent] = useState<number[]>([]);
  const [loadingCounts, setLoadingCounts] = useState<boolean>(true);

  // Données d’aperçu histogramme (droite)
  const [previewData, setPreviewData] = useState<PreviewPoint[]>([]);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(true);

  // Redirige si non authentifié
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    }
  }, [status, router]);

  // Charge les compteurs par intention (24h démo gelées)
  useEffect(() => {
    if (status !== "authenticated") return;

    const controller = new AbortController();

    (async () => {
      try {
        setLoadingCounts(true);

        const params = new URLSearchParams();
        // 24h côté API
        params.set("daysAgo", "1");

        // démo gelée
        if (DEMO_MODE) {
          params.set("demo", "1");
          params.set("demoDays", String(DEMO_DAYS));
          params.set("anchor", DEMO_ANCHOR_ISO);
          params.set("demoPreserveDow", "1");
        }

        // centre sélectionné
        if (selectedUserId) params.set("asUserId", String(selectedUserId));

        const res = await fetch(`/api/calls?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
          headers: { "Cache-Control": "no-store" },
        });
        if (!res.ok) throw new Error("Erreur récupération appels");
        const data: Call[] = await res.json();

        // stricte journée d'anchor (00:00–23:59)
        const { start, end } = getAnchorDayBounds(DEMO_ANCHOR_ISO);
        const todaysCalls = data.filter((c) => {
          const d = new Date(c.createdAt);
          return d >= start && d <= end;
        });

        const counts = intents.map((it) =>
          todaysCalls.filter((c) => it.value === "all" || c.intent === it.value).length
        );

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
  }, [status, selectedUserId]);

  // Charge l’aperçu histogramme (30j démo gelés)
  useEffect(() => {
    if (status !== "authenticated") return;

    const controller = new AbortController();

    (async () => {
      try {
        setLoadingPreview(true);

        const params = new URLSearchParams();
        params.set("daysAgo", "30");
        if (DEMO_MODE) {
          params.set("demo", "1");
          params.set("demoDays", String(DEMO_DAYS));
          params.set("anchor", DEMO_ANCHOR_ISO);
          params.set("demoPreserveDow", "1");
        }
        if (selectedUserId) params.set("asUserId", String(selectedUserId));

        const res = await fetch(`/api/calls?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
          headers: { "Cache-Control": "no-store" },
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
  }, [status, selectedUserId]);

  return (
    <Box sx={{ p: 3, bgcolor: "#F8F8F8", minHeight: "100vh" }}>
      {/* Titre principal */}
      <Typography variant="h4" gutterBottom>
        LYRAE © Talk
      </Typography>

      {/* SECTION 1 : Appels (à gauche) + Statistiques (à droite) */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {/* Colonne Appels (gauche) */}
        <Grid item xs={12} md={7}>
          <Box sx={{ p: 3, bgcolor: "#fff", borderRadius: 2, height: "100%" }}>
            <Typography variant="h5" gutterBottom>
              Appels
            </Typography>
            <Typography variant="subtitle1" gutterBottom>
              {selectedCentre
                ? "Visualisez les appels du centre sélectionné."
                : "Visualisez vos appels pris en charge par LyraeTalk."}
            </Typography>

            <Card
              sx={{
                borderRadius: 2,
                border: "1px solid #e0e0e0",
                p: 2,
                mt: 2,
              }}
            >
              <CardContent sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <Typography variant="h6">Total (24h)</Typography>

                <Box
                  sx={{
                    mt: 1,
                    display: "flex",
                    flexWrap: "wrap",
                  }}
                >
                  {loadingCounts ? (
                    // ---- Skeletons des 3 compteurs ----
                    <>
                      <CountItemSkeleton />
                      <CountItemSkeleton />
                      <CountItemSkeleton />
                    </>
                  ) : (
                    intents.map((it, index) => (
                      <Box
                        key={it.value}
                        sx={{
                          pt: 2,
                          m: 1,
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          flexDirection: "column",
                          width: "150px",
                        }}
                      >
                        <Typography variant="h5" sx={{ mb: 0 }}>
                          {callsCountByIntent[index] ?? 0}
                        </Typography>
                        <Typography variant="subtitle1" sx={{ mb: 4 }}>
                          {(callsCountByIntent[index] ?? 0) > 1 ? it.label : it.sing_label}
                        </Typography>
                      </Box>
                    ))
                  )}
                </Box>

                <Box sx={{ mt: "auto", pt: 2 }}>
                  <Button
                    variant="outlined"
                    startIcon={<IconEye size={18} />}
                    onClick={() => router.push("/client/services/talk/calls")}
                    sx={{
                      borderColor: "#48C8AF",
                      color: "#48C8AF",
                      "&:hover": {
                        borderColor: "#48C8AF",
                        backgroundColor: "rgba(72,200,175,0.08)",
                      },
                    }}
                  >
                    Voir la liste des appels
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Grid>

        {/* Colonne Statistiques (droite) */}
        <Grid item xs={12} md={5}>
          <Box sx={{ p: 3, bgcolor: "#fff", borderRadius: 2, height: "100%" }}>
            <Typography variant="h5" gutterBottom>
              Statistiques appels
            </Typography>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
              Aperçu des 14 derniers jours (nombre d’appels / jour)
            </Typography>

            {loadingPreview ? (
              // ---- Skeleton du graphique ----
              <ChartSkeleton />
            ) : previewData.length === 0 ? (
              <Typography color="text.secondary">Aucune donnée à afficher.</Typography>
            ) : (
              <Box sx={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={previewData}>
                    <CartesianGrid stroke="#e0e0e0" strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="total" fill="#48C8AF" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}

            <Box sx={{ textAlign: "right", mt: 2 }}>
              <Button
                variant="outlined"
                startIcon={<IconChartBar size={18} />}
                onClick={() => router.push("/client/services/talk/stats_appel")}
                sx={{
                  borderColor: "#48C8AF",
                  color: "#48C8AF",
                  "&:hover": { backgroundColor: "rgba(72,200,175,0.08)" },
                }}
              >
                Voir les statistiques détaillées
              </Button>
            </Box>
          </Box>
        </Grid>
      </Grid>

      {/* === Bloc 2 : Informations & Libellés === */}
      <Box sx={{ p: 3, mt: 2, bgcolor: "#fff", borderRadius: 2 }}>
        <Typography variant="h5" gutterBottom>
          Informations & Libellés
        </Typography>
        <Typography variant="subtitle1" gutterBottom>
          Gérez les documents “Informations” et “Libellés” de votre service. Les données sont
          enregistrées localement et isolées par centre sélectionné.
        </Typography>

        <Card
          sx={{
            mt: 2,
            borderRadius: 2,
            border: "1px solid #e0e0e0",
            p: 2,
          }}
        >
          <CardContent
            sx={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 2 }}
          >
            <Box>
              <Typography variant="h6" sx={{ mb: 0.5 }}>
                Accéder aux documents
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Ouvrir la page dédiée pour consulter et modifier les champs informationnels et les libellés.
              </Typography>
            </Box>
            <Button
              variant="outlined"
              startIcon={<IconEye size={18} />}
              onClick={() => router.push(`/client/services/talk/${userProductId}/informationnel`)}
              sx={{
                borderColor: "#48C8AF",
                color: "#48C8AF",
                whiteSpace: "nowrap",
                "&:hover": {
                  borderColor: "#48C8AF",
                  backgroundColor: "rgba(72,200,175,0.08)",
                },
              }}
            >
              Ouvrir
            </Button>
          </CardContent>
        </Card>
      </Box>

      {/* SECTION 3 : Paramétrage Talk */}
      <Box sx={{ p: 3, bgcolor: "#fff", borderRadius: 2 }}>
        <Typography variant="h5" gutterBottom>
          Paramétrage Talk
        </Typography>
        <Typography variant="subtitle1" gutterBottom>
          Configurez les préférences de votre service (horaires, routage, notifications…).
        </Typography>

        <Card sx={{ borderRadius: 2, border: "1px solid #e0e0e0", p: 2, mt: 1 }}>
          <CardContent sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Typography variant="body2" color="text.secondary">
                
                Accéder aux paramètres avancés de Talk pour ce centre.
            </Typography>
            <Button
                variant="outlined"
                onClick={() => router.push(`/client/services/talk/${userProductId}/parametrage`)}
                sx={{
                borderColor: "#48C8AF",
                color: "#48C8AF",
                "&:hover": { backgroundColor: "rgba(72,200,175,0.08)" },
                }}
            >
              Ouvrir le paramétrage
            </Button>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
