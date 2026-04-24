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
/*                        Plans d'abonnement Talk                              */
/* -------------------------------------------------------------------------- */

type TalkPlan = {
  tier: number;
  name: string;
  volumeLabel: string;
  /** `null` = plan entreprise (sur devis, pas de prix affiché). */
  price: string | null;
};

const TALK_PLANS: TalkPlan[] = [
  { tier: 1, name: "Pack TALK 1", volumeLabel: "< 500 appels / mois", price: "270 € HT" },
  { tier: 2, name: "Pack TALK 2", volumeLabel: "500 – 1 500 appels / mois", price: "650 € HT" },
  { tier: 3, name: "Pack TALK 3", volumeLabel: "1 500 – 3 000 appels / mois", price: "1 240 € HT" },
  { tier: 4, name: "Pack TALK 4", volumeLabel: "3 000 – 5 000 appels / mois", price: "1 950 € HT" },
  { tier: 5, name: "Pack TALK 5", volumeLabel: "5 000 – 7 000 appels / mois", price: "2 680 € HT" },
  { tier: 6, name: "Pack TALK 6", volumeLabel: "7 000 – 10 000 appels / mois", price: "3 740 € HT" },
  { tier: 7, name: "Pack TALK 7", volumeLabel: "10 000+ appels / mois", price: null },
];

/** Retourne le tier Talk correspondant à un nombre d'appels mensuels. */
function tierForCallCount(n: number): number {
  if (n < 500) return 1;
  if (n < 1500) return 2;
  if (n < 3000) return 3;
  if (n < 5000) return 4;
  if (n < 7000) return 5;
  if (n < 10000) return 6;
  return 7;
}

/** Hauteur en px d'une lame selon son tier (effet escalier). */
const MAX_STAIR_HEIGHT = 280;
const MIN_STAIR_HEIGHT = 120;
function stairHeight(tier: number): number {
  const step = (MAX_STAIR_HEIGHT - MIN_STAIR_HEIGHT) / 6;
  return Math.round(MIN_STAIR_HEIGHT + (tier - 1) * step);
}

/**
 * Accordéon horizontal des plans Talk (effet escalier).
 * - Lames alignées en bas, hauteur croissante avec le tier (Talk 1 court, Talk 7 grand)
 * - Un clic sur une lame l'ouvre en pleine hauteur, ferme la précédente
 * - Re-cliquer sur la lame ouverte la ferme
 * - Si `matchedTier` est fourni, cette lame s'ouvre automatiquement au premier render
 *   et affiche un badge "Vous vous situez ici".
 */
