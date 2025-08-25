"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Box,
  Typography,
  Grid,
  Paper,
  Button,
  CircularProgress,
} from "@mui/material";
import { useCentre } from "@/app/context/CentreContext"; // 👈

interface ClientData {
  id: number;
  name: string;
  email: string;
  userProducts: UserProduct[];
}

interface Product {
  id: number;
  name: string;
  description: string;
}

interface UserProduct {
  product: {
    id: number;
    name: string;
    description: string;
  };
  assignedAt: string;
}

const ClientHomePage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { selectedUserId, selectedCentre } = useCentre(); // 👈

  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch du client courant (ou du centre sélectionné)
  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);

        // 👇 centre-aware
        const clientUrl = selectedUserId
          ? `/api/client?asUserId=${selectedUserId}`
          : `/api/client`;

        const resClient = await fetch(clientUrl);
        if (!resClient.ok) throw new Error("Erreur lors de la récupération des données client.");
        const client = await resClient.json();
        if (cancelled) return;
        setClientData(client);

        // Charger le catalogue public une seule fois (si pas déjà chargé)
        if (!allProducts.length) {
          const resProducts = await fetch("/api/public/products");
          if (resProducts.ok) {
            const productsData = await resProducts.json();
            const productsArray = productsData.products || [];
            if (!cancelled) {
              setAllProducts(
                productsArray.length
                  ? productsArray
                  // fallback: si l’API publique n’a rien, on utilise les produits du client
                  : (client.userProducts || []).map((up: UserProduct) => up.product)
              );
            }
          } else {
            // fallback si l’API publique est indisponible
            if (!cancelled) {
              setAllProducts((client.userProducts || []).map((up: UserProduct) => up.product));
            }
          }
        }
      } catch (error) {
        console.error("Error fetching data", error);
        // fallback minimal pour ne pas bloquer l’UI
        if (clientData?.userProducts?.length && !allProducts.length) {
          setAllProducts(clientData.userProducts.map((up) => up.product));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, selectedUserId]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    }
  }, [status, router]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
        <CircularProgress
          sx={{
            "& .MuiCircularProgress-svg": { color: "#48C8AF" },
          }}
        />
      </Box>
    );
  }

  if (!allProducts.length) {
    return <Typography>Aucun produit trouvé.</Typography>;
  }

  const sortedProducts = [...allProducts].sort((a, b) => a.id - b.id);

  // Map d’affiliation pour le client/centre affiché
  const affiliatedMap = new Map<number, UserProduct>();
  clientData?.userProducts.forEach((up) => {
    affiliatedMap.set(up.product.id, up);
  });

  const renderProductName = (name: string) => {
    if (name.toLowerCase().startsWith("lyrae")) {
      const remainder = name.slice(5);
      return (
        <>
          <span style={{ fontWeight: 900 }}>LYRAE</span>
          {remainder}
        </>
      );
    }
    return name;
  };

  const getProductRoute = (name: string) => {
    if (name.toLowerCase().includes("explain")) {
      return "/client/services/explain";
    } else if (name.toLowerCase().includes("talk")) {
      return "/client/services/talk";
    } else {
      return "https://neuracorp.ai";
    }
  };

  return (
    <Box sx={{ backgroundColor: "#F8F8F8", minHeight: "100vh", p: 4 }}>
      {/* Titre */}
      <Box sx={{ textAlign: "left", mb: 4 }}>
        <Typography variant="h1" sx={{ mb: 1, fontWeight: 500 }}>
          Bienvenue,{" "}
          <Box component="span" sx={{ fontWeight: 1000 }}>
            {clientData?.name ?? ""}
          </Box>{" "}
          !
        </Typography>
        <Typography variant="subtitle1">
          {selectedCentre
            ? "Vous consultez le tableau de bord du centre sélectionné."
            : "Bienvenue sur votre dashboard. Accédez à vos services et produits via le menu de gauche."}
        </Typography>
      </Box>

      {/* Grid des cards produits */}
      <Grid container spacing={3}>
        {sortedProducts.map((product) => {
          const affiliated = affiliatedMap.get(product.id);
          const statusText = affiliated ? "On" : "Off";
          const borderColor = affiliated ? "#48C8AF" : "#A0AEC0";
          const assignedDate = affiliated
            ? new Date(affiliated.assignedAt).toLocaleDateString()
            : "";

          return (
            <Grid item xs={12} sm={6} md={3} key={product.id}>
              <Paper
                sx={{
                  width: "220px",
                  height: "220px",
                  p: "10px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "10px",
                  backgroundColor: "#FFFFFF",
                  border: `2px solid ${borderColor}`,
                  borderRadius: "16px",
                  m: "auto",
                }}
              >
                {/* Titre du produit */}
                <Typography
                  sx={{
                    fontFamily: "Inter",
                    fontWeight: 400,
                    fontSize: "16px",
                    color: "#34495E",
                    mb: 1,
                  }}
                >
                  {renderProductName(product.name)}
                </Typography>

                {/* Statut + date d’adhésion */}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    justifyContent: "space-between",
                    mb: 1,
                  }}
                >
                  <Box
                    sx={{
                      border: "1px solid #CBD5E1",
                      borderRadius: "4px",
                      p: "6px 20px",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <Typography sx={{ fontSize: "10px", fontWeight: 500, color: "#34495E" }}>
                      Statut:
                    </Typography>
                    <Box
                      sx={{
                        ml: 1,
                        width: "24px",
                        height: "20px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "9999px",
                        backgroundColor: affiliated ? "#22C55E" : "#CBD5E1",
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: "10px",
                          fontWeight: 500,
                          color: affiliated ? "#FFFFFF" : "#34495E",
                        }}
                      >
                        {statusText}
                      </Typography>
                    </Box>
                  </Box>
                  {affiliated && (
                    <Box sx={{ textAlign: "right" }}>
                      <Typography sx={{ fontSize: "10px", fontWeight: 400, color: "#34495E" }}>
                        Adhésion le
                      </Typography>
                      <Typography sx={{ fontSize: "10px", fontWeight: 700, color: "#34495E", mt: -1 }}>
                        {assignedDate}
                      </Typography>
                    </Box>
                  )}
                </Box>

                {/* Description */}
                <Box
                  sx={{
                    width: "190px",
                    height: "150px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                    overflow: "hidden",
                  }}
                >
                  <Typography
                    sx={{
                      fontFamily: "Inter",
                      fontWeight: 400,
                      fontSize: "11px",
                      lineHeight: "13px",
                      textAlign: "justify",
                      color: "#34495E",
                      overflow: "hidden",
                    }}
                  >
                    {product.description}
                  </Typography>
                </Box>

                {/* CTA */}
                <Box sx={{ flexGrow: 1 }} />
                <Button
                  variant="contained"
                  sx={{
                    backgroundColor: affiliated ? "#48C8AF" : "#555555",
                    borderRadius: "99px",
                    color: "#FFFFFF",
                    fontWeight: 500,
                    fontSize: "12px",
                    textTransform: "none",
                    width: "100%",
                    "&:hover": {
                      backgroundColor: affiliated ? "#3EB49C" : "#444444",
                    },
                  }}
                  onClick={() => {
                    const route = getProductRoute(product.name);
                    if (route.startsWith("http")) {
                      window.open(route, "_blank");
                    } else {
                      router.push(route); // Les pages cibles liront selectedUserId via le contexte
                    }
                  }}
                >
                  {affiliated ? "Accéder à ma solution" : "En savoir plus"}
                </Button>
              </Paper>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
};

export default ClientHomePage;
