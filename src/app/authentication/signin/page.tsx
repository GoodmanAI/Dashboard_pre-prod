"use client";

import { useState, useEffect } from "react";
import { signIn, getSession, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Typography,
  Stack,
  Button,
  TextField,
  InputAdornment,
  IconButton,
} from "@mui/material";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { getFirstAccessiblePath } from "@/lib/pageAccess";
import { trouverProduit } from "@/lib/produits";

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
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // Message d'erreur remonté par NextAuth (result.error). Contient le message
  // FR construit dans authOptions.authorize (identifiant/mot de passe
  // incorrect, tentatives restantes, compte bloqué, rate limit IP).
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
  const [products, setProducts] = useState([]);
  const [talkId, setTalkId] = useState([]);

  /* -------------------------------------------------------------------------- */
  /*                           Soumission du formulaire                          */
  /*  - Appelle signIn("credentials") sans redirection automatique.              */
  /*  - Récupère ensuite la session pour déterminer la route de destination.     */
  /*  - Rafraîchit la route pour recharger les layouts dépendants de la session. */
  /* -------------------------------------------------------------------------- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      console.error("Erreur d’authentification:", result);
      // Le message FR est fourni par authOptions.authorize (cf. src/lib/authOptions.ts).
      // Fallback générique si NextAuth remplace le message par un code (rare en v4 avec redirect:false).
      const isGenericCode = result.error === "CredentialsSignin";
      setErrorMsg(
        isGenericCode
          ? "Mot de passe ou identifiant incorrect, veuillez réessayer."
          : result.error
      );
      setLoading(false);
      return;
    }

    // on attend que NextAuth mette à jour la session
    const session = await getSession();

    if (session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN") {
      router.push("/admin");
      router.refresh();
      return;
    }

    // CLIENT (principal ou sous-compte) : redirect vers la premiere page
    // accessible selon PAGE_PRIORITY et les permissions du user.
    //   - Compte principal (permissions=null) : hasPermission=true partout
    //     -> DASHBOARD (premier de la liste) -> /client/services/talk/{talkId}
    //   - Sous-compte : premiere page cochee dans PAGE_PRIORITY
    // L'endpoint /api/users/[id]/products remonte au parent pour les
    // sous-comptes, donc talkId est correct dans les 2 cas.
    const userId = session?.user.id;
    const res = await fetch(`/api/users/${userId}/products`);
    const data = await res.json();
    const product: any = Array.isArray(data)
      ? trouverProduit<any>(data, "talk")
      : null;
    const talkId: number | null = product?.id ?? null;

    const target = getFirstAccessiblePath(session?.user as any, talkId);
    router.push(target ?? "/client/services/talk/");
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
            {errorMsg && (
              <Alert
                severity="error"
                onClose={() => setErrorMsg(null)}
                sx={{ borderRadius: "8px", alignItems: "center" }}
              >
                {errorMsg}
              </Alert>
            )}

            <TextField
              fullWidth
              variant="outlined"
              label="Identifiant"
              type="text"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              disabled={loading}
              autoComplete="username"
              placeholder="votre identifiant"
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
              label="Mot de passe"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              disabled={loading}
              autoComplete="current-password"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword((v) => !v)}
                      edge="end"
                      size="small"
                      disabled={loading}
                      aria-label={
                        showPassword
                          ? "Masquer le mot de passe"
                          : "Afficher le mot de passe"
                      }
                      sx={{ color: "#91A3B7" }}
                    >
                      {showPassword ? (
                        <IconEyeOff size={18} />
                      ) : (
                        <IconEye size={18} />
                      )}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
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
                backgroundColor: "var(--accent)",
                borderRadius: "99px",
                color: "#FFFFFF",
                fontWeight: 700,
                fontSize: "13px",
                textTransform: "none",
                py: 1.2,
                ":hover": { backgroundColor: "var(--accent-press)" },
              }}
            >
              {loading ? "Connexion..." : "Se connecter"}
            </Button>
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
