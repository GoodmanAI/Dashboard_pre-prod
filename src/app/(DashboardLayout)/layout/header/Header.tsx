"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  AppBar,
  Toolbar,
  styled,
  Stack,
  IconButton,
  Badge,
  Button,
  Menu,
  MenuItem,
  ListItemText,
  Typography,
  Select,
  MenuItem as MuiMenuItem,
} from "@mui/material";
import PropTypes from "prop-types";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import Menuitems from "../sidebar/MenuItems";
import { IconBellRinging, IconMenu, IconX } from "@tabler/icons-react";
import Profile from "./Profile";
import { useCentre, ManagedUser } from "../../../context/CentreContext";

interface Notification {
  id: number;
  message: string;
  createdAt: string;
}

const Header = ({ toggleMobileSidebar }: { toggleMobileSidebar: () => void }) => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [anchorNotif, setAnchorNotif] = useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Le contexte des centres
  const { centres, selectedCentre, setSelectedCentreById } = useCentre();

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/notification/get-unread")
        .then((res) => res.json())
        .then((data) => {
          setNotifications(data.notifications || []);
        })
        .catch(console.error);
    }
  }, [status]);

  const handleNotifClick = (e: React.MouseEvent<HTMLElement>) => setAnchorNotif(e.currentTarget);
  const handleNotifClose = () => setAnchorNotif(null);

  const markAsRead = async (notifId: number) => {
    await fetch("/api/notification/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: notifId }),
    });
    setNotifications((prev) => prev.filter((n) => n.id !== notifId));
  };

  const generateBreadcrumb = () => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments[0] === "client") segments[0] = "Home";
    const breadcrumb: React.ReactNode[] = [];
    // ... (idem)
    return breadcrumb;
  };

  const AppBarStyled = styled(AppBar)(({ theme }) => ({
    boxShadow: "none",
    background: theme.palette.background.paper,
    backdropFilter: "blur(4px)",
  }));
  const ToolbarStyled = styled(Toolbar)(({ theme }) => ({
    width: "100%",
    color: theme.palette.text.secondary,
  }));

  return (
    <AppBarStyled position="sticky" color="default">
      <ToolbarStyled>
        <IconButton
          color="inherit"
          aria-label="menu"
          onClick={toggleMobileSidebar}
          sx={{ display: { lg: "none", xs: "inline" } }}
        >
          <IconMenu width="20" height="20" />
        </IconButton>

        {/* Breadcrumb */}
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            {generateBreadcrumb()}
          </Typography>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          {/* Bell */}
          <IconButton size="large" color="inherit" onClick={handleNotifClick}>
            <Badge variant={notifications.length > 0 ? "dot" : undefined} color="primary">
              <IconBellRinging size="21" stroke="1.5" />
            </Badge>
          </IconButton>

          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {session?.user?.name ?? session?.user?.email}
            </Typography>

            {/* Sélecteur dynamique des centres, visible seulement si on a des centres à gérer */}
            {centres.length > 0 && (
              <Select
                value={selectedCentre?.id || ""}
                onChange={(e) => setSelectedCentreById(Number(e.target.value))}
                variant="standard"
                disableUnderline
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

          {/* Profil / déconnexion */}
          <Profile />
        </Box>
      </ToolbarStyled>

      {/* Menu popup notifications */}
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
              <IconButton onClick={() => markAsRead(notif.id)} size="small">
                <IconX size="16" />
              </IconButton>
            </MenuItem>
          ))
        )}
      </Menu>
    </AppBarStyled>
  );
};

Header.propTypes = {
  toggleMobileSidebar: PropTypes.func,
};

export default Header;
