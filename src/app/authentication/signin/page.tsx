"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Stack,
  Button,
  Link,
  TextField
} from "@mui/material";
import { signIn, getSession, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (session?.user?.role) {
      if (session.user.role === "ADMIN") {
        router.push("/admin");
      } else if (session.user.role === "CLIENT") {
        router.push("/client");
      }
    }
  }, [session, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      console.error("error: ", result);
      setLoading(false);
      return;
    }

    setTimeout(async () => {
      const session = await getSession();
      let redirectUrl = "/authentication/signin";
      if (session?.user?.role === "ADMIN") {
        redirectUrl = "/admin";
      } else if (session?.user?.role === "CLIENT") {
        redirectUrl = "/client";
      }
      router.push(redirectUrl);
      setLoading(false);
    }, 1000);

    setTimeout(() => {
      router.refresh();
    }, 1500);
  };

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
        sx={{
          width: 80,
          height: 80,
          left: "calc(50% - 50px)",
          top: 50,
        }}
      />
      <Box
        component="img"
        src="/images/logos/neuracorp_sans_logo.png"
        alt="Horizontal Logo"
        sx={{
          width: 180,
          height: "auto",
          left: "calc(50% - 75px)",
          top: 100,
          objectFit: "contain",
        }}
      />

      {/* Titre principal */}
      <Typography
        variant="h4"
        sx={{
          fontWeight: 600,
          color: "#34495E",
          textAlign: "center",
          mt: 4,
          mb: 2,
        }}
      >
        Connexion
      </Typography>

      {/* Paragraphe de sous-titre / description */}
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

      {/* Conteneur du formulaire */}
      <Box
        sx={{
          width: "90%",
          maxWidth: "348px",
          p: 2,
        }}
      >
        <form onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <Box>
              <TextField
                fullWidth
                variant="outlined"
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
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
            </Box>

            {/* Champ Password */}
            <Box>
              <TextField
                fullWidth
                variant="outlined"
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
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
            </Box>

            {/* Bouton "Login" */}
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
                ":hover": {
                  backgroundColor: "#3AB19B",
                },
              }}
            >
              {loading ? "Signing In..." : "Login"}
            </Button>

            {/* Lien Forgot password*/}
            <Box sx={{ textAlign: "center" }}>
              <Link
                href="#"
                underline="none"
                sx={{
                  fontWeight: 700,
                  fontSize: "13px",
                  color: "#34495E",
                }}
              >
                Forgot password?
              </Link>
            </Box>
          </Stack>
        </form>
      </Box>

      {/* Autre paragraphe optionnel sous le formulaire */}
      {/* <Typography
        sx={{
          fontWeight: 400,
          fontSize: "11px",
          lineHeight: "24px",
          textAlign: "center",
          color: "#9CADBF",
          mt: 2,
        }}
      >
        Some secondary text here (optionnel).
      </Typography> */}

      {/* Pied de page */}
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
