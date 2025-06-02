// pages/client/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Divider,
} from "@mui/material";

interface Product {
  id: number;
  name: string;
  description?: string;
}

interface UserProduct {
  product: Product;
  assignedAt: string;
}

interface ClientData {
  id: number;
  name: string;
  email: string;
  userProducts: UserProduct[];
}

const ProfilePage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);

  // Rediriger l'utilisateur non authentifié
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    }
  }, [status, router]);

  // Récupérer les données du client depuis l'API
  useEffect(() => {
    async function fetchClientData() {
      try {
        const res = await fetch("/api/client");
        if (!res.ok) {
          console.error("Erreur lors de la récupération des données client.");
          return;
        }
        const data: ClientData = await res.json();
        setClientData(data);
      } catch (error) {
        console.error("Error fetching client data:", error);
      } finally {
        setLoading(false);
      }
    }
    if (status === "authenticated") {
      fetchClientData();
    }
  }, [status]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
        <CircularProgress
          sx={{
            '& .MuiCircularProgress-svg': {
              color: '#48C8AF',
            },
          }}
        />
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

  return (
    <Box sx={{ p: 16 }}>
      <Typography variant="h4" gutterBottom>
        Mon Profil
      </Typography>
      <Typography variant="body1" gutterBottom>
        <strong>Nom : </strong> {clientData.name}
      </Typography>
      <Typography variant="body1" gutterBottom>
        <strong>Email : </strong> {clientData.email}
      </Typography>

      <Divider sx={{ my: 3 }} />

      <Typography variant="h6" gutterBottom>
        Produits souscrits :
      </Typography>
      {clientData.userProducts && clientData.userProducts.length > 0 ? (
        <List>
          {clientData.userProducts.map((up) => (
            <ListItem key={up.product.id} disableGutters>
              <ListItemText
                primary={up.product.name}
                secondary={`Souscrit le ${new Date(
                  up.assignedAt
                ).toLocaleDateString()}`}
              />
            </ListItem>
          ))}
        </List>
      ) : (
        <Typography variant="body1">
          Aucun produit souscrit.
        </Typography>
      )}

      {/* Bloc d'informations support */}
      <Box sx={{ mt: 4 }}>
        <Typography
          color="text.primary"
          align="center"
          display="block"
          sx={{ mb: 0.5 }}
        >
          Pour toute demande de modification de vos informations de compte
          (nom, email, mot de passe),
        </Typography>
        <Typography
          color="text.primary"
          align="center"
          display="block"
        >
          veuillez contacter notre support :{" "}
          <strong>support@neuracorp.ai</strong>
        </Typography>
      </Box>
    </Box>
  );
};

export default ProfilePage;
