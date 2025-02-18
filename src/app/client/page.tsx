"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
} from "@mui/material";

interface ClientData {
  id: number;
  name: string;
  email: string;
  userProducts: {
    product: {
      id: number;
      name: string;
    };
    assignedAt: string;
  }[];
}

const ClientHomePage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin?callbackUrl=/client");
    }
    if (status === "authenticated") {
      fetchClientData();
    }
  }, [status, router]);

  const fetchClientData = async () => {
    try {
      const res = await fetch("/api/client");
      if (!res.ok) {
        console.error("Erreur lors de la récupération des données client.");
        return;
      }
      const data = await res.json();
      setClientData(data);
    } catch (error) {
      console.error("Error fetching client data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading" || loading) {
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

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" gutterBottom>
        Bienvenue, {clientData.name} !
      </Typography>
      <Typography variant="subtitle1" gutterBottom>
        Voici la liste des produits auxquels vous êtes affilié :
      </Typography>
      {clientData.userProducts && clientData.userProducts.length > 0 ? (
        <List>
          {clientData.userProducts.map((up, index) => (
            <ListItem key={index}>
              <ListItemIcon>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    backgroundColor: "green",
                    mt: "4px",
                  }}
                />
              </ListItemIcon>
              <ListItemText
                primary={up.product.name}
                secondary={`Adhésion le ${new Date(up.assignedAt).toLocaleDateString()}`}
              />
            </ListItem>
          ))}
        </List>
      ) : (
        <Typography variant="body1">
          Vous n'êtes actuellement affilié à aucun produit.
        </Typography>
      )}
    </Box>
  );
};

export default ClientHomePage;
