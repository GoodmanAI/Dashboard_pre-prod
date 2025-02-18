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
} from "@mui/material";
import PropTypes from "prop-types";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { IconBellRinging, IconMenu, IconX } from "@tabler/icons-react";
import Profile from "./Profile";

interface ItemType {
  toggleMobileSidebar: (event: React.MouseEvent<HTMLElement>) => void;
}

interface Notification {
  id: number;
  message: string;
  createdAt: string;
}

const Header = ({ toggleMobileSidebar }: ItemType) => {
  const { data: session, status } = useSession();
  const [anchorNotif, setAnchorNotif] = useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);

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

        <IconButton
          size="large"
          aria-label="show notifications"
          color="inherit"
          onClick={handleNotifClick}
        >
          <Badge variant={notifications.length > 0 ? "dot" : undefined} color="primary">
            <IconBellRinging size="21" stroke="1.5" />
          </Badge>
        </IconButton>

        <Box flexGrow={1} />
        <Stack spacing={1} direction="row" alignItems="center">
          {status === "unauthenticated" && (
            <Button
              variant="contained"
              component={Link}
              href="/authentication/signin"
              disableElevation
              color="primary"
            >
              Login
            </Button>
          )}
          {status === "authenticated" && <Profile />}
        </Stack>
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
              <IconButton onClick={() => markAsRead(notif.id)} size="small" sx={{ p: 0 }}>
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
