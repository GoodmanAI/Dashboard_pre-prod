"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Typography,
  CircularProgress,
  Grid,
  Paper,
  Select,
  MenuItem,
} from "@mui/material";
import MetricDonut from "@/components/MetricDonut";
import MultiCurveChart from "@/components/MultiCurveChart";
import { useCentre } from "@/app/context/CentreContext";

/** Élément de commentaire patient associé à un mois. */
interface CommentItem {
  date: string;
  comment: string;
}

/** Structure d’un point de métriques mensuelles pour Explain + Satisfy. */
export interface CHUData {
  month: string;
  fullMonth: string;
  rdv: number;
  accueil: number;
  examen: number;
  secretaire: number;
  attente: number;
  moyenne: number;
  [key: string]: string | number;
}

/** Détails Explain renvoyés par l’API pour un produit utilisateur. */
interface ExplainDetails {
  metricsByMonth: CHUData[];
  commentsByMonth: Record<string, CommentItem[]>[];
}

/** Lien produit-utilisateur tel que servi par /api/client. */
interface UserProduct {
  product: { id: number; name: string };
  explainDetails: ExplainDetails | null;
}

/** Payload minimal de /api/client exploité par cette page. */
interface ClientData {
  userProducts: UserProduct[];
}

/** Ensemble typé des clés de métriques représentées en anneaux. */
type MetricKey = "moyenne" | "rdv" | "accueil" | "examen" | "secretaire" | "attente";

/** Définition des courbes (libellés/couleurs/tooltip) affichées dans le graphique. */
const curves = [
  { key: "moyenne", label: "Moyenne", color: "#838383", comment: "Note moyenne globale du mois sélectionné." },
  { key: "rdv", label: "RDV", color: "#1976d2", comment: "Satisfaction liée à la prise de rendez-vous." },
  { key: "accueil", label: "Accueil", color: "#37D253", comment: "Satisfaction lors de l'accueil." },
  { key: "examen", label: "Examen", color: "#6237D2", comment: "Satisfaction pendant l'examen médical." },
  { key: "secretaire", label: "Secrétaire", color: "#D237C2", comment: "Qualité de l’accueil par le secrétariat." },
  { key: "attente", label: "Attente", color: "#37D2D2", comment: "Temps d’attente ressenti par les patients." },
];

