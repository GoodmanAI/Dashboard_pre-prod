"use client";

import React, { useState } from "react";
import {
  Box,
  Typography,
  Stack,
  Button,
  Link,
  TextField
} from "@mui/material";
import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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

    const session = await getSession();
    let redirectUrl = "/authentication/signin";

    if (session?.user?.role === "ADMIN") {
      redirectUrl = "/admin";
    } else if (session?.user?.role === "CLIENT") {
      redirectUrl = "/client";
    }

    router.push(redirectUrl);
    setLoading(false);
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
        position: "relative",
        fontFamily: "Lato, sans-serif",
      }}
    >
      <Box
        component="img"
        src="/images/logos/neuracorp-ai-icon_fond.png"
        alt="Neuracorp AI Icon"
        sx={{
          position: "absolute",
          width: 100,
          height: 100,
          left: "calc(50% - 50px)",
          top: 100,
        }}
      />
      <Box
        component="img"
        src="/images/logos/neuracorp_sans_logo.png"
        alt="Horizontal Logo"
        sx={{
          position: "absolute",
          width: 150,
          height: "auto",
          left: "calc(50% - 75px)",
          top: 210,
          objectFit: "contain",
        }}
      />

      {/* Titre principal */}
      <Typography
        variant="h3"
        sx={{
          fontWeight: 700,
          color: "#34495E",
          textAlign: "center",
          mb: 5,
        }}
      >
        Login
      </Typography>

      {/* Paragraphe de sous-titre / description */}
      <Typography
        sx={{
          fontWeight: 400,
          fontSize: "11px",
          lineHeight: "24px",
          textAlign: "center",
          color: "#91A3B7",
          mb: 5,
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

            {/* Lien Forgot password, centré et en dessous */}
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
