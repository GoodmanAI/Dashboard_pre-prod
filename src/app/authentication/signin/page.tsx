"use client";

import { useState, useEffect } from "react";
import { signIn, getSession, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Box,
  Typography,
  Stack,
  Button,
  Link,
  TextField,
} from "@mui/material";

/**
 * Page de connexion
 * - Gère l’authentification via NextAuth (provider "credentials").
 * - Redirige automatiquement selon le rôle utilisateur (ADMIN → /admin, CLIENT → /client).
 * - Affiche un formulaire minimal (email / mot de passe) avec états de chargement.
 */
export default function SignIn() {
  /* -------------------------------------------------------------------------- */
  /*                                   États                                    */
  /* -------------------------------------------------------------------------- */
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  /* -------------------------------------------------------------------------- */
  /*                             Contexte & Navigation                           */
  /* -------------------------------------------------------------------------- */
  const router = useRouter();
  const { data: session, status } = useSession();

  /* -------------------------------------------------------------------------- */
  /*                     Redirection si déjà authentifié                         */
  /*  - Évite d’afficher le formulaire si une session valide existe.            */
  /*  - Oriente vers l’espace adapté selon le rôle.                             */
  /* -------------------------------------------------------------------------- */
  useEffect(() => {
    if (session?.user?.role) {
      if (session.user.role === "ADMIN") {
        router.push("/admin");
      } else if (session.user.role === "CLIENT") {
        router.push("/client");
      }
    }
  }, [session, router]);

  /* -------------------------------------------------------------------------- */
  /*                           Soumission du formulaire                          */
  /*  - Appelle signIn("credentials") sans redirection automatique.              */
  /*  - Récupère ensuite la session pour déterminer la route de destination.     */
  /*  - Rafraîchit la route pour recharger les layouts dépendants de la session. */
  /* -------------------------------------------------------------------------- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      console.error("Erreur d’authentification:", result);
      setLoading(false);
      return;
    }

    // on attend que NextAuth mette à jour la session
    const session = await getSession();

    if (session?.user?.role === "ADMIN") {
      router.push("/admin");
    } else {
      router.push("/client");
    }

    router.refresh();
  };

  /* -------------------------------------------------------------------------- */
  /*                                 Rendu UI                                   */
  /*  - Layout centré, logos, titres, formulaire, pied de page.                 */
  /*  - Styles en ligne pour rester autonome (peut être migré vers theme).      */
  /* -------------------------------------------------------------------------- */
  return (
    <Box
      sx={{
        backgroundColor: "#F8F8F8",
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Lato, sans-serif",
      }}
    >
      <Box
        component="img"
        src="/images/logos/neuracorp-ai-icon_fond.png"
        alt="Neuracorp AI Icon"
        sx={{ width: 80, height: 80, left: "calc(50% - 50px)", top: 50 }}
      />
      <Box
        component="img"
        src="/images/logos/neuracorp_sans_logo.png"
        alt="Neuracorp Logo"
        sx={{
          width: 180,
          height: "auto",
          left: "calc(50% - 75px)",
          top: 100,
          objectFit: "contain",
        }}
      />

      <Typography
        variant="h4"
        sx={{ fontWeight: 600, color: "#34495E", textAlign: "center", mt: 4, mb: 2 }}
      >
        Connexion
      </Typography>

      <Typography
        sx={{
          fontWeight: 400,
          fontSize: "11px",
          lineHeight: "24px",
          textAlign: "center",
          color: "#91A3B7",
          mb: 2,
        }}
      >
        Entrez vos identifiants pour accéder à votre tableau de bord.
      </Typography>

      {/* ---------------------------- Formulaire login ---------------------------- */}
      <Box sx={{ width: "90%", maxWidth: 348, p: 2 }}>
        <form onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <TextField
              fullWidth
              variant="outlined"
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              autoComplete="username"
              sx={{
                backgroundColor: "#FFFFFF",
                borderRadius: "8px",
                "& .MuiOutlinedInput-root": {
                  "& fieldset": {
                    borderColor: "#F0F0F0",
                    borderWidth: "1.5px",
                    borderRadius: "8px",
                  },
                },
              }}
            />

            <TextField
              fullWidth
              variant="outlined"
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
              sx={{
                backgroundColor: "#FFFFFF",
                borderRadius: "8px",
                "& .MuiOutlinedInput-root": {
                  "& fieldset": {
                    borderColor: "#F0F0F0",
                    borderWidth: "1.5px",
                    borderRadius: "8px",
                  },
                },
              }}
            />

            <Button
              type="submit"
              disabled={loading}
              sx={{
                backgroundColor: "#48C8AF",
                borderRadius: "99px",
                color: "#FFFFFF",
                fontWeight: 700,
                fontSize: "13px",
                textTransform: "none",
                py: 1.2,
                ":hover": { backgroundColor: "#3AB19B" },
              }}
            >
              {loading ? "Signing In..." : "Login"}
            </Button>

            <Box sx={{ textAlign: "center" }}>
              <Link
                href="#"
                underline="none"
                sx={{ fontWeight: 700, fontSize: "13px", color: "#34495E" }}
              >
                Forgot password?
              </Link>
            </Box>
          </Stack>
        </form>
      </Box>

      {/* ---------------------------------- Footer --------------------------------- */}
      <Typography
        sx={{
          position: "absolute",
          bottom: 10,
          left: "50%",
          transform: "translateX(-50%)",
          fontFamily: "Inter, sans-serif",
          fontSize: "12px",
          color: "#A0AEC0",
        }}
      >
        © 2025, Made with ❤️ by NeuracorpAI
      </Typography>
    </Box>
  );
}