function HorizontalPlans({ matchedTier }: { matchedTier: number | null }) {
  const [openTier, setOpenTier] = useState<number | null>(null);

  // Auto-ouverture du tier correspondant quand il devient connu
  useEffect(() => {
    if (matchedTier !== null) {
      setOpenTier(matchedTier);
    }
  }, [matchedTier]);

  return (
    <Box
      sx={{
        display: "flex",
        gap: 1,
        height: MAX_STAIR_HEIGHT,
        width: "100%",
        alignItems: "flex-end", // staircase : alignés en bas
      }}
    >
      {TALK_PLANS.map((plan) => {
        const isOpen = openTier === plan.tier;
        // Répartition : panneau ouvert 58%, les 6 restants se partagent 42%
        const width = isOpen
          ? "58%"
          : openTier === null
          ? `${100 / 7}%`
          : `${42 / 6}%`;
        // Hauteur : pleine si ouvert, sinon staircase
        const height = isOpen ? MAX_STAIR_HEIGHT : stairHeight(plan.tier);

        return (
          <Box
            key={plan.tier}
            role="button"
            tabIndex={0}
            onClick={() => setOpenTier(isOpen ? null : plan.tier)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setOpenTier(isOpen ? null : plan.tier);
              }
            }}
            sx={{
              width,
              height,
              minWidth: 0,
              transition:
                "width 420ms cubic-bezier(0.4, 0, 0.2, 1), height 420ms cubic-bezier(0.4, 0, 0.2, 1)",
              cursor: "pointer",
              position: "relative",
              overflow: "hidden",
              borderRadius: 2,
              bgcolor: isOpen ? "#ffffff" : "rgba(72,200,175,0.08)",
              border: isOpen
                ? "1px solid rgba(72,200,175,0.5)"
                : "1px solid rgba(72,200,175,0.15)",
              boxShadow: isOpen ? "0 8px 24px rgba(72,200,175,0.15)" : "none",
              "&:hover": {
                bgcolor: isOpen ? "#ffffff" : "rgba(72,200,175,0.15)",
              },
              display: "flex",
              flexDirection: "column",
            }}
          >
            {isOpen ? (
              <PlanOpenPanel plan={plan} isMatched={plan.tier === matchedTier} />
            ) : (
              <PlanClosedStrip plan={plan} isMatched={plan.tier === matchedTier} />
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * Vue compacte (fermée) — taille du numéro proportionnelle au tier pour renforcer
 * l'effet escalier. Un petit point teal indique la lame "matchée" par le client.
 */
function PlanClosedStrip({ plan, isMatched }: { plan: TalkPlan; isMatched: boolean }) {
  // Nombre qui grandit avec le tier : Talk 1 ~22px → Talk 7 ~42px
  const numberFontSize = 22 + (plan.tier - 1) * 3.3;
  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        p: 1,
        gap: 0.5,
        color: "#2a6f64",
        userSelect: "none",
        position: "relative",
      }}
    >
      {isMatched && (
        <Box
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: "#48C8AF",
            boxShadow: "0 0 0 3px rgba(72,200,175,0.3)",
          }}
        />
      )}
      <Typography
        sx={{
          fontWeight: 800,
          fontSize: numberFontSize,
          lineHeight: 1,
          color: "#2a6f64",
        }}
      >
        {plan.tier}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          letterSpacing: 1.2,
          color: "#2a6f64",
          opacity: 0.8,
        }}
      >
        TALK
      </Typography>
    </Box>
  );
}

