"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Typography, CircularProgress, Grid } from "@mui/material";
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

  // Vérifier si le client est abonné au service LyraeExplain
  const explainProduct = clientData.userProducts.find(
    (up) => up.product.name === "LyraeExplain"
  );

  if (!explainProduct) {
    return (
      <Typography variant="h6" sx={{ mt: 4, textAlign: "center" }}>
        Vous n'êtes pas affilié au service LyraeExplain.
      </Typography>
    );
  }

  // Préparer les métriques (elles peuvent être nulles)
  const metrics: { [key: string]: number | null } = {
    "Prise de RDV": explainProduct.rdv ?? null,
    "Borne d'accueil": explainProduct.borne ?? null,
    "Prise en charge examen": explainProduct.examen ?? null,
    "Prise en charge secrétaire": explainProduct.secretaire ?? null,
    "Attente": explainProduct.attente ?? null,
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

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" align="center" gutterBottom>
        Feedback du service LyraeExplain
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
    </Box>
  );
};

export default ExplainPage;
