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

/**
 * Types de données échangées avec l’API / structure locale.
 */
interface Product {
  id: number;
  name: string;
  description: string;
  assignedAt?: string;
  removedAt?: string;
}

/**
 * Page d’accueil Client.
 * - Récupère les produits de l’utilisateur courant directement depuis l’API dédiée.
 */
const ClientHomePage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [userProducts, setUserProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Charger les produits de l'utilisateur
  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        // On utilise l'id de l'utilisateur de la session
        const userId = (session.user as any).id;
        const res = await fetch(`/api/users/${userId}/products`);
        if (!res.ok) throw new Error("Erreur lors de la récupération des produits.");
        const productsData = await res.json();
        if (!cancelled) setUserProducts(productsData);
      } catch (error) {
        console.error("Error fetching user products:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, session]);

  // Redirection si non authentifié
  useEffect(() => {
    if (status === "unauthenticated") router.push("/authentication/signin");
  }, [status, router]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
        <CircularProgress sx={{ "& .MuiCircularProgress-svg": { color: "#48C8AF" } }} />
      </Box>
    );
  }

  if (!userProducts.length) {
    return <Typography>Aucun produit trouvé.</Typography>;
  }

  // Tri stable par id
  const sortedProducts = [...userProducts].sort((a, b) => a.id - b.id).filter((el) => {return el.name != "LyraeExplain"});

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
    if (name.toLowerCase().includes("explain")) return "/client/services/explain";
    if (name.toLowerCase().includes("talk")) return "/client/services/talk";
    return "https://neuracorp.ai";
  };

  return (
    <Box sx={{ backgroundColor: "#F8F8F8", minHeight: "100vh", p: 4 }}>
      <Box sx={{ textAlign: "left", mb: 4 }}>
        <Typography variant="h1" sx={{ mb: 1, fontWeight: 500 }}>
          Bienvenue,{" "}
          <Box component="span" sx={{ fontWeight: 1000 }}>
            {session?.user?.name ?? ""}
          </Box>{" "}
          !
        </Typography>
        <Typography variant="subtitle1">
          Accédez à vos services et produits via le menu de gauche.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {sortedProducts.map((product) => {
          const isActive = !product.removedAt;
          const statusText = isActive ? "On" : "Off";
          const borderColor = isActive ? "#48C8AF" : "#A0AEC0";
          const assignedDate = product.assignedAt
            ? new Date(product.assignedAt).toLocaleDateString()
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
                <Typography sx={{ fontFamily: "Inter", fontWeight: 400, fontSize: "16px", color: "#34495E", mb: 1 }}>
                  {renderProductName(product.name)}
                </Typography>

                <Box sx={{ display: "flex", alignItems: "center", width: "100%", justifyContent: "space-between", mb: 1 }}>
                  <Box sx={{ border: "1px solid #CBD5E1", borderRadius: "4px", p: "6px 20px", display: "flex", alignItems: "center" }}>
                    <Typography sx={{ fontSize: "10px", fontWeight: 500, color: "#34495E" }}>Statut:</Typography>
                    <Box sx={{
                      ml: 1,
                      width: "24px",
                      height: "20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "9999px",
                      backgroundColor: isActive ? "#22C55E" : "#CBD5E1",
                    }}>
                      <Typography sx={{ fontSize: "10px", fontWeight: 500, color: isActive ? "#FFFFFF" : "#34495E" }}>
                        {statusText}
                      </Typography>
                    </Box>
                  </Box>
                  {isActive && (
                    <Box sx={{ textAlign: "right" }}>
                      <Typography sx={{ fontSize: "10px", fontWeight: 400, color: "#34495E" }}>Adhésion le</Typography>
                      <Typography sx={{ fontSize: "10px", fontWeight: 700, color: "#34495E", mt: -1 }}>
                        {assignedDate}
                      </Typography>
                    </Box>
                  )}
                </Box>

                <Box sx={{ width: "190px", height: "150px", display: "flex", flexDirection: "column", gap: "16px", overflow: "hidden" }}>
                  <Typography sx={{ fontFamily: "Inter", fontWeight: 400, fontSize: "11px", lineHeight: "13px", textAlign: "justify", color: "#34495E", overflow: "hidden" }}>
                    {product.description}
                  </Typography>
                </Box>

                <Box sx={{ flexGrow: 1 }} />
                <Button
                  variant="contained"
                  sx={{
                    backgroundColor: isActive ? "#48C8AF" : "#555555",
                    borderRadius: "99px",
                    color: "#FFFFFF",
                    fontWeight: 500,
                    fontSize: "12px",
                    textTransform: "none",
                    width: "100%",
                    "&:hover": { backgroundColor: isActive ? "#3EB49C" : "#444444" },
                  }}
                  onClick={() => {
                    const route = getProductRoute(product.name);
                    if (route.startsWith("http")) window.open(route + `/${product.id}`, "_blank");
                    else router.push(route + `/${product.id}`);
                  }}
                >
                  {isActive ? "Accéder à ma solution" : "En savoir plus"}
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
