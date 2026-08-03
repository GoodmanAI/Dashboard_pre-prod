"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  Menu,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { IconLifebuoy } from "@tabler/icons-react";
import { io as ioClient, Socket } from "socket.io-client";

/**
 * Bell notification globale dans le header, dediee aux tickets support.
 *
 * Fonctionnement :
 *   - Fetch initial GET /api/notification/get-unread au mount + poll 60s
 *   - Websocket subscribe "ticket-updated" -> refetch instantane
 *     (emis par les endpoints POST /messages et POST /status)
 *   - Affiche l'icone support (IconLifebuoy, meme icon que l'item nav
 *     "Support" pour coherence visuelle) + badge count si > 0
 *   - Clic -> popover avec liste des notifs (max 50), plus recentes en tete
 *   - Chaque item de notif est cliquable :
 *       -> POST /mark-read
 *       -> navigate vers /client/ticket/[id] (CLIENT) ou /admin/ticket/[id] (ADMIN)
 *   - Bouton "Tout marquer comme lu" en tete du popover
 *
 * Silencieux si le user n'est pas authentifie (rend rien).
 */

const BRAND_TEAL = "#48C8AF";
const TEXT_MAIN = "#1F3448";
const TEXT_MUTED = "#7A8FA6";
const NEUTRAL_BG = "#F1F5F9";

const POLL_INTERVAL_MS = 60_000;

