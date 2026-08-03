"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  IconLifebuoy,
  IconMessageCircle2,
  IconPlus,
  IconSearch,
  IconInbox,
} from "@tabler/icons-react";
import { Close, Send } from "@mui/icons-material";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import { useCentre } from "@/app/context/CentreContext";

/**
 * Page Support (cote client) — refonte Lot C
 * ---------------------------------------------------------------------------
 * Une seule vue : header avec compteurs + filtres chips + recherche + liste
 * des tickets sous forme de cards. La creation d'un ticket se fait via un
 * dialog modal (bouton "Nouveau ticket" en tete).
 *
 * Design intentionnel :
 *   - Signature = timeline dot colore a gauche de chaque card selon status
 *   - Compteurs par status en chips cliquables (filtres) au lieu d'un Select
 *   - Empty state engageant avec CTA pour creer un premier ticket
 *   - Palette Neuracorp existante (teal) pour rester coherent avec le reste
 */

const BRAND_TEAL = "#48C8AF";
const BRAND_TEAL_DARK = "#3AB19B";
const BRAND_TEAL_SOFT = "#E6F7F3";
const TEXT_MAIN = "#1F3448";
const TEXT_MUTED = "#7A8FA6";
const CARD_BG = "#FFFFFF";
const PAGE_BG = "#FAFCFB";

type Status = "PENDING" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

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
  createdBy: { id: number; name: string | null; email: string } | null;
  assignedTo: { id: number; name: string | null; email: string } | null;
  _count?: { messages: number };
}

const STATUS_META: Record<
  Status,
  { label: string; color: string; bg: string; dotColor: string; sortOrder: number }
> = {
  PENDING: { label: "En attente", color: "#c2410c", bg: "rgba(234,88,12,0.12)", dotColor: "#EA580C", sortOrder: 0 },
  IN_PROGRESS: { label: "En cours", color: "#2a6f64", bg: "rgba(72,200,175,0.15)", dotColor: BRAND_TEAL, sortOrder: 1 },
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
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: days > 365 ? "numeric" : undefined });
}

