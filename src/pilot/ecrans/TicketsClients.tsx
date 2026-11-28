"use client";

import type React from "react";

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
import { BRAND_TEAL, BRAND_TEAL_SOFT } from "@/lib/jetons";
import { JETONS, MOUVEMENT } from "@/pilot/jetons";
import { EnTete } from "@/pilot/components/Bloc";
import { ORDRE_PRODUITS, PRODUITS, type SlugProduit } from "@/lib/produits";
import { produitDuTicket } from "@/lib/supportProduit";

/** Pilot pose sa coquille et le titre de l'onglet : la page n'a rien à ajouter. */
function PageContainer({ children }: { title?: string; description?: string; children: React.ReactNode }) {
  return <>{children}</>;
}

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
 *
 * Deux montages depuis le 28/10/2026 : la console (`/admin/ticket`), tous produits,
 * avec un filtre par produit ; et le support d'un produit
 * (`/client/c/{userId}/{produit}/support`), qui ne montre que ses tickets et garde
 * ses couleurs.
 */

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
  RESOLVED: { label: "Résolu", color: "#166534", bg: "rgba(34,197,94,0.15)", dotColor: "#22C55E", sortOrder: 2 },
  CLOSED: { label: "Fermé", color: "#4b5563", bg: "rgba(107,114,128,0.15)", dotColor: "#94a3b8", sortOrder: 3 },
};

function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "à l'instant";
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

