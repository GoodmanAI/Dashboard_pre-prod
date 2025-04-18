"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Typography,
  CircularProgress,
  Grid,
  Paper
} from "@mui/material";
import MetricDonut from "@/components/MetricDonut";
// import MetricsPanel from "@/components/MetricsPanel";

interface UserProduct {
  product: {
    id: number;
    name: string;
  };
  assignedAt: string;
  rdv?: number | null;
  borne?: number | null;
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

const ExplainPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [loadingData, setLoadingData] = useState(true);

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
    "Borne d'accueil": 34,
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
        "Lieu propre. Parkings spacieux. Radiologue aimable. Mais ne vous attendez pas à être accueilli chaleureusement. Dès votre arrivée vous vous enregistrez sur une borne et comme un automate vous suivez les tracés au sol et les consignes. Pas de rencontre avec le médecin pour l'analyse du scanner ou autre. C'est devant votre écran chez vous à l'aide de codes que vous découvrez l'analyse du médecin inconnu. Bref pas trop d'humanité dans ce lieu (d'où une étoile en moins).",
      date: "10/03/2025",
    },
    {
      comment:
        "Les secrétaires sont juste au top que ce soit côté IRM ou côté scanner ! Côté examen, on sent que c'est un peu la chaîne, mais c'est aussi ce qui fait qu'on est pris à l'heure. Les professionnels sont souriants et agréables, et certains font preuve d'empathie. Merci à vous.",
      date: "15/03/2025",
    },
  ];

  return (
    <Box
      sx={{
        backgroundColor: "#F8F8F8",
        minHeight: "100vh",
        p: 4,
        overflow: "auto"
      }}
    >
      {/* Titre et sous-titre alignés à gauche */}
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
        {/* Placeholder composant gauche */}
        <Grid item xs={12} md={7}>
          <Paper
            sx={{
              p: 1,
              height: "350px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Box
              component="img"
              src="/images/graph/explain.png"
              alt="Placeholder"
              sx={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                objectPosition: "center",
              }}
            />
          </Paper>
        </Grid>

        {/* Composant droite : Donuts */}
        <Grid item xs={12} md={5}>
          <Paper
            sx={{
              p: 2,
              height: "350px",
            }}
          >
            {/* Titre et sous-titre dans la partie supérieure gauche */}
            <Box sx={{ textAlign: "left", mb: 2 }}>
              <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
                Indicateurs de satisfaction
              </Typography>
              <Typography variant="subtitle2" color="text.secondary">
                Sur le mois de <strong>Mars</strong>
              </Typography>
            </Box>
            <Grid container spacing={1}>
              {average !== null && (
                <Grid item xs={4}>
                  <Box>
                    <MetricDonut value={average} label="Moyenne" customSize={135} />
                  </Box>
                </Grid>
              )}
              {Object.entries(metrics).map(([metricName, value]) => (
                <Grid item xs={4} key={metricName}>
                  <Box>
                    <MetricDonut value={value ?? 0} label={metricName} />
                  </Box>
                </Grid>
              ))}
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