export default function ClientSupportPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const { selectedUserId, selectedCentre } = useCentre();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: "success" | "error" }>({
    open: false, msg: "", sev: "success",
  });

  const asUserIdQuery = selectedUserId ? `?asUserId=${selectedUserId}` : "";

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/tickets${asUserIdQuery}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
    } catch (err: any) {
      setError(err?.message ?? "Impossible de charger les tickets.");
    } finally {
      setLoading(false);
    }
  }, [asUserIdQuery]);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/authentication/signin");
      return;
    }
    if (authStatus === "authenticated") load();
  }, [authStatus, load, router]);

  const counts = useMemo(() => {
    const c: Record<Status | "all", number> = {
      all: tickets.length, PENDING: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0,
    };
    for (const t of tickets) c[t.status]++;
    return c;
  }, [tickets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets
      .filter((t) => filterStatus === "all" || t.status === filterStatus)
      .filter((t) => !q || t.subject.toLowerCase().includes(q) || t.message.toLowerCase().includes(q))
      .sort((a, b) => {
        // Ouverts d'abord, puis par dernière activité (updatedAt)
        const s = STATUS_META[a.status].sortOrder - STATUS_META[b.status].sortOrder;
        if (s !== 0) return s;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [tickets, filterStatus, search]);

  const activeCount = counts.PENDING + counts.IN_PROGRESS;

  return (
    <PageContainer title="Support" description="Vos tickets support">
      <Box sx={{ bgcolor: PAGE_BG, minHeight: "calc(100vh - 100px)", mx: -3, px: 3, py: 3 }}>
        {/* HERO : compteur + CTA nouveau ticket */}
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems={{ xs: "stretch", md: "center" }}
          justifyContent="space-between"
          sx={{ mb: 3 }}
        >
          <Box>
            <Typography variant="h4" sx={{ color: TEXT_MAIN, fontWeight: 800, lineHeight: 1.1, mb: 0.5 }}>
              Support
            </Typography>
            <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
              {activeCount === 0 && counts.all === 0
                ? "Aucun ticket pour le moment."
                : activeCount === 0
                ? `Tous vos tickets sont traités (${counts.all} au total).`
                : `${activeCount} ticket${activeCount > 1 ? "s" : ""} en cours de traitement.`}
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<IconPlus size={18} />}
            onClick={() => setCreateOpen(true)}
            sx={{
              bgcolor: BRAND_TEAL,
              "&:hover": { bgcolor: BRAND_TEAL_DARK },
              px: 3,
              py: 1.2,
              fontWeight: 700,
              boxShadow: "0 4px 12px rgba(72,200,175,0.3)",
              textTransform: "none",
            }}
          >
            Nouveau ticket
          </Button>
        </Stack>

        {/* Filtres : chips par status + recherche */}
        <Card
          elevation={0}
          sx={{
            p: 2,
            mb: 2,
            border: "1px solid #e5e7eb",
            borderRadius: 2,
            bgcolor: CARD_BG,
          }}
        >
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
              <StatusFilterChip
                label="Tous"
                count={counts.all}
                active={filterStatus === "all"}
                onClick={() => setFilterStatus("all")}
                color={BRAND_TEAL}
              />
              {(Object.keys(STATUS_META) as Status[]).map((s) => (
                <StatusFilterChip
                  key={s}
                  label={STATUS_META[s].label}
                  count={counts[s]}
                  active={filterStatus === s}
                  onClick={() => setFilterStatus(s)}
                  color={STATUS_META[s].dotColor}
                />
              ))}
            </Stack>
            <TextField
              size="small"
              placeholder="Rechercher un ticket…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <IconSearch size={16} color={TEXT_MUTED} />
                  </InputAdornment>
                ),
              }}
              sx={{ maxWidth: 400 }}
            />
          </Stack>
        </Card>

        {/* Liste des tickets OU empty state */}
        {loading ? (
          <Stack alignItems="center" sx={{ py: 8 }}>
            <CircularProgress sx={{ color: BRAND_TEAL }} />
          </Stack>
        ) : error ? (
          <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>
        ) : tickets.length === 0 ? (
          <EmptyState onCreate={() => setCreateOpen(true)} />
        ) : filtered.length === 0 ? (
          <Card sx={{ p: 4, textAlign: "center", borderRadius: 2 }}>
            <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
              Aucun ticket ne correspond aux filtres.
            </Typography>
          </Card>
        ) : (
          <Stack spacing={1.5}>
            {filtered.map((t) => (
              <TicketRowCard
                key={t.id}
                ticket={t}
                onClick={() => router.push(`/client/ticket/${t.id}`)}
              />
            ))}
          </Stack>
        )}

        {/* Modal creation */}
        <CreateTicketDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(ticketId) => {
            setCreateOpen(false);
            setSnack({ open: true, msg: `Ticket #${ticketId} cree avec succes`, sev: "success" });
            load();
            // Optionnel : rediriger direct vers le detail
            // router.push(`/client/ticket/${ticketId}`);
          }}
          asUserIdQuery={asUserIdQuery}
        />

        <Snackbar
          open={snack.open}
          autoHideDuration={2800}
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          <Alert
            onClose={() => setSnack((s) => ({ ...s, open: false }))}
            severity={snack.sev}
            variant="filled"
            sx={{ width: "100%" }}
          >
            {snack.msg}
          </Alert>
        </Snackbar>
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
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: color,
              opacity: active ? 1 : 0.6,
            }}
          />
          <Typography component="span" sx={{ fontWeight: 600, fontSize: 13 }}>
            {label}
          </Typography>
          <Typography
            component="span"
            sx={{
              fontWeight: 700,
              fontSize: 12,
              color: active ? "#FFF" : TEXT_MUTED,
              bgcolor: active ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.05)",
              px: 0.8,
              py: 0.1,
              borderRadius: 6,
              minWidth: 20,
              textAlign: "center",
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
        transition: "all 0.15s",
        "&:hover": { bgcolor: active ? color : `${color}15` },
        px: 1,
      }}
    />
  );
}

