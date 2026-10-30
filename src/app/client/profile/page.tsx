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
  Grid,
  Card,
  Chip,
  TextField,
  Button,
  Alert,
  IconButton,
  InputAdornment,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  Stack,
} from "@mui/material";
import {
  IconLockCog,
  IconChevronDown,
  IconUser,
  IconMail,
  IconCrown,
  IconBuildingCommunity,
  IconEye,
  IconEyeOff,
} from "@tabler/icons-react";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

interface UserProductLite {
  assignedAt: string;
  product: { id: number; name: string };
}

interface ManagedUser {
  id: number;
  name?: string | null;
  email: string;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  userProducts?: UserProductLite[];
}

interface ClientData {
  id: number;
  name?: string | null;
  email: string;
  role: "ADMIN" | "CLIENT";
  centreRole?: "ADMIN_USER" | "USER" | null;
  managedUsers?: ManagedUser[];
  userProducts: any[];
}

/* -------------------------------------------------------------------------- */
/*                                 Page Profil                                 */
/* -------------------------------------------------------------------------- */

const ProfilePage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/authentication/signin");
  }, [status, router]);

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
    if (status === "authenticated") fetchClientData();
  }, [status]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
        <CircularProgress sx={{ "& .MuiCircularProgress-svg": { color: "var(--accent)" } }} />
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

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Veuillez remplir tous les champs.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Les nouveaux mots de passe ne correspondent pas.");
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await fetch("/api/client/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPasswordError(data.error || "Le mot de passe n'a pas été modifié. Vérifiez le mot de passe actuel et réessayez.");
      } else {
        setPasswordSuccess(data.message || "Mot de passe modifié.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setPasswordError("Le serveur n'a pas répondu. Vérifiez votre connexion et réessayez.");
    } finally {
      setPasswordLoading(false);
    }
  };

  const { name, email, role, centreRole, managedUsers } = clientData;

  /* -------- Widget d'info (label + icône + valeur) ---------- */
  const InfoRow = ({
    icon,
    label,
    value,
    chip,
  }: {
    icon: React.ReactNode;
    label: string;
    value?: string | null;
    chip?: React.ReactNode;
  }) => (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: "10px",
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
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="body2" fontWeight={600} sx={{ wordBreak: "break-all" }}>
            {value || "-"}
          </Typography>
          {chip}
        </Box>
      </Box>
    </Box>
  );

  return (
    <PageContainer title="Mon profil" description="Informations de compte et sécurité">
      <Box>
        <SectionHeader
          title="Mon profil"
          subtitle="Informations personnelles et sécurité"
        />

        {/* ========== Informations de compte ========== */}
        <Card sx={{ p: 3, mb: 3 }} elevation={1}>
          <Typography
            variant="overline"
            sx={{ color: "var(--accent-deep)", fontWeight: 700, letterSpacing: 1 }}
          >
            Informations de compte
          </Typography>
          <Divider sx={{ mb: 2.5, mt: 0.5 }} />

          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <InfoRow icon={<IconUser size={18} />} label="Nom" value={name} />
            </Grid>
            <Grid item xs={12} md={6}>
              <InfoRow icon={<IconMail size={18} />} label="Email" value={email} />
            </Grid>
            <Grid item xs={12} md={6}>
              <InfoRow
                icon={<IconCrown size={18} />}
                label="Rôle global"
                value={role}
              />
            </Grid>
            {role === "CLIENT" && (
              <Grid item xs={12} md={6}>
                <InfoRow
                  icon={<IconBuildingCommunity size={18} />}
                  label="Rôle du centre"
                  value={
                    centreRole === "ADMIN_USER"
                      ? "Directeur de centre"
                      : "Utilisateur"
                  }
                  chip={
                    centreRole === "ADMIN_USER" ? (
                      <Chip
                        size="small"
                        label="Multi-centres"
                        sx={{
                          bgcolor: "rgba(var(--accent-rgb), 0.15)",
                          color: "var(--accent-deep)",
                          fontWeight: 600,
                        }}
                      />
                    ) : null
                  }
                />
              </Grid>
            )}
          </Grid>

          {/* Centres gérés (ADMIN_USER seulement) */}
          {centreRole === "ADMIN_USER" && managedUsers && managedUsers.length > 0 && (
            <>
              <Divider sx={{ my: 3 }} />
              <Typography
                variant="overline"
                sx={{ color: "var(--accent-deep)", fontWeight: 700, letterSpacing: 1 }}
              >
                Centres gérés
              </Typography>
              <Divider sx={{ mb: 2, mt: 0.5 }} />

              <List dense disablePadding>
                {managedUsers.map((u) => {
                  const addressLine = [
                    u.address,
                    [u.postalCode, u.city].filter(Boolean).join(" "),
                  ]
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <ListItem
                      key={u.id}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                        py: 1,
                        borderBottom: "1px solid #f0f0f0",
                        "&:last-child": { borderBottom: "none" },
                      }}
                      disableGutters
                    >
                      <ListItemText
                        primary={
                          <Typography variant="body2" fontWeight={600}>
                            {u.name || u.email}
                          </Typography>
                        }
                        secondary={
                          <Typography variant="caption" color="text.secondary">
                            {addressLine || "-"}
                          </Typography>
                        }
                      />
                      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                        {u.userProducts?.length ? (
                          u.userProducts.map((up: any, idx: number) => (
                            <Chip
                              key={`${u.id}-${up?.product?.id ?? idx}`}
                              label={up?.product?.name ?? "-"}
                              size="small"
                              sx={{
                                bgcolor: "rgba(var(--accent-rgb), 0.15)",
                                color: "var(--accent-deep)",
                                fontWeight: 600,
                              }}
                            />
                          ))
                        ) : (
                          <Chip label="Aucun produit" size="small" variant="outlined" />
                        )}
                      </Box>
                    </ListItem>
                  );
                })}
              </List>
            </>
          )}
        </Card>

        {/* ========== Changer le mot de passe (accordéon) ========== */}
        <Accordion
          disableGutters
          elevation={1}
          sx={{
            borderRadius: 2,
            "&:before": { display: "none" },
            overflow: "hidden",
            mb: 3,
          }}
        >
          <AccordionSummary
            expandIcon={<IconChevronDown size={20} />}
            sx={{
              px: 3,
              py: 1.5,
              "& .MuiAccordionSummary-content": {
                alignItems: "center",
                gap: 1.5,
              },
            }}
          >
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: "10px",
                display: "grid",
                placeItems: "center",
                bgcolor: "rgba(var(--accent-rgb), 0.15)",
                color: "var(--accent-deep)",
              }}
            >
              <IconLockCog size={18} />
            </Box>
            <Box>
              <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
                Changer le mot de passe
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Mettre à jour votre mot de passe d&apos;accès
              </Typography>
            </Box>
          </AccordionSummary>

          <AccordionDetails sx={{ px: 3, pt: 0, pb: 3 }}>
            <Divider sx={{ mb: 3 }} />

            {passwordError && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setPasswordError(null)}>
                {passwordError}
              </Alert>
            )}
            {passwordSuccess && (
              <Alert severity="success" sx={{ mb: 2 }} onClose={() => setPasswordSuccess(null)}>
                {passwordSuccess}
              </Alert>
            )}

            <Stack spacing={2} sx={{ maxWidth: 520 }}>
              <TextField
                label="Mot de passe actuel"
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                fullWidth
                size="small"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowCurrentPassword((v) => !v)}
                        sx={{ color: "#91A3B7" }}
                        aria-label={
                          showCurrentPassword
                            ? "Masquer le mot de passe"
                            : "Afficher le mot de passe"
                        }
                      >
                        {showCurrentPassword ? (
                          <IconEyeOff size={18} />
                        ) : (
                          <IconEye size={18} />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                label="Nouveau mot de passe"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                fullWidth
                size="small"
                helperText="Min. 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowNewPassword((v) => !v)}
                        sx={{ color: "#91A3B7" }}
                        aria-label={
                          showNewPassword
                            ? "Masquer le mot de passe"
                            : "Afficher le mot de passe"
                        }
                      >
                        {showNewPassword ? (
                          <IconEyeOff size={18} />
                        ) : (
                          <IconEye size={18} />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                label="Confirmer le nouveau mot de passe"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                fullWidth
                size="small"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        sx={{ color: "#91A3B7" }}
                        aria-label={
                          showConfirmPassword
                            ? "Masquer le mot de passe"
                            : "Afficher le mot de passe"
                        }
                      >
                        {showConfirmPassword ? (
                          <IconEyeOff size={18} />
                        ) : (
                          <IconEye size={18} />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <Box>
                <Button
                  variant="contained"
                  onClick={handleChangePassword}
                  disabled={passwordLoading}
                  startIcon={<IconLockCog size={18} />}
                  sx={{
                    bgcolor: "var(--accent)",
                    fontWeight: 600,
                    "&:hover": { bgcolor: "var(--accent-press)" },
                  }}
                >
                  {passwordLoading ? (
                    <CircularProgress size={22} sx={{ color: "#fff" }} />
                  ) : (
                    "Modifier le mot de passe"
                  )}
                </Button>
              </Box>
            </Stack>
          </AccordionDetails>
        </Accordion>
      </Box>
    </PageContainer>
  );
};

export default ProfilePage;
