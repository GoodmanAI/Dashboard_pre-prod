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
  FormControlLabel,
  FormControl,
  InputLabel,
  Radio,
  RadioGroup,
  Select,
  MenuItem,
  Switch,
} from "@mui/material";
import {
  IconUserPlus,
  IconArrowLeft,
  IconMail,
  IconLock,
  IconId,
  IconPackage,
  IconUserShield,
  IconBuildingCommunity,
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
  const [isSecretary, setIsSecretary] = useState(false);
  const [talkProductId, setTalkProductId] = useState<number | null>(null);

  // Chantier 2026-08-05 : rattachement multi-centres expose dans l'UI
  // 3 modes : autonome (defaut) / manager (ADMIN_USER) / rattache (USER + managerId)
  const [multiCentreMode, setMultiCentreMode] = useState<"autonome" | "manager" | "rattache">("autonome");
  const [selectedParentId, setSelectedParentId] = useState<number | "">("");
  const [availableParents, setAvailableParents] = useState<Array<{ id: number; name: string | null; email: string }>>([]);

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

  // Chantier 2026-08-05 : fetch liste des CLIENT existants (potentiels parents)
  // pour peupler le dropdown du mode "rattache". Utilise /api/admin/users
  // (chantier 3) qui est SUPER_ADMIN only, filtre role=CLIENT.
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/admin/users?role=CLIENT");
        if (!res.ok) return;
        const data = await res.json();
        // Ne garder que les compte "principal" (permissions=null) qui peuvent
        // etre parents. On exclut les sous-comptes (permissions custom set).
        const parents = (data.users ?? []).filter(
          (u: any) => u.permissions == null && u.managerId == null
        );
        setAvailableParents(parents);
      } catch (err) {
        console.error("Error fetching potential parents:", err);
      }
    };
    run();
  }, []);

  const handleOpenDialog = (e: React.FormEvent) => {
    e.preventDefault();
    // Chantier 2026-08-05 : validation front pour le mode "rattache"
    if (multiCentreMode === "rattache" && typeof selectedParentId !== "number") {
      setErrorMessage("Selectionne un compte parent pour un compte rattache.");
      return;
    }
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

    // Chantier 2026-08-05 : rattachement multi-centres selon le mode choisi
    const centreRole =
      multiCentreMode === "manager"
        ? "ADMIN_USER"
        : multiCentreMode === "rattache"
        ? "USER"
        : null;
    const managerId =
      multiCentreMode === "rattache" && typeof selectedParentId === "number"
        ? selectedParentId
        : null;

    try {
      const response = await fetch("/api/admin/create-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name,
          products,
          isSecretary,
          centreRole,
          managerId,
        }),
      });
      const data = await response.json();

      if (response.ok) {
        setSuccessMessage("Client créé avec succès.");
        setEmail("");
        setPassword("");
        setName("");
        setIsSecretary(false);
        setMultiCentreMode("autonome");
        setSelectedParentId("");
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

                {/* --- Type de compte --- */}
                <Typography
                  variant="overline"
                  sx={{ color: "#2a6f64", fontWeight: 700, letterSpacing: 1 }}
                >
                  Type de compte
                </Typography>
                <Divider sx={{ mb: 2, mt: 0.5 }} />

                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    p: 2,
                    bgcolor: isSecretary
                      ? "rgba(72,200,175,0.08)"
                      : "rgba(0,0,0,0.02)",
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
                      bgcolor: isSecretary
                        ? "rgba(72,200,175,0.2)"
                        : "rgba(0,0,0,0.06)",
                      color: isSecretary ? "#2a6f64" : "text.secondary",
                      flexShrink: 0,
                    }}
                  >
                    <IconUserShield size={18} />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={600}>
                      Compte secrétaire
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Lecture seule sur la configuration. Peut cocher les
                      appels comme traités sur la page /appels.
                    </Typography>
                  </Box>
                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={
                      <Switch
                        checked={isSecretary}
                        onChange={(e) => setIsSecretary(e.target.checked)}
                        disabled={loading}
                        sx={{
                          "& .MuiSwitch-switchBase.Mui-checked": {
                            color: "#48C8AF",
                          },
                          "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track":
                            {
                              backgroundColor: "#48C8AF",
                            },
                        }}
                      />
                    }
                    label=""
                  />
                </Box>

                {/* --- Rattachement multi-centres (chantier 2026-08-05) --- */}
                <Typography
                  variant="overline"
                  sx={{ color: "#2a6f64", fontWeight: 700, letterSpacing: 1 }}
                >
                  Rattachement multi-centres
                </Typography>
                <Divider sx={{ mb: 2, mt: 0.5 }} />

                <Box sx={{ mb: 3 }}>
                  <FormControl>
                    <RadioGroup
                      value={multiCentreMode}
                      onChange={(_, v) => setMultiCentreMode(v as any)}
                    >
                      <FormControlLabel
                        value="autonome"
                        control={<Radio sx={{ color: "#48C8AF", "&.Mui-checked": { color: "#48C8AF" } }} />}
                        label={
                          <Box>
                            <Typography variant="body2" fontWeight={600}>Compte autonome</Typography>
                            <Typography variant="caption" color="text.secondary">
                              Centre independant, sans lien avec d&apos;autres centres (defaut)
                            </Typography>
                          </Box>
                        }
                        sx={{ alignItems: "flex-start", mb: 1 }}
                      />
                      <FormControlLabel
                        value="manager"
                        control={<Radio sx={{ color: "#48C8AF", "&.Mui-checked": { color: "#48C8AF" } }} />}
                        label={
                          <Box>
                            <Typography variant="body2" fontWeight={600}>Compte parent d&apos;un groupement multi-sites</Typography>
                            <Typography variant="caption" color="text.secondary">
                              Ce compte gerera d&apos;autres centres (ex: Quimper pour RIM29SUD).
                              Le selecteur de centre du header affichera les centres rattaches.
                            </Typography>
                          </Box>
                        }
                        sx={{ alignItems: "flex-start", mb: 1 }}
                      />
                      <FormControlLabel
                        value="rattache"
                        control={<Radio sx={{ color: "#48C8AF", "&.Mui-checked": { color: "#48C8AF" } }} />}
                        label={
                          <Box>
                            <Typography variant="body2" fontWeight={600}>Compte rattache a un centre parent</Typography>
                            <Typography variant="caption" color="text.secondary">
                              Ce compte fera partie d&apos;un groupement (ex: Fouesnand rattache a Quimper).
                            </Typography>
                          </Box>
                        }
                        sx={{ alignItems: "flex-start", mb: 1 }}
                      />
                    </RadioGroup>
                  </FormControl>

                  {/* Dropdown compte parent (visible uniquement mode "rattache") */}
                  {multiCentreMode === "rattache" && (
                    <Box sx={{ mt: 2, pl: 4 }}>
                      <FieldLabel icon={<IconBuildingCommunity size={16} />} text="Compte parent" />
                      <FormControl fullWidth size="small">
                        <InputLabel id="parent-select-label">Choisir un centre parent</InputLabel>
                        <Select
                          labelId="parent-select-label"
                          label="Choisir un centre parent"
                          value={selectedParentId}
                          onChange={(e) => setSelectedParentId(Number(e.target.value) as any)}
                          disabled={loading || availableParents.length === 0}
                        >
                          {availableParents.length === 0 && (
                            <MenuItem value="" disabled>
                              Aucun compte parent disponible
                            </MenuItem>
                          )}
                          {availableParents.map((p) => (
                            <MenuItem key={p.id} value={p.id}>
                              {p.name ?? p.email}
                              <Typography
                                component="span"
                                sx={{ color: "text.secondary", ml: 1, fontSize: 12 }}
                              >
                                (id {p.id})
                              </Typography>
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      {availableParents.length === 0 && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                          Aucun compte CLIENT principal disponible comme parent.
                          Cree d&apos;abord un compte en mode &laquo; autonome &raquo; ou &laquo; parent multi-sites &raquo;.
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>

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
                    Type de compte
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip
                      size="small"
                      label={isSecretary ? "Secrétaire" : "Client standard"}
                      sx={{
                        bgcolor: isSecretary
                          ? "rgba(72,200,175,0.15)"
                          : "rgba(0,0,0,0.06)",
                        color: isSecretary ? "#2a6f64" : "text.secondary",
                        fontWeight: 600,
                      }}
                    />
                  </Box>
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
                  Type
                </Typography>
                <Chip
                  size="small"
                  label={isSecretary ? "Secrétaire (lecture seule)" : "Client standard"}
                  sx={{
                    bgcolor: isSecretary
                      ? "rgba(72,200,175,0.15)"
                      : "rgba(0,0,0,0.06)",
                    color: isSecretary ? "#2a6f64" : "text.secondary",
                    fontWeight: 600,
                  }}
                />
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