function TicketRowCard({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  const meta = STATUS_META[ticket.status];
  const msgCount = ticket._count?.messages ?? 0;
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
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5, flexWrap: "wrap", rowGap: 0.5 }}>
            <Typography
              variant="caption"
              sx={{
                color: TEXT_MUTED,
                fontFamily: "monospace",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              #{ticket.id}
            </Typography>
            <Typography variant="subtitle1" sx={{ color: TEXT_MAIN, fontWeight: 700, lineHeight: 1.3 }}>
              {ticket.subject}
            </Typography>
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
            <Stack direction="row" spacing={0.5} alignItems="center">
              <IconMessageCircle2 size={14} color={TEXT_MUTED} />
              <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
                {msgCount} {msgCount === 1 ? "réponse" : "réponses"}
              </Typography>
            </Stack>
            <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
              Dernière activité : {relativeTime(ticket.updatedAt)}
            </Typography>
          </Stack>
        </Box>
        <Chip
          label={meta.label}
          size="small"
          sx={{
            bgcolor: meta.bg,
            color: meta.color,
            fontWeight: 700,
            flexShrink: 0,
          }}
        />
      </Stack>
    </Card>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card
      sx={{
        p: 6,
        textAlign: "center",
        borderRadius: 3,
        border: `2px dashed ${BRAND_TEAL_SOFT}`,
        bgcolor: "transparent",
      }}
    >
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          bgcolor: BRAND_TEAL_SOFT,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          mb: 2,
        }}
      >
        <IconInbox size={32} color={BRAND_TEAL} stroke={1.5} />
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 700, color: TEXT_MAIN, mb: 1 }}>
        Aucun ticket pour le moment
      </Typography>
      <Typography variant="body2" sx={{ color: TEXT_MUTED, mb: 3, maxWidth: 400, mx: "auto" }}>
        Si vous rencontrez un bug, avez une question ou une suggestion, créez un ticket support et notre équipe vous répondra.
      </Typography>
      <Button
        variant="contained"
        startIcon={<IconPlus size={18} />}
        onClick={onCreate}
        sx={{
          bgcolor: BRAND_TEAL,
          "&:hover": { bgcolor: BRAND_TEAL_DARK },
          px: 4,
          py: 1.2,
          textTransform: "none",
          fontWeight: 700,
        }}
      >
        Créer mon premier ticket
      </Button>
    </Card>
  );
}

function CreateTicketDialog({
  open, onClose, onCreated, asUserIdQuery,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (ticketId: number) => void;
  asUserIdQuery: string;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSubject("");
      setMessage("");
      setSubmitError(null);
    }
  }, [open]);

  const canSubmit = subject.trim().length >= 3 && message.trim().length >= 3 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/tickets${asUserIdQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      onCreated(data.ticket?.id ?? 0);
    } catch (err: any) {
      setSubmitError(err?.message ?? "Echec de la creation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ pb: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              bgcolor: BRAND_TEAL_SOFT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconLifebuoy size={20} color={BRAND_TEAL_DARK} stroke={1.8} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: TEXT_MAIN }}>
            Nouveau ticket
          </Typography>
        </Stack>
        <IconButton onClick={onClose} disabled={submitting} size="small">
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 3 }}>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="caption" sx={{ color: TEXT_MUTED, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11 }}>
              De quoi voulez-vous parler ?
            </Typography>
            <TextField
              autoFocus
              fullWidth
              variant="standard"
              placeholder="Ex : Impossible d'accéder à la page ordonnances"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={submitting}
              inputProps={{ maxLength: 200 }}
              sx={{
                mt: 0.5,
                "& .MuiInputBase-input": { fontSize: 18, fontWeight: 600, color: TEXT_MAIN, py: 1 },
              }}
            />
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: TEXT_MUTED, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11 }}>
              Décrivez le problème ou la demande
            </Typography>
            <TextField
              multiline
              minRows={5}
              maxRows={12}
              fullWidth
              placeholder="Plus vous êtes précis, plus rapidement nous pourrons vous aider. Étapes pour reproduire, captures d'écran, contexte…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={submitting}
              inputProps={{ maxLength: 10000 }}
              sx={{ mt: 0.5 }}
            />
          </Box>
          <Alert
            severity="info"
            icon={<IconLifebuoy size={18} />}
            sx={{ borderRadius: 2, "& .MuiAlert-icon": { color: BRAND_TEAL } }}
          >
            Un email sera envoyé au support neuracorp dès la création. Vous serez notifié dès qu&apos;un membre prend en charge votre ticket.
          </Alert>
          {submitError && (
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              {submitError}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose} disabled={submitting} sx={{ color: TEXT_MUTED, textTransform: "none" }}>
          Annuler
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit}
          endIcon={submitting ? <CircularProgress size={16} sx={{ color: "#FFF" }} /> : <Send />}
          sx={{
            bgcolor: BRAND_TEAL,
            "&:hover": { bgcolor: BRAND_TEAL_DARK },
            px: 3,
            textTransform: "none",
            fontWeight: 700,
            boxShadow: "0 4px 12px rgba(72,200,175,0.3)",
          }}
        >
          Créer le ticket
        </Button>
      </DialogActions>
    </Dialog>
  );
}
