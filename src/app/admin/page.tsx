"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Box,
  Grid,
  Card,
  Typography,
  useTheme,
  CircularProgress,
} from "@mui/material";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SalesOverview from "@/app/(DashboardLayout)/components/dashboard/SalesOverview";

/**
 * Tableau de bord Administrateur
 * - Contrôle l’accès (redirection si non ADMIN).
 * - Présente un aperçu (SalesOverview) et des tuiles d’accès rapide aux modules admin.
 * - Chaque tuile redirige vers la section de gestion correspondante.
 */
const AdminPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const theme = useTheme();

  /* -----------------------------------------------------------
   * Sécurité / Navigation :
   * - Si non authentifié → page de connexion
   * - Si authentifié mais non ADMIN → redirection vers l’espace client
   * ----------------------------------------------------------- */
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    } else if (session && session.user.role !== "ADMIN") {
      router.push("/client");
    }
  }, [session, status, router]);

  /* -----------------------------------------------------------
   * État de chargement : affiche un indicateur pendant la vérification
   * de session pour éviter les effets de flash.
   * ----------------------------------------------------------- */
  if (status === "loading") {
    return (
      <Box sx={{ display: "grid", placeItems: "center", minHeight: "50vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  /* -----------------------------------------------------------
   * Actions de navigation vers les différents modules d’administration
   * ----------------------------------------------------------- */
  const handleCreateClient = () => router.push("/admin/create-client");
  const handleManageClients = () => router.push("/admin/manage-clients");
  const handleCreateProduct = () => router.push("/admin/create-product");
  const handleViewReports = () => router.push("/admin/reports");

  /* -----------------------------------------------------------
   * Rendu principal : aperçu + grille de tuiles d’accès rapide
   * ----------------------------------------------------------- */
  return (
    <PageContainer title="Admin Dashboard" description="Admin Home Page">
      <Box>
        <Grid container spacing={3}>
          <Grid item xs={12} lg={8}>
            <SalesOverview />
          </Grid>

          <Grid container item xs={12} spacing={3}>
            <Grid item xs={12} sm={6}>
              <Card
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 150,
                  backgroundColor: theme.palette.primary.main,
                  color: "#fff",
                  cursor: "pointer",
                  transition: "0.3s",
                  "&:hover": { backgroundColor: theme.palette.primary.dark },
                }}
                onClick={handleCreateClient}
              >
                <Typography variant="h6" fontWeight="bold">
                  Créer un nouveau client
                </Typography>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Card
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 150,
                  backgroundColor: theme.palette.secondary.main,
                  color: "#fff",
                  cursor: "pointer",
                  transition: "0.3s",
                  "&:hover": { backgroundColor: theme.palette.secondary.dark },
                }}
                onClick={handleManageClients}
              >
                <Typography variant="h6" fontWeight="bold">
                  Gérer les clients
                </Typography>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Card
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 150,
                  backgroundColor: "#795FED",
                  color: "#fff",
                  cursor: "pointer",
                  transition: "0.3s",
                  "&:hover": { backgroundColor: "#6B5FED" },
                }}
                onClick={handleCreateProduct}
              >
                <Typography variant="h6" fontWeight="bold">
                  Créer un nouveau produit
                </Typography>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Card
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 150,
                  backgroundColor: "#B761D4",
                  color: "#fff",
                  cursor: "pointer",
                  transition: "0.3s",
                  "&:hover": { backgroundColor: "#9E61D4" },
                }}
                onClick={handleViewReports}
              >
                <Typography variant="h6" fontWeight="bold">
                  Voir les rapports
                </Typography>
              </Card>
            </Grid>
          </Grid>
        </Grid>
      </Box>
    </PageContainer>
  );
};

export default AdminPage;