/** Vue détaillée (ouverte) : infos du pack + badge si c'est la lame "matchée". */
function PlanOpenPanel({ plan, isMatched }: { plan: TalkPlan; isMatched: boolean }) {
  return (
    <Box
      sx={{
        flex: 1,
        p: 3,
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        overflow: "hidden",
        animation: "fadePanel 320ms ease",
        "@keyframes fadePanel": {
          from: { opacity: 0, transform: "translateX(6px)" },
          to: { opacity: 1, transform: "translateX(0)" },
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, flexWrap: "wrap" }}>
        <Typography variant="subtitle1" fontWeight={800}>
          {plan.name}
        </Typography>
        {isMatched && (
          <Chip
            size="small"
            label="Vous vous situez ici sur ces 30 derniers jours"
            sx={{
              bgcolor: "transparent",
              color: "#2a6f64",
              border: "1.5px solid #48C8AF",
              fontWeight: 600,
              fontSize: 11,
              height: 22,
            }}
          />
        )}
      </Box>

      <Divider sx={{ opacity: 0.6 }} />

      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          Volume d&apos;appels
        </Typography>
        <Typography variant="body2" fontWeight={600}>
          {plan.volumeLabel}
        </Typography>
      </Box>

      <Box sx={{ mt: "auto" }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          Abonnement mensuel
        </Typography>
        <Typography
          variant="h5"
          fontWeight={800}
          sx={{ color: "#2a6f64", lineHeight: 1.2 }}
        >
          {plan.price ?? "Sur devis"}
        </Typography>
      </Box>

      {/* Barre de progression du tier */}
      <Box sx={{ display: "flex", gap: 0.5, mt: 0.5 }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <Box
            key={i}
            sx={{
              flex: 1,
              height: 3,
              borderRadius: 1,
              bgcolor: i < plan.tier ? "#48C8AF" : "rgba(72,200,175,0.15)",
            }}
          />
        ))}
      </Box>
    </Box>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Page Profil                                 */
/* -------------------------------------------------------------------------- */

const ProfilePage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [last30DaysCalls, setLast30DaysCalls] = useState<number | null>(null);
  const [matchedTier, setMatchedTier] = useState<number | null>(null);

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

  // Récupère le nombre d'appels sur les 30 derniers jours du Talk UserProduct du client
  // et détermine le tier correspondant.
  useEffect(() => {
    if (!clientData) return;
    const talkUP = (clientData.userProducts ?? []).find(
      (up: any) => up?.product?.name === "LyraeTalk"
    );
    const talkUserProductId = talkUP?.id;
    if (!talkUserProductId) return;

    const controller = new AbortController();
    (async () => {
      try {
        const from = new Date();
        from.setDate(from.getDate() - 30);
        from.setHours(0, 0, 0, 0);
        const to = new Date();
        const url =
          `/api/calls?userProductId=${talkUserProductId}` +
          `&mode=all&from=${from.toISOString()}&to=${to.toISOString()}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        const calls = Array.isArray(data) ? data : data?.data ?? [];
        const count = calls.length;
        setLast30DaysCalls(count);
        setMatchedTier(tierForCallCount(count));
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error("Error fetching 30d calls:", err);
        }
      }
    })();

    return () => controller.abort();
  }, [clientData]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
        <CircularProgress sx={{ "& .MuiCircularProgress-svg": { color: "#48C8AF" } }} />
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
        setPasswordError(data.error || "Une erreur est survenue.");
      } else {
        setPasswordSuccess(data.message || "Mot de passe modifié avec succès.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setPasswordError("Une erreur est survenue.");
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
          bgcolor: "rgba(72,200,175,0.12)",
          color: "#2a6f64",
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
            {value || "—"}
          </Typography>
          {chip}
        </Box>
      </Box>
    </Box>
  );

  return (
    <PageContainer title="Mon profil" description="Informations de compte et abonnement">
      <Box>
        <SectionHeader
          title="Mon profil"
          subtitle="Informations personnelles, abonnement et sécurité"
        />

        {/* ========== Informations de compte ========== */}
        <Card sx={{ p: 3, mb: 3 }} elevation={1}>
          <Typography
            variant="overline"
            sx={{ color: "#2a6f64", fontWeight: 700, letterSpacing: 1 }}
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
                          bgcolor: "rgba(72,200,175,0.15)",
                          color: "#2a6f64",
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
                sx={{ color: "#2a6f64", fontWeight: 700, letterSpacing: 1 }}
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
                            {addressLine || "—"}
                          </Typography>
                        }
                      />
                      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                        {u.userProducts?.length ? (
                          u.userProducts.map((up) => (
                            <Chip
                              key={`${u.id}-${up.product.id}`}
                              label={up.product.name}
                              size="small"
                              sx={{
                                bgcolor: "rgba(72,200,175,0.15)",
                                color: "#2a6f64",
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

        {/* ========== Plan de l'abonnement ========== */}
        <Card sx={{ p: 3, mb: 3 }} elevation={1}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 2,
              flexWrap: "wrap",
              mb: 2.5,
            }}
          >
            <Box>
              <Typography
                variant="overline"
                sx={{ color: "#2a6f64", fontWeight: 700, letterSpacing: 1 }}
              >
                Plan de l&apos;abonnement
              </Typography>
              <Typography variant="body2" color="text.secondary">
                7 paliers disponibles selon le volume d&apos;appels mensuels
                {last30DaysCalls !== null && (
                  <> · {last30DaysCalls} appel{last30DaysCalls > 1 ? "s" : ""} sur les 30 derniers jours</>
                )}
              </Typography>
            </Box>
          </Box>
          <Divider sx={{ mb: 3 }} />

          <HorizontalPlans matchedTier={matchedTier} />

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 2, textAlign: "center" }}
          >
            Cliquez sur un pack pour afficher les détails
          </Typography>
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
                bgcolor: "rgba(72,200,175,0.15)",
                color: "#2a6f64",
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
                    bgcolor: "#48C8AF",
                    fontWeight: 600,
                    "&:hover": { bgcolor: "#3BA992" },
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
