"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Box, Grid, Button, Card, Typography, useTheme } from "@mui/material";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SalesOverview from "@/app/(DashboardLayout)/components/dashboard/SalesOverview";
import YearlyBreakup from "@/app/(DashboardLayout)/components/dashboard/YearlyBreakup";
import MonthlyEarnings from "@/app/(DashboardLayout)/components/dashboard/MonthlyEarnings";

const AdminPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const theme = useTheme();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    } else if (session && session.user.role !== "ADMIN") {
      router.push("/client");
    }
  }, [session, status, router]);

  if (status === "loading") {
    return <p>Loading...</p>;
  }

  // Handlers for module navigation
  const handleCreateClient = () => router.push("/admin/create-client");
  const handleManageClients = () => router.push("/admin/manage-clients");
  const handleCreateProduct = () => router.push("/admin/create-product");
  const handleViewReports = () => router.push("/admin/reports");
  
  return (
    <PageContainer title="Admin Dashboard" description="Admin Home Page">
      <Box>
        <Grid container spacing={3}>
          {/* Existing sections */}
          <Grid item xs={12} lg={8}>
            <SalesOverview />
          </Grid>
          <Grid item xs={12} lg={4}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <YearlyBreakup />
              </Grid>
              <Grid item xs={12}>
                <MonthlyEarnings />
              </Grid>
            </Grid>
          </Grid>

          {/* New modules: 2x2 grid */}
          <Grid container item xs={12} spacing={3}>
            <Grid item xs={12} sm={6}>
              <Card
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "150px",
                  backgroundColor: theme.palette.primary.main,
                  color: "#fff",
                  cursor: "pointer",
                  transition: "0.3s",
                  "&:hover": {
                    backgroundColor: theme.palette.primary.dark,
                  },
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
                  height: "150px",
                  backgroundColor: theme.palette.secondary.main,
                  color: "#fff",
                  cursor: "pointer",
                  transition: "0.3s",
                  "&:hover": {
                    backgroundColor: theme.palette.secondary.dark,
                  },
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
                  height: "150px",
                  backgroundColor: "#795FED",
                  color: "#fff",
                  cursor: "pointer",
                  transition: "0.3s",
                  "&:hover": {
                    backgroundColor: "#6B5FED",
                  },
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
                  height: "150px",
                  backgroundColor: "#B761D4",
                  color: '#fff',
                  cursor: "pointer",
                  transition: "0.3s",
                  "&:hover": {
                    backgroundColor: "#9E61D4",
                  },
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
