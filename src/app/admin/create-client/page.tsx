"use client";

import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Stack,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Alert,
  Card,
  Grid,
  Divider,
  Chip,
} from "@mui/material";
import {
  IconUserPlus,
  IconArrowLeft,
  IconMail,
  IconLock,
  IconId,
  IconPackage,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import CustomTextField from "@/app/(DashboardLayout)/components/forms/theme-elements/CustomTextField";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";

/**
 * Création d'un client (admin).
 * LyraeTalk est automatiquement affecté — c'est le seul produit actif
 * dans le dashboard (LyraeExplain est archivé).
 */
export default function CreateClientPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [talkProductId, setTalkProductId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ field?: string; message: string }[]>([]);
  const [openDialog, setOpenDialog] = useState(false);

  // Résolution de l'id du produit LyraeTalk (auto-affecté à chaque création)
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/products");
        const data = await res.json();
        if (res.ok && Array.isArray(data)) {
          const talk = data.find((p: any) => p?.name === "LyraeTalk");
          setTalkProductId(talk?.id ?? null);
        }
      } catch (err) {
        console.error("Error fetching products:", err);
      }
    };
    run();
  }, []);

  const handleOpenDialog = (e: React.FormEvent) => {
    e.preventDefault();
    setOpenDialog(true);
  };
  const handleCloseDialog = () => setOpenDialog(false);

  const handleCreateClient = async () => {
    setLoading(true);
    setErrors([]);
    setSuccessMessage(null);
    setErrorMessage(null);
    setOpenDialog(false);

    // Si le catalogue renvoie bien LyraeTalk, on l'inclut. Sinon on laisse vide
    // et on fait confiance à l'API pour la suite.
    const products = talkProductId
      ? [{ productId: talkProductId, assignedAt: new Date().toISOString() }]
      : [];

    try {
      const response = await fetch("/api/admin/create-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, products }),
      });
      const data = await response.json();

      if (response.ok) {
        setSuccessMessage("Client créé avec succès.");
        setEmail("");
        setPassword("");
        setName("");
      } else if (data.error && data.details) {
        setErrors(data.details);
        setErrorMessage(data.error);
      } else {
        setErrors([]);
        setErrorMessage(data.error || "Une erreur s'est produite.");
      }
    } catch {
      setErrorMessage("Une erreur inattendue s'est produite.");
    } finally {
      setLoading(false);
    }
  };

  const fieldError = (field: string) => errors.find((e) => e.field === field)?.message;

  const FieldLabel = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.75 }}>
      <Box sx={{ color: "#2a6f64", display: "flex" }}>{icon}</Box>
      <Typography variant="body2" fontWeight={600}>
        {text}
      </Typography>
    </Box>
  );

  return (
    <PageContainer title="Créer un client" description="Ajouter un nouveau compte client">
      <Box>
        <Button
          variant="text"
          size="small"
          startIcon={<IconArrowLeft size={16} />}
          onClick={() => router.push("/admin/actions")}
          sx={{
            color: "text.secondary",
            mb: 2,
            ml: -1,
            px: 1,
            textTransform: "none",
            fontWeight: 500,
            "&:hover": { bgcolor: "rgba(72,200,175,0.08)", color: "#2a6f64" },
          }}
        >
          Retour aux actions
        </Button>

        <SectionHeader
          title="Créer un client"
          subtitle="Nouveau compte — LyraeTalk affecté automatiquement"
        />

        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Card sx={{ p: 4 }} elevation={1}>
              <form onSubmit={handleOpenDialog}>
                {/* --- Identité --- */}
                <Typography
                  variant="overline"
                  sx={{ color: "#2a6f64", fontWeight: 700, letterSpacing: 1 }}
                >
                  Identité
                </Typography>
                <Divider sx={{ mb: 2, mt: 0.5 }} />

                <Stack spacing={2.5} sx={{ mb: 3 }}>
                  <Box>
                    <FieldLabel icon={<IconId size={16} />} text="Nom" />
                    <CustomTextField
                      id="name"
                      type="text"
                      variant="outlined"
                      fullWidth
                      value={name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                      disabled={loading}
                      error={!!fieldError("name")}
                      helperText={fieldError("name") || ""}
                    />
                  </Box>

                  <Box>
                    <FieldLabel icon={<IconMail size={16} />} text="Email" />
                    <CustomTextField
                      id="email"
                      type="text"
                      variant="outlined"
                      fullWidth
                      value={email}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                      disabled={loading}
                      error={!!fieldError("email")}
                      helperText={fieldError("email") || ""}
                    />
                  </Box>

                  <Box>
                    <FieldLabel icon={<IconLock size={16} />} text="Mot de passe" />
                    <CustomTextField
                      id="password"
                      type="password"
                      variant="outlined"
                      fullWidth
                      value={password}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                      disabled={loading}
                      error={!!fieldError("password")}
                      helperText={fieldError("password") || ""}
                    />
                  </Box>
                </Stack>

                {/* --- Produit affecté (info) --- */}
                <Typography
                  variant="overline"
                  sx={{ color: "#2a6f64", fontWeight: 700, letterSpacing: 1 }}
                >
                  Produit
                </Typography>
                <Divider sx={{ mb: 2, mt: 0.5 }} />

                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    p: 2,
                    bgcolor: "rgba(72,200,175,0.08)",
                    borderRadius: 2,
                    mb: 3,
                  }}
                >
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: "10px",
                      display: "grid",
                      placeItems: "center",
                      bgcolor: "rgba(72,200,175,0.2)",
                      color: "#2a6f64",
                      flexShrink: 0,
                    }}
                  >
                    <IconPackage size={18} />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={600}>
                      LyraeTalk
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Affecté automatiquement à la création du client
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    label="Auto"
                    sx={{
                      bgcolor: "#48C8AF",
                      color: "#fff",
                      fontWeight: 600,
                    }}
                  />
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 1.5,
                    mt: 1,
                  }}
                >
                  <Button
                    variant="text"
                    onClick={() => router.push("/admin/actions")}
                    disabled={loading}
                  >
                    Annuler
                  </Button>
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    startIcon={<IconUserPlus size={18} />}
                    disabled={loading}
                    sx={{
                      bgcolor: "#48C8AF",
                      fontWeight: 600,
                      "&:hover": { bgcolor: "#3BA992" },
                    }}
                  >
                    {loading ? "Création…" : "Créer le client"}
                  </Button>
                </Box>
              </form>
            </Card>

            {successMessage && (
              <Alert severity="success" sx={{ mt: 2 }}>
                {successMessage}
              </Alert>
            )}
            {errorMessage && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {errorMessage}
              </Alert>
            )}
          </Grid>

          {/* Colonne latérale : récapitulatif live */}
          <Grid item xs={12} md={4}>
            <Card sx={{ p: 3 }} elevation={1}>
              <Typography
                variant="overline"
                sx={{ color: "#2a6f64", fontWeight: 700, letterSpacing: 1 }}
              >
                Récapitulatif
              </Typography>
              <Divider sx={{ mb: 2, mt: 0.5 }} />
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Nom
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {name || "—"}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Email
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ wordBreak: "break-all" }}>
                    {email || "—"}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Mot de passe
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {password ? "•".repeat(Math.min(password.length, 12)) : "—"}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Produit
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip
                      size="small"
                      label="LyraeTalk"
                      sx={{
                        bgcolor: "rgba(72,200,175,0.15)",
                        color: "#2a6f64",
                        fontWeight: 600,
                      }}
                    />
                  </Box>
                </Box>
              </Stack>
            </Card>
          </Grid>
        </Grid>

        {/* Modale de confirmation */}
        <Dialog
          open={openDialog}
          onClose={handleCloseDialog}
          PaperProps={{ sx: { borderRadius: 2, minWidth: 420 } }}
        >
          <DialogTitle sx={{ fontWeight: 700 }}>Confirmer la création</DialogTitle>
          <DialogContent dividers>
            <DialogContentText sx={{ mb: 2 }}>
              Vérifie les informations avant de créer le compte.
            </DialogContentText>
            <Stack spacing={1}>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 100 }}>
                  Nom
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {name || "—"}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 100 }}>
                  Email
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {email || "—"}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 100 }}>
                  Produit
                </Typography>
                <Chip
                  size="small"
                  label="LyraeTalk"
                  sx={{
                    bgcolor: "rgba(72,200,175,0.15)",
                    color: "#2a6f64",
                    fontWeight: 600,
                  }}
                />
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={handleCloseDialog} variant="text">
              Annuler
            </Button>
            <Button
              onClick={handleCreateClient}
              variant="contained"
              startIcon={<IconUserPlus size={16} />}
              disabled={loading}
              sx={{
                bgcolor: "#48C8AF",
                fontWeight: 600,
                "&:hover": { bgcolor: "#3BA992" },
              }}
            >
              Confirmer
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </PageContainer>
  );
}