export default function TicketsClients({
  produit,
  cheminTicket,
  entete,
}: {
  /** Le produit regarde ; absent, la console : tous les produits. */
  produit?: SlugProduit;
  cheminTicket: (ticketId: number) => string;
  /** Ce que la page pose à droite du titre (les vues de la page Support). */
  entete?: React.ReactNode;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [filterAssignment, setFilterAssignment] = useState<"all" | "mine" | "unassigned">("all");
  const [search, setSearch] = useState("");
  const [filterProduit, setFilterProduit] = useState<SlugProduit | "all">("all");
  const currentAdminId = session?.user?.id ? Number(session.user.id) : null;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        produit ? `/api/admin/tickets?produit=${produit}` : "/api/admin/tickets",
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
    } catch (err: any) {
      setError(err?.message ?? "Impossible de charger les tickets.");
    } finally {
      setLoading(false);
    }
  }, [produit]);

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
      .filter(
        (t) =>
          filterProduit === "all" ||
          produitDuTicket(t.userProduct?.product.name) === filterProduit
      )
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
  }, [tickets, filterStatus, filterProduit, filterAssignment, search, currentAdminId]);

  return (
    <PageContainer title="Support" description="Gestion des tickets clients">
      <Box>
        <Box sx={{ mb: 2.5 }}><EnTete
          titre={produit ? `Demandes des clients, ${PRODUITS[produit].libelle}` : "Demandes des clients"}
          sousTitre={
            counts.all === 0
              ? "Aucun ticket ouvert."
              : `${counts.PENDING + counts.IN_PROGRESS} ticket${counts.PENDING + counts.IN_PROGRESS > 1 ? "s" : ""} actif${counts.PENDING + counts.IN_PROGRESS > 1 ? "s" : ""}, ${counts.all} au total`
          }
        >{entete}</EnTete></Box>

        {/* Filtres */}
        <Card sx={{ p: 2, mb: 2 }}>
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

            {/* Filtre par produit : la console seule, le support d'un produit est deja filtre */}
            {!produit && (
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                <AssignmentFilterChip
                  label="Tous les produits"
                  count={counts.all}
                  active={filterProduit === "all"}
                  onClick={() => setFilterProduit("all")}
                />
                {ORDRE_PRODUITS.map((slug) => (
                  <AssignmentFilterChip
                    key={slug}
                    label={PRODUITS[slug].libelle}
                    count={
                      tickets.filter((t) => produitDuTicket(t.userProduct?.product.name) === slug)
                        .length
                    }
                    active={filterProduit === slug}
                    onClick={() => setFilterProduit(slug)}
                  />
                ))}
              </Stack>
            )}

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
                    <IconSearch size={16} color={JETONS.secondaire} />
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
          <Alert severity="error">{error}</Alert>
        ) : tickets.length === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
          <Card sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="body2" sx={{ color: JETONS.secondaire }}>
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
                onClick={() => router.push(cheminTicket(t.id))}
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
              fontWeight: 600, fontSize: 12,
              color: active ? "#FFF" : JETONS.secondaire,
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
        color: active ? "#FFF" : JETONS.encre,
        border: `1px solid ${active ? color : JETONS.filet}`,
        height: 32,
        "&:hover": { bgcolor: active ? color : JETONS.survolLigne },
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
              fontWeight: 600, fontSize: 12,
              color: active ? "#FFF" : highlight ? "#c2410c" : JETONS.secondaire,
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
        bgcolor: active ? JETONS.encre : "transparent",
        color: active ? "#FFF" : JETONS.encre,
        border: `1px solid ${active ? JETONS.encre : JETONS.filet}`,
        height: 30,
        "&:hover": { bgcolor: active ? JETONS.encre : JETONS.survolLigne },
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
        // Le statut se lit sur la pastille de droite : pas de liseré de couleur sur le bord.
        transition: `transform ${MOUVEMENT.appui} ${MOUVEMENT.courbe}, box-shadow ${MOUVEMENT.rapide} ease`,
        // Soulèvement au survol : souris seulement (sur une tablette, il resterait collé
        // après le toucher). L'appui enfonce un peu la carte, au doigt comme à la souris.
        "@media (hover: hover) and (pointer: fine)": {
          "&:hover": {
            transform: "translateY(-1px)",
            boxShadow: JETONS.ombreSurvol,
          },
        },
        "&:active": { transform: "scale(0.98)" },
        p: 2.5,
      }}
    >
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "flex-start" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5, flexWrap: "wrap", rowGap: 0.5 }}>
            <Typography variant="caption" sx={{ color: JETONS.secondaire, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              #{ticket.id}
            </Typography>
            <Typography variant="subtitle1" sx={{ color: JETONS.encre, lineHeight: 1.3 }}>
              {ticket.subject}
            </Typography>
            {isMine && (
              <Chip label="Assigné à vous" size="small" color="primary" />
            )}
          </Stack>
          <Typography
            variant="body2"
            sx={{
              color: JETONS.secondaire,
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
              <Avatar sx={{ width: 20, height: 20, bgcolor: JETONS.tertiaire, fontSize: 10, fontWeight: 600 }}>
                {userInitials(ticket.user)}
              </Avatar>
              <Typography variant="caption" sx={{ color: JETONS.secondaire }}>
                {ticket.user.name ?? ticket.user.email}
              </Typography>
            </Stack>
            {/* Sans affiliation : un ticket d'avant le support par produit, ouvert depuis LyraeTalk. */}
            <Typography variant="caption" sx={{ color: JETONS.secondaire }}>
              · {PRODUITS[produitDuTicket(ticket.userProduct?.product.name)].libelle}
            </Typography>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <IconMessageCircle2 size={14} color={JETONS.secondaire} />
              <Typography variant="caption" sx={{ color: JETONS.secondaire }}>
                {msgCount}
              </Typography>
            </Stack>
            <Typography variant="caption" sx={{ color: JETONS.secondaire }}>
              {relativeTime(ticket.updatedAt)}
            </Typography>
          </Stack>
        </Box>
        <Chip
          label={meta.label}
          size="small"
          sx={{ bgcolor: meta.bg, color: meta.color, flexShrink: 0 }}
        />
      </Stack>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card sx={{ p: 6, textAlign: "center" }}>
      <Box
        sx={{
          width: 72, height: 72, borderRadius: "50%", bgcolor: BRAND_TEAL_SOFT,
          display: "inline-flex", alignItems: "center", justifyContent: "center", mb: 2,
        }}
      >
        <IconInbox size={32} color={BRAND_TEAL} stroke={1.5} />
      </Box>
      <Typography variant="h6" sx={{ color: JETONS.encre, mb: 1 }}>
        Aucun ticket
      </Typography>
      <Typography variant="body2" sx={{ color: JETONS.secondaire, maxWidth: 400, mx: "auto" }}>
        Les tickets créés par les clients apparaîtront ici. Le premier ticket recevra un email de notification.
      </Typography>
    </Card>
  );
}
