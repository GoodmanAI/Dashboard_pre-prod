"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  AppBar,
  Toolbar,
  styled,
  IconButton,
  Badge,
  Menu,
  MenuItem,
  ListItemText,
  Typography,
  Select,
  MenuItem as MuiMenuItem,
} from "@mui/material";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { IconBellRinging, IconMenu, IconX } from "@tabler/icons-react";
import Profile from "./Profile";
import { useCentre, ManagedUser } from "../../../context/CentreContext";

/**
 * Header d’application (barre supérieure).
 * Responsabilités :
 *  - Afficher le breadcrumb (placeholder).
 *  - Gérer les notifications (liste + marquer comme lues).
 *  - Exposer un sélecteur de centre (pour ADMIN_USER) via CentreContext.
 *  - Afficher le menu profil utilisateur.
 */
type HeaderProps = {
  /** Action transmise par le layout pour ouvrir/fermer la sidebar en mobile. */
  toggleMobileSidebar: () => void;
};

/** Modèle de notification renvoyé par `/api/notification/get-unread`. */
interface Notification {
  id: number;
  message: string;
  createdAt: string;
}

/** Styles locaux, scindés pour limiter le bruit dans le JSX. */
const AppBarStyled = styled(AppBar)(({ theme }) => ({
  boxShadow: "none",
  background: theme.palette.background.paper,
  backdropFilter: "blur(4px)",
}));

const ToolbarStyled = styled(Toolbar)(({ theme }) => ({
  width: "100%",
  color: theme.palette.text.secondary,
}));

const Header = ({ toggleMobileSidebar }: HeaderProps) => {
  // --- Contexte session & navigation
  const { data: session, status } = useSession();
  const pathname = usePathname();

  // --- État local (UI notifications)
  const [anchorNotif, setAnchorNotif] = useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // --- Contexte centres (ADMIN_USER) : liste + centre sélectionné
  const { centres, selectedCentre, setSelectedCentreById } = useCentre();

  /**
   * Chargement des notifications non lues à l’authentification.
   * - Récupération côté serveur
   * - Stockage local pour affichage badge + popover
   */
  useEffect(() => {
    if (status !== "authenticated") return;

    fetch("/api/notification/get-unread")
      .then((res) => res.json())
      .then((data) => setNotifications(data.notifications || []))
      .catch(console.error);
  }, [status]);

  /** Ouvre le popover notifications. */
  const handleNotifClick = (e: React.MouseEvent<HTMLElement>) => {
    setAnchorNotif(e.currentTarget);
  };

  /** Ferme le popover notifications. */
  const handleNotifClose = () => setAnchorNotif(null);

  /**
   * Marque une notification comme lue (optimiste).
   * - Appel API pour mise à jour serveur
   * - Filtrage local pour mise à jour instantanée
   */
  const markAsRead = async (notifId: number) => {
    try {
      await fetch("/api/notification/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: notifId }),
      });
    } finally {
      setNotifications((prev) => prev.filter((n) => n.id !== notifId));
    }
  };

  /**
   * Génère le breadcrumb depuis `pathname`.
   * Remplacer par une implémentation métier dès que nécessaire.
   */
  const generateBreadcrumb = () => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments[0] === "client") segments[0] = "Home";
    return []; // TODO: implémenter un vrai breadcrumb si requis
  };

  return (
    <AppBarStyled position="sticky" color="default">
      <ToolbarStyled>
        {/* Bouton de menu (affichage mobile) */}
        <IconButton
          color="inherit"
          aria-label="menu"
          onClick={toggleMobileSidebar}
          sx={{ display: { lg: "none", xs: "inline" } }}
        >
          <IconMenu width={20} height={20} />
        </IconButton>

        {/* Zone breadcrumb (placeholder) */}
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            {generateBreadcrumb()}
          </Typography>
        </Box>

        {/* Zone à droite : notifications, sélecteur de centre, profil */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          {/* Notifications */}
          <IconButton
            size="large"
            color="inherit"
            onClick={handleNotifClick}
            aria-label="Voir les notifications"
          >
            <Badge variant={notifications.length > 0 ? "dot" : undefined} color="primary">
              <IconBellRinging size={21} stroke={1.5} />
            </Badge>
          </IconButton>

          {/* Identité + sélecteur de centre si applicable */}
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {session?.user?.name ?? session?.user?.email}
            </Typography>

            {centres.length > 0 && (
              <Select
                value={selectedCentre?.id || ""}
                onChange={(e) => setSelectedCentreById(Number(e.target.value))}
                variant="standard"
                disableUnderline
                aria-label="Sélection de centre"
                sx={{
                  fontWeight: 600,
                  fontSize: "0.8rem",
                  color: "#48C8AF",
                  "& .MuiSelect-icon": { color: "#48C8AF", fontSize: 18 },
                }}
              >
                {centres.map((c: ManagedUser) => (
                  <MuiMenuItem key={c.id} value={c.id} sx={{ fontWeight: 500, fontSize: "0.85rem" }}>
                    {c.name ?? c.email}
                  </MuiMenuItem>
                ))}
              </Select>
            )}
          </Box>

          {/* Menu profil (avatar, déconnexion, etc.) */}
          <Profile />
        </Box>
      </ToolbarStyled>

      {/* Popover de notifications */}
      <Menu
        anchorEl={anchorNotif}
        open={Boolean(anchorNotif)}
        onClose={handleNotifClose}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        PaperProps={{ sx: { width: 600, maxHeight: 400, p: 1 } }}
      >
        {notifications.length === 0 ? (
          <MenuItem>
            <ListItemText primary="Aucune notification" />
          </MenuItem>
        ) : (
          notifications.map((notif) => (
            <MenuItem
              key={notif.id}
              sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <ListItemText
                primary={notif.message}
                secondary={new Date(notif.createdAt).toLocaleString()}
                sx={{ pr: 2 }}
              />
              <IconButton onClick={() => markAsRead(notif.id)} size="small" aria-label="Marquer comme lue">
                <IconX size={16} />
              </IconButton>
            </MenuItem>
          ))
        )}
      </Menu>
    </AppBarStyled>
  );
};

export default Header;
