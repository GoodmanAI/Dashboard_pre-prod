"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Alert,
  Avatar,
  Box,
  Card,
  Chip,
  CircularProgress,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  IconInbox,
  IconMessageCircle2,
  IconSearch,
  IconUser,
} from "@tabler/icons-react";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";

/**
 * Page Support (cote admin) — refonte Lot C
 * ---------------------------------------------------------------------------
 * Vision globale des tickets pour tous les clients. Filtres :
 *   - Chips par status (Tous / En attente / En cours / Resolu / Ferme)
 *   - Recherche texte (sujet + email/nom client)
 *   - Chip "Non assignes" et "Assignes a moi" pour trier par charge de travail
 *
 * Meme design que la page client mais avec une colonne supplementaire sur
 * chaque card indiquant le client + son centre. Clic = ouvre la page detail
 * /admin/ticket/[id] (deja livree au Lot B).
 */

const BRAND_TEAL = "var(--accent)";
const BRAND_TEAL_SOFT = "#E6F7F3";
const TEXT_MAIN = "#1F3448";
const TEXT_MUTED = "#7A8FA6";
const PAGE_BG = "#FAFCFB";

type Status = "PENDING" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

interface UserLite {
  id: number;
  name: string | null;
  email: string;
}

interface Ticket {
  id: number;
  subject: string;
  message: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  userProductId: number | null;
  assignedToId: number | null;
  user: UserLite;
  createdBy: UserLite | null;
  assignedTo: UserLite | null;
  userProduct: { id: number; product: { name: string } } | null;
  _count?: { messages: number };
}

const STATUS_META: Record<
  Status,
  { label: string; color: string; bg: string; dotColor: string; sortOrder: number }
> = {
  PENDING: { label: "En attente", color: "#c2410c", bg: "rgba(234,88,12,0.12)", dotColor: "#EA580C", sortOrder: 0 },
  IN_PROGRESS: { label: "En cours", color: "var(--accent-deep)", bg: "rgba(var(--accent-rgb), 0.15)", dotColor: BRAND_TEAL, sortOrder: 1 },
  RESOLVED: { label: "Resolu", color: "#166534", bg: "rgba(34,197,94,0.15)", dotColor: "#22C55E", sortOrder: 2 },
  CLOSED: { label: "Ferme", color: "#4b5563", bg: "rgba(107,114,128,0.15)", dotColor: "#94a3b8", sortOrder: 3 },
};

