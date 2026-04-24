"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Card,
  CardContent,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Chip,
  TextField,
  InputAdornment,
  Stack,
} from "@mui/material";
import {
  IconTicket,
  IconSearch,
  IconClock,
  IconCircleCheck,
  IconProgress,
  IconMail,
  IconUser,
} from "@tabler/icons-react";
import { format } from "date-fns";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";

/**
 * Page admin : gestion des tickets de support client.
 * - Liste filtrable (client, statut, recherche texte sur sujet)
 * - Card cliquable ouvrant une Dialog détail + update de statut
 */

type Status = "PENDING" | "IN_PROGRESS" | "CLOSED";

interface Ticket {
  id: number;
  subject: string;
  message: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  user: {
    id: number;
    name: string;
    email: string;
  };
}

interface ClientLite {
  id: number;
  name: string;
}

/** Configuration visuelle par statut (label FR, couleur, icône). */
const STATUS_CFG: Record<
  Status,
  { label: string; color: string; bg: string; Icon: any }
> = {
  PENDING: { label: "En attente", color: "#b45309", bg: "#fef3c7", Icon: IconClock },
  IN_PROGRESS: { label: "En cours", color: "#2a6f64", bg: "rgba(72,200,175,0.15)", Icon: IconProgress },
  CLOSED: { label: "Fermé", color: "#6b7280", bg: "#f3f4f6", Icon: IconCircleCheck },
};

/** Ordre de tri : pending > in progress > closed. */
const STATUS_ORDER: Record<Status, number> = {
  PENDING: 0,
  IN_PROGRESS: 1,
  CLOSED: 2,
};

