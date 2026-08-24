"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Send } from "@mui/icons-material";
import { io as ioClient, Socket } from "socket.io-client";

/**
 * Composant reutilisable : affichage complet d'un ticket + chat thread +
 * input pour ajouter un message.
 *
 * Utilise sur les 2 pages detail : /client/ticket/[id] et /admin/ticket/[id].
 * La page parente rend en plus les actions specifiques (changement de status
 * cote admin, info centre, etc.).
 *
 * Refresh live via socket.io ("ticket-updated" event emis par les endpoints
 * POST /messages et POST /status). Le composant refetch le ticket a chaque
 * event dont ticketId match.
 *
 * Prop `readOnly` : desactive l'input de message (utilise si le ticket est
 * CLOSED, ou par la partie qui ne peut pas repondre pour une autre raison).
 *
 * La couleur des bulles reflete "moi" (droite, teal) vs "autre" (gauche,
 * gris). L'identite "moi" est determinee par currentUserId (passe en prop).
 */

const BRAND_TEAL = "var(--accent)";
const BRAND_TEAL_DARK = "var(--accent-press)";
const BRAND_TEAL_SOFT = "#E6F7F3";
const NEUTRAL_BG = "#F1F5F9";
const TEXT_MAIN = "#1F3448";
const TEXT_MUTED = "#7A8FA6";

// ---- Types (miroir des reponses API) --------------------------------------

interface ApiUser {
  id: number;
  name: string | null;
  email: string;
  role?: string;
}

interface ApiTicketMessage {
  id: number;
  ticketId: number;
  authorId: number;
  body: string;
  createdAt: string;
  author: ApiUser;
}

interface ApiUserProduct {
  id: number;
  product: { name: string };
}

export interface ApiTicket {
  id: number;
  userId: number;
  createdById: number | null;
  userProductId: number | null;
  assignedToId: number | null;
  subject: string;
  message: string;
  contactEmail: string | null;
  status: "PENDING" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  user: ApiUser;
  createdBy: ApiUser | null;
  assignedTo: ApiUser | null;
  userProduct: ApiUserProduct | null;
  messages: ApiTicketMessage[];
  /**
   * Numero d'affichage local au proprietaire du ticket (1 = son 1er ticket).
   * Renvoye par le backend pour tous les fetch, mais affiche uniquement
   * cote client. L'admin ignore ce champ et utilise le id global.
   */
  displayNumber?: number;
}

interface Props {
  ticketId: number;
  currentUserId: number;
  /** Callback quand le ticket est loaded/refetch (pour que la page parent
   * ait acces aux info status/assignedTo pour rendre ses boutons). */
  onTicketLoaded?: (ticket: ApiTicket) => void;
  /**
   * Si true, affiche le displayNumber local (client) au lieu du id global.
   * Passer true depuis la page /client/ticket/[id], false depuis /admin.
   */
  useDisplayNumber?: boolean;
}

const STATUS_META: Record<
  ApiTicket["status"],
  { label: string; color: string; bg: string }
> = {
  PENDING: { label: "En attente", color: "#c2410c", bg: "rgba(234,88,12,0.15)" },
  IN_PROGRESS: { label: "En cours", color: "var(--accent-deep)", bg: "rgba(var(--accent-rgb), 0.15)" },
  RESOLVED: { label: "Resolu", color: "#166534", bg: "rgba(34,197,94,0.15)" },
  CLOSED: { label: "Ferme", color: "#4b5563", bg: "rgba(107,114,128,0.15)" },
};

function formatFullDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initialsFromName(user: ApiUser): string {
  const source = (user.name ?? user.email ?? "?").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || source[0].toUpperCase();
}

