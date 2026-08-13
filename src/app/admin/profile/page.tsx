"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { IconEye, IconEyeOff, IconLock, IconShieldCheck } from "@tabler/icons-react";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";

/**
 * Page profil ADMIN — self-service change password (chantier 3).
 * -----------------------------------------------------------------------------
 * Accessible : ADMIN uniquement. Le SUPER_ADMIN est redirige vers /admin
 * (son mdp ne peut pas etre change via UI par design de securite).
 *
 * Reutilise l'endpoint /api/client/change-password (agnostique au role,
 * refuse le SUPER_ADMIN cote serveur en double garde).
 */

const BRAND_TEAL = "var(--accent)";
const TEXT_MAIN = "#1F3448";
const TEXT_MUTED = "#7A8FA6";

export default function AdminProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Guard : redirect si pas authentifie, ou SUPER_ADMIN, ou pas ADMIN
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
      return;
    }
    if (status === "authenticated") {
      const role = session?.user?.role;
      if (role === "SUPER_ADMIN") {
        // Le SUPER_ADMIN n'a pas de self-service. Redirect vers /admin.
        router.push("/admin");
        return;
      }
      if (role !== "ADMIN") {
        router.push("/client/profile");
        return;
      }
    }
  }, [status, session, router]);

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Veuillez remplir tous les champs.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Les nouveaux mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/client/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Une erreur est survenue.");
      } else {
        setSuccess(data.message || "Mot de passe modifie avec succes.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setError("Une erreur reseau est survenue.");
    } finally {
      setLoading(false);
    }
  };

  if (status !== "authenticated" || session?.user?.role !== "ADMIN") {
    return (
      <PageContainer title="Profil" description="Profil administrateur">
        <Box sx={{ display: "grid", placeItems: "center", minHeight: "50vh" }}>
          <CircularProgress sx={{ "& .MuiCircularProgress-svg": { color: BRAND_TEAL } }} />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Profil" description="Profil administrateur">
      <SectionHeader
        title="Mon profil"
        subtitle="Compte administrateur — mise a jour du mot de passe"
      />

      <Card sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: "12px",
              display: "grid",
              placeItems: "center",
              bgcolor: "rgba(var(--accent-rgb), 0.12)",
              color: BRAND_TEAL,
            }}
          >
            <IconShieldCheck size={22} />
          </Box>
          <Box>
            <Typography variant="subtitle2" sx={{ color: TEXT_MUTED, fontSize: 12 }}>
              Compte connecte
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700, color: TEXT_MAIN }}>
              {session.user.name ?? session.user.email}
            </Typography>
            <Typography variant="body2" sx={{ color: TEXT_MUTED, fontSize: 13 }}>
              {session.user.email} — role ADMIN
            </Typography>
          </Box>
        </Stack>
      </Card>

      <Card sx={{ p: 3, maxWidth: 560 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
          <IconLock size={20} color={BRAND_TEAL} />
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: TEXT_MAIN }}>
            Changer le mot de passe
          </Typography>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}

        <Stack spacing={2}>
          <TextField
            label="Mot de passe actuel"
            type={showCurrent ? "text" : "password"}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            fullWidth
            disabled={loading}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowCurrent((v) => !v)} edge="end" size="small">
                    {showCurrent ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <TextField
            label="Nouveau mot de passe"
            type={showNew ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            fullWidth
            disabled={loading}
            helperText="Min 12 caracteres, avec majuscule, minuscule, chiffre et special."
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowNew((v) => !v)} edge="end" size="small">
                    {showNew ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <TextField
            label="Confirmer le nouveau mot de passe"
            type={showConfirm ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            fullWidth
            disabled={loading}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowConfirm((v) => !v)} edge="end" size="small">
                    {showConfirm ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Box>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={loading}
              sx={{
                bgcolor: BRAND_TEAL,
                "&:hover": { bgcolor: "#3aa896" },
                textTransform: "none",
                fontWeight: 600,
              }}
            >
              {loading ? "Modification..." : "Modifier le mot de passe"}
            </Button>
          </Box>
        </Stack>
      </Card>
    </PageContainer>
  );
}