function StatusChip({ status, size = "small" }: { status: Status; size?: "small" | "medium" }) {
  const cfg = STATUS_CFG[status];
  const Icon = cfg.Icon;
  return (
    <Chip
      size={size}
      icon={<Icon size={14} />}
      label={cfg.label}
      sx={{
        bgcolor: cfg.bg,
        color: cfg.color,
        fontWeight: 600,
        "& .MuiChip-icon": { color: cfg.color },
      }}
    />
  );
}

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [updateStatus, setUpdateStatus] = useState<Status>("PENDING");
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);

  const [filterClient, setFilterClient] = useState<number | "all">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | Status>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const [ticketsRes, clientsRes] = await Promise.all([
          fetch("/api/admin/tickets"),
          fetch("/api/admin/clients"),
        ]);
        const ticketsData = await ticketsRes.json();
        if (ticketsRes.ok) {
          setTickets(ticketsData.tickets || []);
        } else {
          setError(ticketsData.error || "Erreur lors du chargement des tickets.");
        }
        if (clientsRes.ok) {
          const clientsData = await clientsRes.json();
          setClients(clientsData);
        }
      } catch {
        setError("Erreur inattendue lors du chargement.");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const counts = useMemo(
    () => ({
      total: tickets.length,
      pending: tickets.filter((t) => t.status === "PENDING").length,
      inProgress: tickets.filter((t) => t.status === "IN_PROGRESS").length,
      closed: tickets.filter((t) => t.status === "CLOSED").length,
    }),
    [tickets]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets
      .filter((t) => (filterClient === "all" ? true : t.user.id === filterClient))
      .filter((t) => (filterStatus === "all" ? true : t.status === filterStatus))
      .filter((t) => {
        if (!q) return true;
        return (
          t.subject.toLowerCase().includes(q) ||
          t.user.name.toLowerCase().includes(q) ||
          t.user.email.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  }, [tickets, filterClient, filterStatus, search]);

  const handleUpdateStatus = async () => {
    if (!selectedTicket) return;
    try {
      const res = await fetch("/api/admin/tickets/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: selectedTicket.id, status: updateStatus }),
      });
      const data = await res.json();
      if (res.ok) {
        setUpdateSuccess(data.message || "Statut mis à jour.");
        setTickets((prev) =>
          prev.map((t) => (t.id === selectedTicket.id ? { ...t, status: updateStatus } : t))
        );
        setSelectedTicket({ ...selectedTicket, status: updateStatus });
      } else {
        setUpdateError(data.error || "Échec de la mise à jour.");
      }
    } catch {
      setUpdateError("Erreur inattendue lors de la mise à jour.");
    }
  };

  return (
    <PageContainer title="Tickets" description="Support client">
      <Box>
        <SectionHeader
          title="Tickets"
          subtitle="Gestion des demandes de support"
          actions={
            <Stack direction="row" spacing={1}>
              <Chip
                icon={<IconTicket size={14} />}
                label={`${counts.total} total`}
                size="small"
                sx={{ bgcolor: "rgba(72,200,175,0.15)", color: "#2a6f64", fontWeight: 600 }}
              />
              <Chip
                label={`${counts.pending} en attente`}
                size="small"
                sx={{ bgcolor: "#fef3c7", color: "#b45309", fontWeight: 600 }}
              />
              <Chip
                label={`${counts.inProgress} en cours`}
                size="small"
                sx={{ bgcolor: "rgba(72,200,175,0.15)", color: "#2a6f64", fontWeight: 600 }}
              />
            </Stack>
          }
        />

        {/* Filtres */}
        <Card sx={{ p: 2.5, mb: 3 }} elevation={1}>
          <Box
            sx={{
              display: "flex",
              gap: 2,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <TextField
              placeholder="Rechercher par sujet, client…"
              variant="outlined"
              size="small"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ width: 320 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <IconSearch size={18} />
                  </InputAdornment>
                ),
              }}
            />

            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Client</InputLabel>
              <Select
                value={filterClient}
                label="Client"
                onChange={(e) => setFilterClient(e.target.value as number | "all")}
                MenuProps={{ PaperProps: { style: { maxHeight: 280 } } }}
              >
                <MenuItem value="all">Tous</MenuItem>
                {clients.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Statut</InputLabel>
              <Select
                value={filterStatus}
                label="Statut"
                onChange={(e) => setFilterStatus(e.target.value as "all" | Status)}
              >
                <MenuItem value="all">Tous</MenuItem>
                <MenuItem value="PENDING">En attente</MenuItem>
                <MenuItem value="IN_PROGRESS">En cours</MenuItem>
                <MenuItem value="CLOSED">Fermé</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Card>

        {loading ? (
          <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : tickets.length === 0 ? (
          <Card sx={{ p: 4, textAlign: "center" }}>
            <IconTicket size={40} color="#9ca3af" style={{ opacity: 0.6 }} />
            <Typography sx={{ mt: 1 }} color="text.secondary">
              Aucun ticket pour l'instant.
            </Typography>
          </Card>
        ) : filtered.length === 0 ? (
          <Card sx={{ p: 3 }}>
            <Typography color="text.secondary">
              Aucun ticket ne correspond aux filtres.
            </Typography>
          </Card>
        ) : (
          <Stack spacing={1.5}>
            {filtered.map((ticket) => (
              <Card
                key={ticket.id}
                elevation={1}
                onClick={() => {
                  setSelectedTicket(ticket);
                  setUpdateStatus(ticket.status);
                  setUpdateError(null);
                  setUpdateSuccess(null);
                }}
                sx={{
                  cursor: "pointer",
                  transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease",
                  border: "1px solid transparent",
                  "&:hover": {
                    transform: "translateY(-1px)",
                    boxShadow: "0 6px 18px rgba(72,200,175,0.12)",
                    borderColor: "rgba(72,200,175,0.3)",
                  },
                }}
              >
                <CardContent sx={{ "&:last-child": { pb: 2 } }}>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 2,
                      mb: 1,
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle1" fontWeight={700} noWrap>
                        {ticket.subject}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mt: 0.5,
                          display: "-webkit-box",
                          WebkitLineClamp: 1,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {ticket.message}
                      </Typography>
                    </Box>
                    <StatusChip status={ticket.status} />
                  </Box>

                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                      flexWrap: "wrap",
                      mt: 1,
                      color: "text.secondary",
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <IconUser size={14} />
                      <Typography variant="caption">{ticket.user.name}</Typography>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <IconMail size={14} />
                      <Typography variant="caption">{ticket.user.email}</Typography>
                    </Box>
                    <Box sx={{ flex: 1 }} />
                    <Typography variant="caption">
                      {format(new Date(ticket.createdAt), "dd/MM/yyyy HH:mm")}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}

        {/* Dialog détail */}
        <Dialog
          open={Boolean(selectedTicket)}
          onClose={() => setSelectedTicket(null)}
          maxWidth="sm"
          fullWidth
          PaperProps={{ sx: { borderRadius: 2 } }}
        >
          {selectedTicket && (
            <>
              <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>{selectedTicket.subject}</Box>
                  <StatusChip status={selectedTicket.status} />
                </Box>
              </DialogTitle>
              <DialogContent dividers>
                <Typography variant="body1" sx={{ whiteSpace: "pre-wrap", mb: 2 }}>
                  {selectedTicket.message}
                </Typography>

                <Divider sx={{ my: 2 }} />

                <Stack spacing={0.75} sx={{ mb: 2 }}>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                      Client
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {selectedTicket.user.name}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                      Email
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {selectedTicket.user.email}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                      Créé le
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {format(new Date(selectedTicket.createdAt), "dd/MM/yyyy HH:mm")}
                    </Typography>
                  </Box>
                </Stack>

                <Divider sx={{ my: 2 }} />

                <Typography
                  variant="overline"
                  sx={{ color: "#2a6f64", fontWeight: 700, letterSpacing: 1 }}
                >
                  Mettre à jour le statut
                </Typography>
                <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                  <Select
                    value={updateStatus}
                    onChange={(e) => setUpdateStatus(e.target.value as Status)}
                  >
                    <MenuItem value="PENDING">En attente</MenuItem>
                    <MenuItem value="IN_PROGRESS">En cours</MenuItem>
                    <MenuItem value="CLOSED">Fermé</MenuItem>
                  </Select>
                </FormControl>

                {updateError && <Alert severity="error" sx={{ mt: 2 }}>{updateError}</Alert>}
                {updateSuccess && <Alert severity="success" sx={{ mt: 2 }}>{updateSuccess}</Alert>}
              </DialogContent>
              <DialogActions sx={{ px: 3, py: 2 }}>
                <Button onClick={() => setSelectedTicket(null)} variant="text">
                  Fermer
                </Button>
                <Button
                  onClick={handleUpdateStatus}
                  variant="contained"
                  disabled={updateStatus === selectedTicket.status}
                  sx={{
                    bgcolor: "#48C8AF",
                    fontWeight: 600,
                    "&:hover": { bgcolor: "#3BA992" },
                  }}
                >
                  Mettre à jour
                </Button>
              </DialogActions>
            </>
          )}
        </Dialog>
      </Box>
    </PageContainer>
  );
}
