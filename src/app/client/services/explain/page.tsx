"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Typography, CircularProgress, Grid, Paper } from "@mui/material";
import MetricDonut from "@/components/MetricDonut";

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

  // Rediriger si l'utilisateur n'est pas authentifié
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    }
  }, [status, router]);

  // Récupérer les données du client
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

  // Vérifier si le client est abonné au service Lyrae Explain + Satisfy
  const explainProduct = clientData.userProducts.find(
    (up) => up.product.name === "LyraeExplain"
  );

  if (!explainProduct) {
    return (
      <Typography variant="h6" sx={{ mt: 4, textAlign: "center" }}>
        Vous n&apos;êtes pas affilié au service Lyrae Explain.
      </Typography>
    );
  }

  // Préparer les métriques (elles peuvent être nulles)
  // const metrics: { [key: string]: number | null } = {
  //   "Prise de RDV": explainProduct.rdv ?? null,
  //   "Borne d'accueil": explainProduct.borne ?? null,
  //   "Prise en charge examen": explainProduct.examen ?? null,
  //   "Prise en charge secrétaire": explainProduct.secretaire ?? null,
  //   "Attente": explainProduct.attente ?? null,
  // };

  const metrics: { [key: string]: number | null } = {
    "Prise de RDV": 87,
    "Borne d'accueil": 34,
    "Prise en charge examen": 67,
    "Prise en charge secrétaire": 97,
    "Attente": 52,
  };

  // Calculer la moyenne en n'incluant que les valeurs non nulles (seulement si au moins 2 valeurs sont disponibles)
  const validValues = Object.values(metrics).filter(
    (v) => v !== null && v !== undefined
  ) as number[];
  const average =
    validValues.length >= 2
      ? validValues.reduce((sum, v) => sum + v, 0) / validValues.length
      : null;

  const metricsUpdatedAt = explainProduct.metricsUpdatedAt;

  const comments = [
    "Lieu propre. Parkings spacieux. Radiologue aimable. Mais ne vous attendez pas à être accueilli chaleureusement. \nDès votre arrivée vous vous enregistrez sur une borne et comme un automate vous suivez les tracés au sol et les consignes. \nPas de rencontre avec le médecin pour l'analyse du scanner ou autre. C'est devant votre écran chez vous à l'aide de codes que vous découvrez l'analyse du médecin inconnu. \nBref pas trop d'humanité dans ce lieu (d'où une étoile en moins).",
    "Médecins empathiques et secrétaires au top. Je suis venue il y a un an en urgence, les secrétaires ont su me guider vers le bon examen et se sont occupées de ma fille pendant mon scanner. \nMerci !",
    "J'ai été pris avec de l avance. Secrétaire aimable et compréhensive. \nTres satisfait de mon examen",
    "Les secrétaires sont juste au top que ce soit côté IRM ou côté scanner ! Côté examen, on sent que c'est un peu la chaîne, mais c'est aussi ce qui fait qu'on est pris à l'heure. \nLes professionnels sont souriants et agréables, et certains font preuve d'empathie. Merci à vous.",
  ];

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" align="center" sx={{ overflowY: "auto" }} gutterBottom>
        Feedback du service Lyrae Explain + Satisfy
      </Typography>
      <Typography variant="subtitle1" align="center" gutterBottom>
        Vos indicateurs de satisfaction
      </Typography>
      {metricsUpdatedAt && (
        <Typography
          variant="caption"
          align="center"
          display="block"
          sx={{ mb: 4, color: "text.secondary" }}
        >
          Data mise à jour le {new Date(metricsUpdatedAt).toLocaleDateString()}
        </Typography>
      )}
      <Grid container spacing={4} rowSpacing={12} justifyContent="center">
        {/* Ligne 1 : Moyenne au centre */}
        <Grid item xs={12} sx={{ display: "flex", justifyContent: "center" }}>
          <MetricDonut value={average} label="Moyenne" />
        </Grid>
        {/* Ligne 2 et 3 : 5 métriques individuelles */}
        {Object.entries(metrics).map(([metricName, value]) => (
          <Grid
            item
            xs={12}
            sm={6}
            md={4}
            key={metricName}
            sx={{ display: "flex", justifyContent: "center" }}
          >
            <MetricDonut value={value} label={metricName} />
          </Grid>
        ))}
      </Grid>

      <Box sx={{ mt: 6 }}>
        <Typography variant="h5" align="center" gutterBottom>
          Avis des utilisateurs
        </Typography>
        <Grid container spacing={2} justifyContent="center">
          {comments.map((comment, index) => (
            <Grid item xs={12} sm={6} md={4} key={index}>
              <Paper
                sx={{
                  p: 2,
                  textAlign: "center",
                  backgroundColor: "white",
                  boxShadow: 3,
                  borderRadius: "8px",
                }}
              >
                <Typography variant="body1" color="text.secondary" sx={{ whiteSpace: "pre-line" }}>
                  {comment}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Box>
    </Box>
  );
};

export default ExplainPage;
