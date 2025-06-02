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
  Select
} from "@mui/material";
import PropTypes from "prop-types";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import Menuitems from "../sidebar/MenuItems";
import { IconBellRinging, IconMenu, IconX } from "@tabler/icons-react";
import Profile from "./Profile";
import { useSite } from "@/app/context/SiteContext";

interface ItemType {
  toggleMobileSidebar: (event: React.MouseEvent<HTMLElement>) => void;
}

interface Notification {
  id: number;
  message: string;
  createdAt: string;
}

type CHUName = "CHU Nantes" | "CHU Rennes" | "CHU Vannes";

const Header = ({ toggleMobileSidebar }: ItemType) => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [anchorNotif, setAnchorNotif] = useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [clientName, setClientName] = useState<string>("");
  const { selectedSite, setSelectedSite } = useSite();

  useEffect(() => {
    async function fetchNotifications() {
      try {
        const res = await fetch("/api/notification/get-unread");
        const data = await res.json();
        if (res.ok && data.notifications) {
          setNotifications(data.notifications);
        }
      } catch (error) {
        console.error("Erreur lors du fetch des notifications :", error);
      }
    }
    if (status === "authenticated") {
      fetchNotifications();
    }
  }, [status]);

  useEffect(() => {
    async function fetchClientData() {
      try {
        const res = await fetch("/api/client");
        if (res.ok) {
          const data = await res.json();
          setClientName(data.name);
        } else {
          console.error("Erreur lors de la récupération du client");
        }
      } catch (error) {
        console.error("Erreur lors de la récupération du client:", error);
      }
    }
    if (status === "authenticated") {
      fetchClientData();
    }
  }, [status]);

  const handleNotifClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorNotif(event.currentTarget);
  };

  const handleNotifClose = () => {
    setAnchorNotif(null);
  };

  const markAsRead = async (notifId: number) => {
    try {
      const res = await fetch("/api/notification/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: notifId }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.filter((n) => n.id !== notifId));
      } else {
        console.error("Error marking notification as read");
      }
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const generateBreadcrumb = (): React.ReactNode => {
    const segments: string[] = pathname.split("/").filter(Boolean);

    if (segments[0] === "client") {
      segments[0] = "Home";
    }

    const getCurrentMenuItemTitle = (path: string): string => {
      let matchedTitle = "";
      let maxLength = 0;
      Menuitems.forEach((item) => {
        if (item.href && path.startsWith(item.href) && item.href.length > maxLength) {
          matchedTitle = item.title;
          maxLength = item.href.length;
        }
      });
      return matchedTitle;
    };

    const breadcrumbElements: React.ReactNode[] = [];
    if (segments.length > 1) {
      segments.slice(0, segments.length - 1).forEach((segment: string, index: number) => {
        breadcrumbElements.push(
          <span key={index} style={{ fontWeight: 400, color: "#A0AEC0" }}>
            {segment.charAt(0).toUpperCase() + segment.slice(1)}{" / "}
          </span>
        );
      });
    } else if (segments.length === 1) {
      breadcrumbElements.push(
        <span key={0} style={{ fontWeight: 400, color: "#A0AEC0" }}>
          {segments[0].charAt(0).toUpperCase() + segments[0].slice(1)}{" / "}
        </span>
      );
    }

    const lastSegmentTitle = getCurrentMenuItemTitle(pathname) || 
      (segments[segments.length - 1]
        ? segments[segments.length - 1].charAt(0).toUpperCase() + segments[segments.length - 1].slice(1)
        : "");

    breadcrumbElements.push(
      <span key="last" style={{ fontWeight: 700, color: "#000000" }}>
        {lastSegmentTitle}
      </span>
    );

    return breadcrumbElements;
  };

  const AppBarStyled = styled(AppBar)(({ theme }) => ({
    boxShadow: "none",
    background: theme.palette.background.paper,
    justifyContent: "center",
    backdropFilter: "blur(4px)",
    [theme.breakpoints.up("lg")]: {
      minHeight: "70px",
    },
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
        
        {/* Partie gauche : Breadcrumb dynamique */}
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            {generateBreadcrumb()}
          </Typography>
        </Box>

        {/* Partie droite : Bloc contenant icône notification, nom du service, icône profile */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <IconButton
            size="large"
            aria-label="show notifications"
            color="inherit"
            onClick={handleNotifClick}
          >
            <Badge
              variant={notifications.length > 0 ? "dot" : undefined}
              color="primary"
            >
              <IconBellRinging size="21" stroke="1.5" />
            </Badge>
          </IconButton>
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {clientName}
            </Typography>
            <Select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value as CHUName)}
              variant="standard"
              disableUnderline
              sx={{
                fontWeight: 600,
                fontSize: "0.8rem",
                color: "#48C8AF",
                lineHeight: 1.6,
                mt: -0.3,
                "& .MuiSelect-icon": {
                  color: "#48C8AF",
                  fontSize: 18,
                  ml: 0.5,
                },
                "& .MuiSelect-select": {
                  paddingLeft: 0,
                  paddingRight: "20px",
                  paddingTop: 0,
                  paddingBottom: 0,
                },
              }}
              MenuProps={{
                PaperProps: {
                  sx: {
                    borderRadius: 2,
                    boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.1)",
                    mt: 1,
                    px: 1,
                    py: 0.5,
                  },
                },
              }}
            >
              {["CHU Nantes", "CHU Rennes", "CHU Vannes"].map((site) => (
                <MenuItem key={site} value={site} sx={{ fontWeight: 500, fontSize: "0.85rem" }}>
                  {site}
                </MenuItem>
              ))}
            </Select>
          </Box>
          <Profile />
        </Box>
      </ToolbarStyled>

      {/* Menu popup pour les notifications */}
      <Menu
        id="notif-menu"
        anchorEl={anchorNotif}
        open={Boolean(anchorNotif)}
        onClose={handleNotifClose}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        slotProps={{ paper: { sx: { width: 600, maxHeight: 400, p: 1 } } }}
      >
        {notifications.length === 0 ? (
          <MenuItem>
            <ListItemText primary="Aucune notification" />
          </MenuItem>
        ) : (
          notifications.map((notif) => (
            <MenuItem
              key={notif.id}
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                py: 1,
              }}
            >
              <ListItemText
                primary={notif.message}
                secondary={new Date(notif.createdAt).toLocaleString()}
                sx={{ pr: 2 }}
              />
              <IconButton
                onClick={() => markAsRead(notif.id)}
                size="small"
                sx={{ p: 0 }}
              >
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