export default function TicketConversation({
  ticketId,
  currentUserId,
  onTicketLoaded,
  useDisplayNumber = false,
}: Props) {
  const [ticket, setTicket] = useState<ApiTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/tickets/${ticketId}`, { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setTicket(data.ticket);
      onTicketLoaded?.(data.ticket);
    } catch (err: any) {
      setError(err?.message ?? "Impossible de charger le ticket");
    } finally {
      setLoading(false);
    }
  }, [ticketId, onTicketLoaded]);

  useEffect(() => {
    load();
  }, [load]);

  // Websocket : refresh instantane quand ticket-updated est emis pour ce ticket
  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await fetch("/api/socket");
        if (cancelled) return;
        const socket = ioClient({ path: "/api/socket" });
        socketRef.current = socket;
        socket.on("ticket-updated", (payload: { ticketId: number }) => {
          if (!cancelled && payload?.ticketId === ticketId) {
            load();
          }
        });
      } catch {
        // Socket KO : le user devra rafraichir manuellement, degrade acceptable
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
  }, [ticketId, load]);

  // Scroll automatique vers le dernier message quand le ticket change
  const messageCount = ticket?.messages.length ?? 0;
  useEffect(() => {
    if (messageCount > 0 && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messageCount]);

  const canReply = ticket?.status !== "CLOSED";

  const handleSend = async () => {
    const body = messageDraft.trim();
    if (!body || sending || !canReply) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      setMessageDraft("");
      // load() sera trigger par le socket event, mais on force un refetch
      // immediat au cas ou le socket est KO
      load();
    } catch (err: any) {
      setSendError(err?.message ?? "Echec de l'envoi");
    } finally {
      setSending(false);
    }
  };

  const initialMessage = useMemo(() => {
    if (!ticket) return null;
    return {
      id: -1,
      body: ticket.message,
      createdAt: ticket.createdAt,
      author: ticket.createdBy ?? ticket.user,
      isInitial: true as const,
    };
  }, [ticket]);

  if (loading) {
    return (
      <Stack alignItems="center" sx={{ py: 6 }}>
        <CircularProgress sx={{ color: BRAND_TEAL }} />
      </Stack>
    );
  }
  if (error) {
    return (
      <Alert severity="error" sx={{ borderRadius: 2 }}>
        {error}
      </Alert>
    );
  }
  if (!ticket) return null;

  const statusMeta = STATUS_META[ticket.status];

  return (
    <Stack spacing={2}>
      {/* En-tete : subject + status + metadata */}
      <Box>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1, flexWrap: "wrap", rowGap: 1 }}>
          <Typography variant="h5" sx={{ color: TEXT_MAIN, fontWeight: 700 }}>
            #{useDisplayNumber && ticket.displayNumber ? ticket.displayNumber : ticket.id} — {ticket.subject}
          </Typography>
          <Chip
            size="small"
            label={statusMeta.label}
            sx={{ bgcolor: statusMeta.bg, color: statusMeta.color, fontWeight: 700 }}
          />
        </Stack>
        <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
          Ouvert le {formatFullDate(ticket.createdAt)}
          {ticket.userProduct && ` · Centre : ${ticket.userProduct.product.name} (#${ticket.userProduct.id})`}
          {ticket.assignedTo && ` · Pris en charge par ${ticket.assignedTo.name ?? ticket.assignedTo.email}`}
          {ticket.resolvedAt && ` · Resolu le ${formatFullDate(ticket.resolvedAt)}`}
          {ticket.closedAt && ` · Ferme le ${formatFullDate(ticket.closedAt)}`}
        </Typography>
      </Box>

      <Divider />

      {/* Message initial (description du ticket) */}
      {initialMessage && (
        <MessageBubble
          author={initialMessage.author}
          body={initialMessage.body}
          createdAt={initialMessage.createdAt}
          isCurrentUser={initialMessage.author.id === currentUserId}
          isInitial
        />
      )}

      {/* Thread des messages */}
      {ticket.messages.map((m) => (
        <MessageBubble
          key={m.id}
          author={m.author}
          body={m.body}
          createdAt={m.createdAt}
          isCurrentUser={m.authorId === currentUserId}
        />
      ))}
      <div ref={bottomRef} />

      {/* Input nouveau message */}
      {ticket.status === "CLOSED" ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          Ce ticket est ferme. Impossible d&apos;ajouter un message. Contactez
          le support pour rouvrir le ticket ou en creer un nouveau.
        </Alert>
      ) : (
        <Box sx={{ mt: 2 }}>
          <TextField
            multiline
            minRows={2}
            maxRows={8}
            fullWidth
            placeholder={ticket.status === "RESOLVED"
              ? "Ce ticket est marque comme resolu. Un nouveau message rouvre la conversation..."
              : "Votre reponse..."}
            value={messageDraft}
            onChange={(e) => setMessageDraft(e.target.value)}
            disabled={sending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
            helperText="Ctrl/Cmd + Entree pour envoyer"
          />
          {sendError && (
            <Alert severity="error" sx={{ mt: 1, borderRadius: 2 }}>
              {sendError}
            </Alert>
          )}
          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
            <Button
              variant="contained"
              endIcon={sending ? <CircularProgress size={16} sx={{ color: "#FFF" }} /> : <Send />}
              onClick={handleSend}
              disabled={sending || messageDraft.trim().length === 0}
              sx={{
                bgcolor: BRAND_TEAL,
                "&:hover": { bgcolor: BRAND_TEAL_DARK },
                minWidth: 140,
              }}
            >
              Envoyer
            </Button>
          </Stack>
        </Box>
      )}
    </Stack>
  );
}

// ---- MessageBubble : sous-composant local ---------------------------------

interface BubbleProps {
  author: ApiUser;
  body: string;
  createdAt: string;
  isCurrentUser: boolean;
  isInitial?: boolean;
}

function MessageBubble({ author, body, createdAt, isCurrentUser, isInitial }: BubbleProps) {
  const label = author.name ?? author.email;
  const isAdmin = author.role === "ADMIN" || author.role === "SUPER_ADMIN";
  return (
    <Stack
      direction="row"
      spacing={1.5}
      alignItems="flex-start"
      justifyContent={isCurrentUser ? "flex-end" : "flex-start"}
    >
      {!isCurrentUser && (
        <Avatar
          sx={{
            bgcolor: isAdmin ? BRAND_TEAL_DARK : "#94a3b8",
            width: 36,
            height: 36,
            fontSize: 14,
          }}
        >
          {initialsFromName(author)}
        </Avatar>
      )}
      <Box
        sx={{
          maxWidth: "70%",
          bgcolor: isCurrentUser ? BRAND_TEAL_SOFT : NEUTRAL_BG,
          borderRadius: 2,
          p: 1.5,
          borderLeft: isInitial ? `3px solid ${BRAND_TEAL}` : undefined,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: TEXT_MAIN }}>
            {label}
            {isAdmin && (
              <Chip
                label="Support"
                size="small"
                sx={{ ml: 0.75, height: 16, fontSize: 10, bgcolor: BRAND_TEAL_DARK, color: "#FFF" }}
              />
            )}
          </Typography>
          <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
            {formatFullDate(createdAt)}
          </Typography>
          {isInitial && (
            <Chip
              label="Message initial"
              size="small"
              sx={{ height: 16, fontSize: 10, bgcolor: BRAND_TEAL, color: "#FFF" }}
            />
          )}
        </Stack>
        <Typography
          variant="body2"
          sx={{
            color: TEXT_MAIN,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {body}
        </Typography>
      </Box>
      {isCurrentUser && (
        <Avatar
          sx={{
            bgcolor: BRAND_TEAL,
            width: 36,
            height: 36,
            fontSize: 14,
          }}
        >
          {initialsFromName(author)}
        </Avatar>
      )}
    </Stack>
  );
}