export default function ExplainPage() {
  /** Gestion session, navigation et contexte (centre sélectionné côté admin). */
  const { data: session, status } = useSession();
  const router = useRouter();
  const { selectedUserId, selectedCentre } = useCentre();

  /** États d’affichage et de données. */
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<CHUData[]>([]);
  const [commentsMap, setCommentsMap] = useState<Record<string, CommentItem[]>>({});
  const [selectedMonth, setSelectedMonth] = useState<string>("");

  /** Redirection si l’utilisateur n’est pas authentifié. */
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    }
  }, [status, router]);

  /**
   * Chargement des métriques Explain :
   * - Appelle /api/client (ou /api/client?asUserId=...) selon le centre sélectionné
   * - Identifie le produit "Explain"
   * - Normalise les commentaires sous forme de map { mois -> commentaires[] }
   * - Sélectionne par défaut le premier mois retourné
   */
  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setMetrics([]);
        setCommentsMap({});
        setSelectedMonth("");

        const url = selectedUserId
          ? `/api/client?asUserId=${selectedUserId}`
          : `/api/client`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("Échec de récupération du client");
        const data: ClientData = await res.json();

        const explainUP = data.userProducts.find((up) =>
          up.product.name.toLowerCase().includes("explain")
        );

        if (!explainUP || !explainUP.explainDetails) {
          if (!cancelled) {
            setMetrics([]);
            setCommentsMap({});
            setSelectedMonth("");
          }
          return;
        }

        const m = explainUP.explainDetails.metricsByMonth || [];
        if (cancelled) return;

        setMetrics(m);

        // Fusion des maps de commentaires en une seule map indexée par mois.
        const merged: Record<string, CommentItem[]> = {};
        (explainUP.explainDetails.commentsByMonth || []).forEach((obj) => {
          Object.entries(obj).forEach(([mois, commentaires]) => {
            merged[mois] = commentaires;
          });
        });

        // Garantit une entrée de commentaires pour chaque mois de métriques.
        const cMap: Record<string, CommentItem[]> = {};
        m.forEach(({ month }) => { cMap[month] = merged[month] || []; });
        setCommentsMap(cMap);

        setSelectedMonth(m[0]?.month ?? "");
      } catch (e) {
        console.error(e);
        setMetrics([]);
        setCommentsMap({});
        setSelectedMonth("");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, selectedUserId]);

  /** États transitoires (chargement / absence de données). */
  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
        <CircularProgress sx={{ "& .MuiCircularProgress-svg": { color: "#48C8AF" } }} />
      </Box>
    );
  }

  if (metrics.length === 0) {
    return (
      <Typography variant="h6" sx={{ mt: 4, textAlign: "center" }}>
        {selectedCentre
          ? "Ce centre n'est pas affilié au service Lyrae Explain."
          : "Vous n'êtes pas affilié au service Lyrae Explain."}
      </Typography>
    );
  }

  /** Données du mois actuellement sélectionné (métriques + commentaires). */
  const selectedMonthData = metrics.find((d) => d.month === selectedMonth)!;
  const commentsData = commentsMap[selectedMonth] || [];
  const fullMonthName = selectedMonthData.fullMonth;

  return (
    <Box sx={{ backgroundColor: "#F8F8F8", minHeight: "100vh", p: 4, overflow: "auto" }}>
      {/* En-tête (titre + sous-titre contextualisé selon centre sélectionné) */}
      <Box sx={{ textAlign: "left", mb: 4 }}>
        <Typography variant="h1">
          <Box component="span" sx={{ fontWeight: 900 }}>LYRAE©</Box> Explain + Satisfy
        </Typography>
        <Typography variant="subtitle1">
          {selectedCentre
            ? `Indicateurs et retours du centre sélectionné.`
            : `Vos indicateurs et retours d'expérience en un coup d'œil.`}
        </Typography>
      </Box>

      {/* Zone principale : graphique multi-courbes + panneaux de métriques mensuelles */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={12} md={7}>
          <MultiCurveChart data={metrics} curves={curves} />
        </Grid>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 2, height: 400, display: "flex", flexDirection: "column", gap: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>Indicateurs de satisfaction</Typography>
                <Typography variant="subtitle2" sx={{ color: "text.secondary" }}>
                  Sur le mois de <strong>{fullMonthName}</strong>
                </Typography>
              </Box>
              <Select
                size="small"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                MenuProps={{ PaperProps: { sx: { maxHeight: 48 * 4.5, overflowY: "auto" } } }}
              >
                {metrics.map((item) => (
                  <MenuItem key={item.month} value={item.month}>{item.month}</MenuItem>
                ))}
              </Select>
            </Box>

            <Grid container spacing={1} sx={{ flexGrow: 1 }}>
              <Grid item xs={5}>
                <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
                  <MetricDonut
                    value={selectedMonthData.moyenne}
                    label={curves.find((c) => c.key === "moyenne")!.label}
                    tooltip={curves.find((c) => c.key === "moyenne")!.comment}
                    type="full"
                    customSize={150}
                    valueFontSize={28}
                  />
                </Box>
              </Grid>
              <Grid item xs={7}>
                <Paper sx={{ backgroundColor: "#F8F8F8", p: 1, height: "100%" }} elevation={0}>
                  <Grid container spacing={1}>
                    {(["rdv", "accueil", "examen", "secretaire", "attente"] as MetricKey[]).map((key) => (
                      <Grid item xs={6} key={key}>
                        <MetricDonut
                          value={selectedMonthData[key]}
                          label={key.charAt(0).toUpperCase() + key.slice(1)}
                          tooltip={curves.find((c) => c.key === key)!.comment}
                          type="half"
                          customSize={90}
                        />
                      </Grid>
                    ))}
                  </Grid>
                </Paper>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      {/* Liste des commentaires du mois sélectionné */}
      <Paper sx={{ p: 3, backgroundColor: "#FFF" }}>
        <Typography variant="h5">Les commentaires de votre service</Typography>
        <Typography variant="subtitle1" sx={{ mb: 3 }}>
          Sur le mois de <strong>{fullMonthName}</strong>
        </Typography>
        <Grid container spacing={2}>
          {commentsData.map((item, idx) => (
            <Grid item xs={12} sm={6} md={3} key={idx}>
              <Paper
                sx={{
                  p: 2,
                  pt: 2,
                  pb: 4,
                  textAlign: "center",
                  minHeight: 150,
                  position: "relative",
                }}
                elevation={0}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: "0.75rem",
                    mb: 1,
                    fontWeight: 500,
                    lineHeight: 1.4,
                    display: "-webkit-box",
                    WebkitLineClamp: 6,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {item.comment}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    position: "absolute",
                    bottom: 8,
                    left: "50%",
                    transform: "translateX(-50%)",
                    fontWeight: 500,
                    color: "#9f9f9f",
                  }}
                >
                  {item.date}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Paper>
    </Box>
  );
}