interface Notification {
  id: number;
  message: string;
  isRead: boolean;
  createdAt: string;
  ticket: {
    id: number;
    subject: string;
    createdAt: string;
  } | null;
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "a l'instant";
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `il y a ${Math.floor(seconds / 3600)} h`;
  const days = Math.floor(seconds / 86400);
  if (days < 30) return `il y a ${days} j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function NotificationBell() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const isOpen = Boolean(anchorEl);
  const unreadCount = notifications.length;
  const isAdmin = session?.user?.role === "ADMIN";

  const load = useCallback(async () => {
    if (status !== "authenticated") return;
    try {
      const res = await fetch("/api/notification/get-unread", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    } catch {
      // Silencieux : la cloche disparait si le fetch echoue au lieu de casser l'UI
    }
  }, [status]);

  // Fetch initial + poll 60s (fallback si websocket KO)
  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  // Websocket subscribe : refresh instantane sur ticket-updated
  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    (async () => {
      try {
        await fetch("/api/socket");
        if (cancelled) return;
        const socket = ioClient({ path: "/api/socket" });
        socketRef.current = socket;
        socket.on("ticket-updated", () => {
          if (!cancelled) load();
        });
      } catch {
        // WS KO : poll 60s prend le relais
      }
    })();
    return () => {
      cancelled = true;
      if (socketRef.current) {
        socketRef.current.off("ticket-updated");
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [status, load]);

  const handleClickBell = (e: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(e.currentTarget);
  };
  const handleClose = () => setAnchorEl(null);

  const handleClickNotif = async (notif: Notification) => {
    // Mark read cote serveur (optimistic : retire de la liste immediatement)
    setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
    try {
      await fetch("/api/notification/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: notif.id }),
      });
    } catch {
      // Silencieux : au pire la notif reste "unread" en base, refetch prochain
    }
    handleClose();
    if (notif.ticket?.id) {
      router.push(
        isAdmin
          ? `/admin/ticket/${notif.ticket.id}`
          : `/client/ticket/${notif.ticket.id}`
      );
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    // Optimistic
    setNotifications([]);
    try {
      await fetch("/api/notification/mark-all-read", { method: "POST" });
    } catch {
      // Refetch dans 60s si echec
    } finally {
      setMarkingAll(false);
      handleClose();
    }
  };

  // Ne rien rendre si pas authentifie (evite le badge sur pages publiques)
  if (status !== "authenticated") return null;

  return (
    <>
      <Tooltip
        title={
          unreadCount > 0
            ? `${unreadCount} notification${unreadCount > 1 ? "s" : ""} non lue${unreadCount > 1 ? "s" : ""}`
            : "Aucune notification"
        }
      >
        <IconButton
          onClick={handleClickBell}
          size="large"
          aria-label="Notifications support"
          sx={{
            color: unreadCount > 0 ? BRAND_TEAL : TEXT_MUTED,
            transition: "color 0.2s",
            "&:hover": { color: BRAND_TEAL, bgcolor: "rgba(72,200,175,0.08)" },
          }}
        >
          <Badge
            badgeContent={unreadCount > 99 ? "99+" : unreadCount || undefined}
            color="error"
            overlap="circular"
            sx={{
              "& .MuiBadge-badge": {
                fontSize: 10,
                height: 18,
                minWidth: 18,
                fontWeight: 700,
              },
            }}
          >
            <IconLifebuoy size={22} stroke={1.5} />
          </Badge>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={isOpen}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{
          sx: {
            width: 400,
            maxHeight: 500,
            overflow: "hidden",
            borderRadius: 2,
            boxShadow: "0 12px 32px rgba(31, 52, 72, 0.15)",
            border: "1px solid rgba(72,200,175,0.15)",
          },
        }}
        MenuListProps={{ sx: { p: 0 } }}
      >
        {/* Header : titre + Tout marquer comme lu */}
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            bgcolor: "#FAFCFB",
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: TEXT_MAIN }}>
            Support
            {unreadCount > 0 && (
              <Typography
                component="span"
                sx={{
                  ml: 1,
                  fontSize: 12,
                  color: TEXT_MUTED,
                  fontWeight: 500,
                }}
              >
                {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
              </Typography>
            )}
          </Typography>
          {unreadCount > 0 && (
            <Button
              size="small"
              onClick={handleMarkAllRead}
              disabled={markingAll}
              sx={{
                color: BRAND_TEAL,
                textTransform: "none",
                fontSize: 12,
                fontWeight: 600,
                minWidth: 0,
                px: 1,
                "&:hover": { bgcolor: "rgba(72,200,175,0.08)" },
              }}
            >
              Tout marquer lu
            </Button>
          )}
        </Box>

        {/* Liste des notifs OU empty state */}
        {notifications.length === 0 ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <IconLifebuoy size={40} color={TEXT_MUTED} stroke={1.2} style={{ opacity: 0.4 }} />
            <Typography variant="body2" sx={{ mt: 1.5, color: TEXT_MUTED }}>
              Aucune nouvelle notification
            </Typography>
          </Box>
        ) : (
          <Box sx={{ overflowY: "auto", maxHeight: 420 }}>
            {notifications.map((notif, i) => (
              <Box
                key={notif.id}
                onClick={() => handleClickNotif(notif)}
                sx={{
                  px: 2,
                  py: 1.5,
                  cursor: notif.ticket ? "pointer" : "default",
                  borderBottom: i < notifications.length - 1 ? "1px solid #f1f5f9" : "none",
                  transition: "background-color 0.15s",
                  "&:hover": notif.ticket
                    ? { bgcolor: "rgba(72,200,175,0.06)" }
                    : undefined,
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  {/* Dot indicateur non-lu */}
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      bgcolor: BRAND_TEAL,
                      mt: 0.8,
                      flexShrink: 0,
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {notif.ticket && (
                      <Typography
                        variant="caption"
                        sx={{
                          color: BRAND_TEAL,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          fontSize: 10,
                          display: "block",
                          mb: 0.25,
                        }}
                      >
                        Ticket #{notif.ticket.id}
                      </Typography>
                    )}
                    <Typography
                      variant="body2"
                      sx={{
                        color: TEXT_MAIN,
                        lineHeight: 1.4,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {notif.message}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: TEXT_MUTED, fontSize: 11 }}
                    >
                      {formatRelativeTime(notif.createdAt)}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            ))}
          </Box>
        )}
      </Menu>
    </>
  );
}
