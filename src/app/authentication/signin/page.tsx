"use client";

import React, { useState } from "react";
import {
  Box,
  Typography,
  Stack,
  Button,
  FormGroup,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import CustomTextField from "@/app/(DashboardLayout)/components/forms/theme-elements/CustomTextField";

const SignIn = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false); // Indicateur de chargement
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); // Activer le chargement

    const session = await getSession();
    let redirectUrl = "/authentication/signin";

    if (session?.user?.role === "ADMIN") {
    redirectUrl = "/admin";
    } else if (session?.user?.role === "CLIENT") {
    redirectUrl = "/client";
    }

    await signIn("credentials", {
    email,
    password,
    redirect: true,
    callbackUrl: redirectUrl, // Redirection dynamique selon le rôle
  });

  setLoading(false);
};

  return (
    <Box
      sx={{
        maxWidth: "500px",
        margin: "auto",
        p: 4,
        backgroundColor: "white",
        boxShadow: 3,
        borderRadius: 2,
      }}
    >
      <Typography fontWeight="700" variant="h4" textAlign="center" mb={2}>
        Sign In
      </Typography>
      <form onSubmit={handleSubmit}>
        <Stack spacing={3}>
          <Box>
            <Typography
              variant="subtitle1"
              fontWeight={600}
              component="label"
              htmlFor="email"
              mb="5px"
            >
              Email
            </Typography>
            <CustomTextField
              id="email"
              type="email"
              variant="outlined"
              fullWidth
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEmail(e.target.value)
              }
              disabled={loading} // Désactiver pendant le chargement
            />
          </Box>
          <Box>
            <Typography
              variant="subtitle1"
              fontWeight={600}
              component="label"
              htmlFor="password"
              mb="5px"
            >
              Password
            </Typography>
            <CustomTextField
              id="password"
              type="password"
              variant="outlined"
              fullWidth
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setPassword(e.target.value)
              }
              disabled={loading} // Désactiver pendant le chargement
            />
          </Box>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
          >
            <FormGroup>
              <FormControlLabel
                control={<Checkbox defaultChecked />}
                label="Remember this Device"
              />
            </FormGroup>
          </Stack>
          <Box>
            <Button
              color="primary"
              variant="contained"
              size="large"
              fullWidth
              type="submit"
              disabled={loading} // Désactiver le bouton pendant le chargement
            >
              {loading ? "Signing In..." : "Sign In"}
            </Button>
          </Box>
        </Stack>
      </form>
    </Box>
  );
};

export default SignIn;
