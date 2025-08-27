// components/Profile.tsx
"use client";

import React, { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Box,
  Menu,
  Button,
  IconButton,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import { IconUser } from "@tabler/icons-react";

/**
 * Composant Profil
 * ----------------
 * Affiche l’avatar utilisateur dans l’en-tête et propose un menu d’actions :
 * - Accéder à l’espace profil (admin ou client selon le rôle de session)
 * - Se déconnecter (avec redirection vers la page de connexion)
 *
 * Responsabilités :
 * - Lire la session (next-auth)
 * - Router vers l’espace approprié selon le rôle
 * - Gérer l’ouverture/fermeture du menu
 */
const Profile = () => {
  // Session courante (utilisée pour connaître le rôle et adapter la destination)
  const { data: session } = useSession();

  // Ancre du menu (élément déclencheur) ; null = menu fermé
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // Router client-side pour la navigation
  const router = useRouter();

  // Ouvre le menu de profil
  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  // Ferme le menu de profil
  const handleCloseMenu = () => {
    setAnchorEl(null);
  };

  // Déconnexion utilisateur + redirection vers la page de login
  const handleLogout = async () => {
    setAnchorEl(null);
    await signOut({ callbackUrl: "/authentication/signin" });
  };

  // Redirige vers l’espace profil adapté (admin ou client) puis ferme le menu
  const handleMyProfile = () => {
    if (session?.user?.role === "ADMIN") {
      router.push("/admin");
    } else {
      router.push("/client/profile");
    }
    handleCloseMenu();
  };

  return (
    <Box>
      {/* Bouton Avatar — déclenche l’ouverture du menu de profil */}
      <IconButton
        size="large"
        aria-label="profile options"
        color="inherit"
        aria-controls="profile-menu"
        aria-haspopup="true"
        onClick={handleOpenMenu}
        sx={{
          ...(typeof anchorEl === "object" && { color: "primary.main" }),
        }}
      >
        <Avatar
          src="/images/logos/neuracorp-ai-icon_fond.png"
          alt="User Avatar"
          sx={{ width: 35, height: 35 }}
        />
      </IconButton>

      {/* Menu déroulant des actions de profil */}
      <Menu
        id="profile-menu"
        anchorEl={anchorEl}
        keepMounted
        open={Boolean(anchorEl)}
        onClose={handleCloseMenu}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        sx={{ "& .MuiMenu-paper": { width: 200 } }}
      >
        {/* Accès au profil (admin ou client) */}
        <MenuItem onClick={handleMyProfile}>
          <ListItemIcon>
            <IconUser width={20} />
          </ListItemIcon>
          <ListItemText primary="My Profile" />
        </MenuItem>

        {/* Action de déconnexion */}
        <Box mt={1} py={1} px={2}>
          <Button
            variant="outlined"
            onClick={handleLogout}
            fullWidth
            sx={{
              color: "#48C8AF",
              borderColor: "#48C8AF",
              "&:hover": {
                backgroundColor: "rgba(72,200,175,0.04)",
                borderColor: "#48C8AF",
              },
            }}
          >
            Logout
          </Button>
        </Box>
      </Menu>
    </Box>
  );
};

export default Profile;
