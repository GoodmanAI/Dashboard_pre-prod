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
  MenuItem
} from "@mui/material";
import MetricDonut from "@/components/MetricDonut";
import MultiCurveChart from "@/components/MultiCurveChart";

interface UserProduct {
  product: {
    id: number;
    name: string;
  };
  assignedAt: string;
  rdv?: number | null;
  accueil?: number | null;
  examen?: number | null;
  secretaire?: number | null;
  attente?: number | null;
  metricsUpdatedAt?: string | null;
}

interface ClientData {
  id: number;
  name: string;
  email: string;
  userProducts: UserProduct[];
}

type MetricKey = "moyenne" | "rdv" | "accueil" | "examen" | "secretaire" | "attente";

const ExplainPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>('Mar');

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    }
  }, [status, router]);

  // Récupération des données client
  useEffect(() => {
    async function fetchClientData() {
      try {
        const response = await fetch("/api/client");
        if (!response.ok) {
          console.error("Erreur lors de la récupération des données client.");
          return;
        }
        const data = await response.json();
        setClientData(data);
      } catch (error) {
        console.error("Error fetching client data:", error);
      } finally {
        setLoadingData(false);
      }
    }
    if (session) {
      fetchClientData();
    }
  }, [session]);

  if (loadingData) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!clientData) {
    return (
      <Typography variant="h6" sx={{ mt: 4, textAlign: "center" }}>
        Aucune donnée client trouvée.
      </Typography>
    );
  }

  const explainProduct = clientData.userProducts.find(
    (up) => up.product.name === "LYRAE © Explain"
  );

  if (!explainProduct) {
    return (
      <Typography variant="h6" sx={{ mt: 4, textAlign: "center" }}>
        Vous n&apos;êtes pas affilié au service Lyrae Explain.
      </Typography>
    );
  }

  // Pour l'exemple, on utilise des valeurs statiques pour les métriques
  const metrics: { [key: string]: number | null } = {
    "Prise de RDV": 87,
    "accueil d'accueil": 34,
    "Prise en charge examen": 67,
    "Prise en charge secrétaire": 97,
    "Attente": 52,
  };

  // Calcul de la moyenne (si au moins 2 valeurs non nulles)
  const validValues = Object.values(metrics).filter(
    (v) => v !== null && v !== undefined
  ) as number[];
  const average =
    validValues.length >= 2
      ? validValues.reduce((sum, v) => sum + v, 0) / validValues.length
      : null;

  const metricsUpdatedAt = explainProduct.metricsUpdatedAt;

  const commentsData = [
    {
      comment:
        "Médecins empathiques et secrétaires au top. Je suis venue il y a un an en urgence, les secrétaires ont su me guider vers le bon examen et se sont occupées de ma fille pendant mon scanner. Merci !",
      date: "01/03/2025",
    },
    {
      comment:
        "J'ai été pris avec de l'avance. Secrétaire aimable et compréhensive. Très satisfait de mon examen",
      date: "05/03/2025",
    },
    {
      comment:
        "Lieu propre. Parkings spacieux. Radiologue aimable. Mais ne vous attendez pas à être accueilli chaleureusement. Dès votre arrivée vous vous enregistrez sur une accueil et comme un automate vous suivez les tracés au sol et les consignes. Pas de rencontre avec le médecin pour l'analyse du scanner ou autre. C'est devant votre écran chez vous à l'aide de codes que vous découvrez l'analyse du médecin inconnu. Bref pas trop d'humanité dans ce lieu (d'où une étoile en moins).",
      date: "10/03/2025",
    },
    {
      comment:
        "Les secrétaires sont juste au top que ce soit côté IRM ou côté scanner ! Côté examen, on sent que c'est un peu la chaîne, mais c'est aussi ce qui fait qu'on est pris à l'heure. Les professionnels sont souriants et agréables, et certains font preuve d'empathie. Merci à vous.",
      date: "15/03/2025",
    },
  ];

  const multiCurveData = [
    { month: "Jan", fullMonth: "Janvier", rdv: 30, accueil: 40, examen: 65, secretaire: 75, attente: 80, moyenne: 58 },
    { month: "Fév", fullMonth: "Février", rdv: 25, accueil: 50, examen: 55, secretaire: 72, attente: 78, moyenne: 56 },
    { month: "Mar", fullMonth: "Mars", rdv: 20, accueil: 45, examen: 60, secretaire: 85, attente: 90, moyenne: 60 },
    { month: "Avr", fullMonth: "Avril", rdv: 34, accueil: 38, examen: 69, secretaire: 77, attente: 88, moyenne: 61 },
    { month: "Mai", fullMonth: "Mai", rdv: 28, accueil: 42, examen: 50, secretaire: 80, attente: 76, moyenne: 55 },
    { month: "Juin", fullMonth: "Juin", rdv: 33, accueil: 65, examen: 36, secretaire: 79, attente: 85, moyenne: 60 },
    { month: "Juil", fullMonth: "Juillet", rdv: 22, accueil: 55, examen: 67, secretaire: 72, attente: 89, moyenne: 61 },
    { month: "Aoû", fullMonth: "Août", rdv: 31, accueil: 40, examen: 62, secretaire: 74, attente: 90, moyenne: 59 },
    { month: "Sep", fullMonth: "Septembre", rdv: 29, accueil: 45, examen: 68, secretaire: 75, attente: 80, moyenne: 59 },
    { month: "Oct", fullMonth: "Octobre", rdv: 26, accueil: 43, examen: 69, secretaire: 70, attente: 85, moyenne: 58 },
    { month: "Nov", fullMonth: "Novembre", rdv: 30, accueil: 50, examen: 36, secretaire: 78, attente: 88, moyenne: 56 },
    { month: "Déc", fullMonth: "Décembre", rdv: 34, accueil: 38, examen: 67, secretaire: 73, attente: 81, moyenne: 59 },
  ];

  const selectedMonthData = multiCurveData.find((item) => item.month === selectedMonth);

  const curves = [
    { key: "moyenne", label: "Moyenne", color: "#838383", comment: "Note moyenne globale du mois sélectionné." },
    { key: "rdv", label: "RDV", color: "#1976d2", comment: "Satisfaction liée à la prise de rendez-vous." },
    { key: "accueil", label: "Accueil", color: "#37D253", comment: "Satisfaction lors de l'accueil à l'entrée par les bornes mises en place notamment." },
    { key: "examen", label: "Examen", color: "#6237D2", comment: "Satisfaction pendant l'examen médical." },
    { key: "secretaire", label: "Secrétaire", color: "#D237C2", comment: "Qualité de l’accueil par le secrétariat." },
    { key: "attente", label: "Attente", color: "#37D2D2", comment: "Temps d’attente ressenti par les patients." },
  ];

  const monthsFullNameMap: Record<string, string> = {
    Jan: "Janvier",
    Fev: "Février",
    Mar: "Mars",
    Avr: "Avril",
    Mai: "Mai",
    Juin: "Juin",
    Juil: "Juillet",
    Aoû: "Août",
    Sep: "Septembre",
    Oct: "Octobre",
    Nov: "Novembre",
    Dec: "Décembre",
  };

  const fullMonthName = monthsFullNameMap[selectedMonth] || selectedMonth;

  const handleMonthChange = (event: any) => {
    setSelectedMonth(event.target.value);
  };

  return (
    <Box
      sx={{
        backgroundColor: "#F8F8F8",
        minHeight: "100vh",
        p: 4,
        overflow: "auto"
      }}
    >
      {/* Titre et sous-titre */}
      <Box sx={{ textAlign: "left", mb: 4 }}>
        <Typography variant="h1">
          <Box component="span" sx={{ fontWeight: 900 }}>
            LYRAE©
          </Box>{" "}
          Explain + Satisfy
        </Typography>
        <Typography variant="subtitle1">
          Vos indicateurs et retours d&apos;expérience en un coup d&apos;œil.
        </Typography>
      </Box>

      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={12} md={7}>
          <MultiCurveChart data={multiCurveData} curves={curves} />
        </Grid>

        <Grid item xs={12} md={5}>
          <Paper
            sx={{
              p: 2,
              height: 400,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-start",
              gap: 2,
            }}
          >
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
            <Box sx={{ display: "flex", flexDirection: "column" }}>
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                Indicateurs de satisfaction
              </Typography>
              <Typography variant="subtitle2" sx={{ color: "text.secondary" }}>
                Sur le mois de <strong>{fullMonthName}</strong>
              </Typography>
            </Box>
              <Select
                size="small"
                value={selectedMonth}
                onChange={handleMonthChange}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      maxHeight: 48 * 4.5,
                      overflowY: "auto",
                    },
                  },
                }}
              >
                {multiCurveData.map((item) => (
                  <MenuItem key={item.month} value={item.month}>
                    {item.month}
                  </MenuItem>
                ))}
              </Select>
            </Box>

            <Grid container spacing={1} sx={{ height: '100%' }}>
              <Grid item xs={5} sx={{ height: '100%' }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '100%',
                }}
              >
                <MetricDonut
                  value={selectedMonthData?.moyenne ?? null}
                  label={curves.find((c) => c.key === "moyenne")?.label || "moyenne"}
                  tooltip={curves.find((c) => c.key === "moyenne")?.comment || ""}
                  type="full"
                  customSize={150}
                  valueFontSize={28}
                />
              </Box>

              </Grid>
              <Grid item xs={7}>
                <Paper sx={{ backgroundColor: '#F8F8F8', p: 1, height: '100%' }}>
                  <Grid container spacing={1}>
                    {(["rdv", "accueil", "examen", "secretaire", "attente"] as MetricKey[]).map((key) => (
                      <Grid item xs={6} key={key}>
                        <MetricDonut
                          value={selectedMonthData?.[key] ?? null}
                          label={key.charAt(0).toUpperCase() + key.slice(1)}
                          tooltip={curves.find((c) => c.key === key)?.comment || ""}
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

      {/* Section Commentaires */}
      <Paper sx={{ p: 3, mb: 4, backgroundColor: "#FFFFFF" }}>
        <Typography variant="h5">
          Les commentaires de votre service
        </Typography>
        <Typography variant="subtitle1" sx={{ mb: 3 }}>
          Sur le mois de <strong>Mars</strong>
        </Typography>
        <Grid container spacing={2}>
          {commentsData.map((item, index) => (
            <Grid item xs={12} sm={6} md={3} key={index}>
              <Paper
                sx={{
                  p: 2,
                  textAlign: "center",
                  height: "200px",
                  position: "relative"
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: "0.75rem",
                    mb: 1,
                    fontWeight: 500,
                    lineHeight: 1.4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 6,
                    WebkitBoxOrient: "vertical"
                  }}
                >
                  {item.comment}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    position: "absolute",
                    bottom: 8,
                    left: 0,
                    right: 0,
                    textAlign: "center",
                    fontWeight: 500,
                    color: '#9f9f9f'
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
};

export default ExplainPage;