function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "a l'instant";
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `il y a ${Math.floor(seconds / 3600)} h`;
  const days = Math.floor(seconds / 86400);
  if (days < 7) return `il y a ${days} j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function userInitials(u: UserLite): string {
  const src = (u.name ?? u.email ?? "?").trim();
  const parts = src.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || src[0]?.toUpperCase() || "?";
}

export default function AdminSupportPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [filterAssignment, setFilterAssignment] = useState<"all" | "mine" | "unassigned">("all");
  const [search, setSearch] = useState("");
  const currentAdminId = session?.user?.id ? Number(session.user.id) : null;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/tickets", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
    } catch (err: any) {
      setError(err?.message ?? "Impossible de charger les tickets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<Status | "all", number> = {
      all: tickets.length, PENDING: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0,
    };
    for (const t of tickets) c[t.status]++;
    return c;
  }, [tickets]);

  const mineCount = useMemo(
    () => (currentAdminId ? tickets.filter((t) => t.assignedToId === currentAdminId).length : 0),
    [tickets, currentAdminId]
  );
  const unassignedCount = useMemo(
    () => tickets.filter((t) => !t.assignedToId).length,
    [tickets]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets
      .filter((t) => filterStatus === "all" || t.status === filterStatus)
      .filter((t) => {
        if (filterAssignment === "mine") return t.assignedToId === currentAdminId;
        if (filterAssignment === "unassigned") return !t.assignedToId;
        return true;
      })
      .filter((t) =>
        !q ||
        t.subject.toLowerCase().includes(q) ||
        t.message.toLowerCase().includes(q) ||
        (t.user.name ?? "").toLowerCase().includes(q) ||
        t.user.email.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const s = STATUS_META[a.status].sortOrder - STATUS_META[b.status].sortOrder;
        if (s !== 0) return s;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [tickets, filterStatus, filterAssignment, search, currentAdminId]);

  return (
    <PageContainer title="Support" description="Gestion des tickets clients">
      <Box sx={{ bgcolor: PAGE_BG, minHeight: "calc(100vh - 100px)", mx: -3, px: 3, py: 3 }}>
        {/* HERO */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" sx={{ color: TEXT_MAIN, fontWeight: 800, lineHeight: 1.1, mb: 0.5 }}>
            Support
          </Typography>
          <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
            {counts.all === 0
              ? "Aucun ticket ouvert."
              : `${counts.PENDING + counts.IN_PROGRESS} ticket${(counts.PENDING + counts.IN_PROGRESS) > 1 ? "s" : ""} actif${(counts.PENDING + counts.IN_PROGRESS) > 1 ? "s" : ""} · ${counts.all} au total`}
          </Typography>
        </Box>

        {/* Filtres */}
        <Card
          elevation={0}
          sx={{ p: 2, mb: 2, border: "1px solid #e5e7eb", borderRadius: 2, bgcolor: "#FFF" }}
        >
          <Stack spacing={2}>
            {/* Filtres par status */}
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
              <StatusFilterChip
                label="Tous" count={counts.all}
                active={filterStatus === "all"}
                onClick={() => setFilterStatus("all")}
                color={BRAND_TEAL}
              />
              {(Object.keys(STATUS_META) as Status[]).map((s) => (
                <StatusFilterChip
                  key={s} label={STATUS_META[s].label} count={counts[s]}
                  active={filterStatus === s}
                  onClick={() => setFilterStatus(s)}
                  color={STATUS_META[s].dotColor}
                />
              ))}
            </Stack>

            {/* Filtres par assignation */}
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
              <AssignmentFilterChip
                label="Tous"
                count={counts.all}
                active={filterAssignment === "all"}
                onClick={() => setFilterAssignment("all")}
              />
              <AssignmentFilterChip
                label="Non assignés"
                count={unassignedCount}
                active={filterAssignment === "unassigned"}
                onClick={() => setFilterAssignment("unassigned")}
                highlight={unassignedCount > 0 && filterAssignment !== "unassigned"}
              />
              <AssignmentFilterChip
                label="Assignés à moi"
                count={mineCount}
                active={filterAssignment === "mine"}
                onClick={() => setFilterAssignment("mine")}
              />
            </Stack>

            <TextField
              size="small"
              placeholder="Rechercher (sujet, message, nom, email)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <IconSearch size={16} color={TEXT_MUTED} />
                  </InputAdornment>
                ),
              }}
              sx={{ maxWidth: 480 }}
            />
          </Stack>
        </Card>

        {/* Liste */}
        {loading ? (
          <Stack alignItems="center" sx={{ py: 8 }}>
            <CircularProgress sx={{ color: BRAND_TEAL }} />
          </Stack>
        ) : error ? (
          <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>
        ) : tickets.length === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
          <Card sx={{ p: 4, textAlign: "center", borderRadius: 2 }}>
            <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
              Aucun ticket ne correspond aux filtres.
            </Typography>
          </Card>
        ) : (
          <Stack spacing={1.5}>
            {filtered.map((t) => (
              <AdminTicketCard
                key={t.id}
                ticket={t}
                currentAdminId={currentAdminId}
                onClick={() => router.push(`/admin/ticket/${t.id}`)}
              />
            ))}
          </Stack>
        )}
      </Box>
    </PageContainer>
  );
}

// ============================================================================
// Sous-composants
// ============================================================================

function StatusFilterChip({
  label, count, active, onClick, color,
}: {
  label: string; count: number; active: boolean; onClick: () => void; color: string;
}) {
  return (
    <Chip
      onClick={onClick}
      label={
        <Stack direction="row" spacing={0.75} alignItems="center">
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color, opacity: active ? 1 : 0.6 }} />
          <Typography component="span" sx={{ fontWeight: 600, fontSize: 13 }}>{label}</Typography>
          <Typography
            component="span"
            sx={{
              fontWeight: 700, fontSize: 12,
              color: active ? "#FFF" : TEXT_MUTED,
              bgcolor: active ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.05)",
              px: 0.8, py: 0.1, borderRadius: 6, minWidth: 20, textAlign: "center",
            }}
          >
            {count}
          </Typography>
        </Stack>
      }
      sx={{
        bgcolor: active ? color : "transparent",
        color: active ? "#FFF" : TEXT_MAIN,
        border: `1px solid ${active ? color : "#e5e7eb"}`,
        height: 32,
        "&:hover": { bgcolor: active ? color : `${color}15` },
        px: 1,
      }}
    />
  );
}

function AssignmentFilterChip({
  label, count, active, onClick, highlight = false,
}: {
  label: string; count: number; active: boolean; onClick: () => void; highlight?: boolean;
}) {
  return (
    <Chip
      onClick={onClick}
      label={
        <Stack direction="row" spacing={0.75} alignItems="center">
          <Typography component="span" sx={{ fontWeight: 600, fontSize: 13 }}>{label}</Typography>
          <Typography
            component="span"
            sx={{
              fontWeight: 700, fontSize: 12,
              color: active ? "#FFF" : highlight ? "#c2410c" : TEXT_MUTED,
              bgcolor: active ? "rgba(255,255,255,0.25)" : highlight ? "rgba(234,88,12,0.15)" : "rgba(0,0,0,0.05)",
              px: 0.8, py: 0.1, borderRadius: 6, minWidth: 20, textAlign: "center",
            }}
          >
            {count}
          </Typography>
        </Stack>
      }
      variant={active ? "filled" : "outlined"}
      sx={{
        bgcolor: active ? "#1F3448" : "transparent",
        color: active ? "#FFF" : TEXT_MAIN,
        border: `1px solid ${active ? "#1F3448" : "#e5e7eb"}`,
        height: 30,
        "&:hover": { bgcolor: active ? "#1F3448" : "#f5f5f5" },
      }}
    />
  );
}

function AdminTicketCard({
  ticket, currentAdminId, onClick,
}: {
  ticket: Ticket; currentAdminId: number | null; onClick: () => void;
}) {
  const meta = STATUS_META[ticket.status];
  const msgCount = ticket._count?.messages ?? 0;
  const isMine = ticket.assignedToId === currentAdminId;
  return (
    <Card
      onClick={onClick}
      sx={{
        cursor: "pointer",
        borderLeft: `3px solid ${meta.dotColor}`,
        borderRadius: 2,
        transition: "all 0.2s",
        "&:hover": {
          transform: "translateY(-1px)",
          boxShadow: "0 6px 20px rgba(31,52,72,0.08)",
          borderLeftWidth: 4,
        },
        p: 2.5,
      }}
    >
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "flex-start" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5, flexWrap: "wrap", rowGap: 0.5 }}>
            <Typography variant="caption" sx={{ color: TEXT_MUTED, fontFamily: "monospace", fontSize: 11, fontWeight: 600 }}>
              #{ticket.id}
            </Typography>
            <Typography variant="subtitle1" sx={{ color: TEXT_MAIN, fontWeight: 700, lineHeight: 1.3 }}>
              {ticket.subject}
            </Typography>
            {isMine && (
              <Chip label="Assigné à vous" size="small" sx={{ height: 20, fontSize: 10, bgcolor: BRAND_TEAL_SOFT, color: "var(--accent-deep)", fontWeight: 700 }} />
            )}
          </Stack>
          <Typography
            variant="body2"
            sx={{
              color: TEXT_MUTED,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              mb: 1,
            }}
          >
            {ticket.message}
          </Typography>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
            {/* Client */}
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Avatar sx={{ width: 20, height: 20, bgcolor: "#94a3b8", fontSize: 10, fontWeight: 700 }}>
                {userInitials(ticket.user)}
              </Avatar>
              <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
                {ticket.user.name ?? ticket.user.email}
              </Typography>
            </Stack>
            {ticket.userProduct && (
              <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
                · {ticket.userProduct.product.name}
              </Typography>
            )}
            <Stack direction="row" spacing={0.5} alignItems="center">
              <IconMessageCircle2 size={14} color={TEXT_MUTED} />
              <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
                {msgCount}
              </Typography>
            </Stack>
            <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
              {relativeTime(ticket.updatedAt)}
            </Typography>
          </Stack>
        </Box>
        <Chip
          label={meta.label}
          size="small"
          sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: 700, flexShrink: 0 }}
        />
      </Stack>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card sx={{ p: 6, textAlign: "center", borderRadius: 3, border: `2px dashed ${BRAND_TEAL_SOFT}`, bgcolor: "transparent" }}>
      <Box
        sx={{
          width: 72, height: 72, borderRadius: "50%", bgcolor: BRAND_TEAL_SOFT,
          display: "inline-flex", alignItems: "center", justifyContent: "center", mb: 2,
        }}
      >
        <IconInbox size={32} color={BRAND_TEAL} stroke={1.5} />
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 700, color: TEXT_MAIN, mb: 1 }}>
        Aucun ticket
      </Typography>
      <Typography variant="body2" sx={{ color: TEXT_MUTED, maxWidth: 400, mx: "auto" }}>
        Les tickets créés par les clients apparaîtront ici. Le premier ticket recevra un email de notification.
      </Typography>
    </Card>
  );
}
