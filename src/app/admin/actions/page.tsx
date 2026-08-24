"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Box,
  Grid,
  Card,
  Typography,
  CircularProgress,
} from "@mui/material";
import {
  IconUserPlus,
  IconUsers,
  IconReport,
  IconChevronRight,
  IconShieldLock,
} from "@tabler/icons-react";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";

/**
 * Card d'action cliquable : icône teal + titre + description + chevron.
 * Effet hover cohérent avec les cards centres de la page overview.
 */
function ActionCard({
  title,
  description,
  icon,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Card
      elevation={1}
      onClick={onClick}
      sx={{
        p: 3,
        height: "100%",
        display: "flex",
        alignItems: "center",
        gap: 2,
        cursor: "pointer",
        transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease",
        border: "1px solid transparent",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: "0 8px 24px rgba(var(--accent-rgb), 0.15)",
          borderColor: "rgba(var(--accent-rgb), 0.4)",
        },
      }}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: "12px",
          display: "grid",
          placeItems: "center",
          bgcolor: "rgba(var(--accent-rgb), 0.12)",
          color: "var(--accent-deep)",
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" fontWeight={700} noWrap>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      </Box>
      <Box sx={{ color: "#9ca3af", flexShrink: 0 }}>
        <IconChevronRight size={20} />
      </Box>
    </Card>
  );
}

/**
 * Admin Actions
 * Points d'entrée visuels vers les modules de gestion admin, groupés par catégorie.
 */
const AdminActionsPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    } else if (session && session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
      router.push("/client");
    }
  }, [session, status, router]);

  if (status === "loading") {
    return (
      <Box sx={{ display: "grid", placeItems: "center", minHeight: "50vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";

  return (
    <PageContainer title="Admin Actions" description="Accès rapide aux modules">
      <Box>
        {/* === Gestion comptes (SUPER_ADMIN uniquement) === */}
        {isSuperAdmin && (
          <>
            <SectionHeader
              title="Gestion des comptes"
              subtitle="Créer / gérer admins, clients et sous-comptes"
            />
            <Grid container spacing={3} sx={{ mb: 5 }}>
              <Grid item xs={12} md={6}>
                <ActionCard
                  title="Comptes & permissions"
                  description="Admins, clients, sous-comptes avec permissions granulaires"
                  icon={<IconShieldLock size={22} />}
                  onClick={() => router.push("/admin/users")}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <ActionCard
                  title="Créer un client"
                  description="Provisionner un nouveau compte client (LyraeTalk)"
                  icon={<IconUserPlus size={22} />}
                  onClick={() => router.push("/admin/create-client")}
                />
              </Grid>
            </Grid>
          </>
        )}

        {/* === Gestion clients (ADMIN + SUPER_ADMIN) === */}
        <SectionHeader
          title="Gestion clients"
          subtitle="Actions courantes sur les comptes clients existants"
        />
        <Grid container spacing={3} sx={{ mb: 5 }}>
          <Grid item xs={12} md={6}>
            <ActionCard
              title="Gérer les clients"
              description="Modifier produits, réinitialiser mots de passe"
              icon={<IconUsers size={22} />}
              onClick={() => router.push("/admin/manage-clients")}
            />
          </Grid>
        </Grid>

        {/* === Consultation === */}
        <SectionHeader
          title="Consultation"
          subtitle="Rapports et analyse d'activité"
        />
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <ActionCard
              title="Voir les rapports"
              description="Tableau clients et export CSV"
              icon={<IconReport size={22} />}
              onClick={() => router.push("/admin/reports")}
            />
          </Grid>
        </Grid>
      </Box>
    </PageContainer>
  );
};

export default AdminActionsPage;
