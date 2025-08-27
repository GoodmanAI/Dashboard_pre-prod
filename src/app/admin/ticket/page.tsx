"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
} from "@mui/material";
import { orange, green, red } from "@mui/material/colors";

/**
 * Page d'administration des tickets.
 * - Récupère les tickets et la liste des clients.
 * - Offre des filtres par client et par statut.
 * - Permet la mise à jour du statut d'un ticket via un dialogue.
 */

/* ------------------------------------ */
/* Types & constantes de présentation   */
/* ------------------------------------ */

interface Ticket {
  id: number;
  subject: string;
  message: string;
  status: "PENDING" | "IN_PROGRESS" | "CLOSED";
  createdAt: string;
  updatedAt: string;
  user: {
    id: number;
    name: string;
    email: string;
  };
}

const STATUS_COLOR: Record<Ticket["status"], string> = {
  PENDING: orange[500],
  IN_PROGRESS: green[500],
  CLOSED: red[500],
};

/* ------------------------------------ */
/* Composants atomiques                 */
/* ------------------------------------ */

/** Pastille colorée indiquant le statut d’un ticket. */
const StatusDot = ({ status }: { status: Ticket["status"] }) => (
  <Box
    sx={{
      width: 12,
      height: 12,
      borderRadius: "50%",
      backgroundColor: STATUS_COLOR[status],
      display: "inline-block",
      mr: 1,
    }}
  />
);

/** Tronque un texte à une longueur maximale. */
const truncate = (text: string, length: number) =>
  text.length > length ? `${text.slice(0, length)}...` : text;

/* ------------------------------------ */
/* Composant principal                  */
/* ------------------------------------ */

const AdminTicketsPage = () => {
  const router = useRouter();

  // État : données et cycle de vie
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [clients, setClients] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // État : sélection et édition
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [updateStatus, setUpdateStatus] =
    useState<"PENDING" | "IN_PROGRESS" | "CLOSED">("PENDING");
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);

  // État : filtres
  const [filterClient, setFilterClient] = useState<number | "all">("all");
  const [filterStatus, setFilterStatus] =
    useState<"all" | "PENDING" | "IN_PROGRESS" | "CLOSED">("all");

  /* ------------------------------------ */
  /* Effets : chargement initial          */
  /* ------------------------------------ */

  useEffect(() => {
    async function fetchTickets() {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/tickets");
        const data = await res.json();
        if (res.ok) {
          setTickets(data.tickets || []);
        } else {
          setError(data.error || "Error fetching tickets.");
        }
      } catch {
        setError("Unexpected error while fetching tickets.");
      } finally {
        setLoading(false);
      }
    }

    async function fetchClients() {
      try {
        const res = await fetch("/api/admin/clients");
        const data = await res.json();
        if (res.ok) setClients(data);
      } catch (err) {
        // Erreur non bloquante : les filtres clients ne seront pas proposés.
        console.error("Error fetching clients:", err);
      }
    }

    fetchTickets();
    fetchClients();
  }, []);

  /* ------------------------------------ */
  /* Sélecteurs dérivés (filtres/ordre)   */
  /* ------------------------------------ */

  const filteredTickets = tickets.filter((ticket) => {
    const clientMatch =
      filterClient === "all" ? true : ticket.user.id === filterClient;
    const statusMatch =
      filterStatus === "all" ? true : ticket.status === filterStatus;
    return clientMatch && statusMatch;
  });

  const statusOrder = { PENDING: 0, IN_PROGRESS: 1, CLOSED: 2 } as const;

  const sortedTickets = [...filteredTickets].sort(
    (a, b) => statusOrder[a.status] - statusOrder[b.status]
  );

  /* ------------------------------------ */
  /* Actions                              */
  /* ------------------------------------ */

  /** Met à jour le statut du ticket sélectionné côté serveur puis côté client. */
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
        setUpdateSuccess(data.message || "Ticket status updated successfully.");
        const updatedTickets = tickets.map((t) =>
          t.id === selectedTicket.id ? { ...t, status: updateStatus } : t
        );
        setTickets(updatedTickets);
        setSelectedTicket({ ...selectedTicket, status: updateStatus });
      } else {
        setUpdateError(data.error || "Failed to update ticket status.");
      }
    } catch {
      setUpdateError("Unexpected error while updating ticket status.");
    }
  };

  /* ------------------------------------ */
  /* États intermédiaires (UI)            */
  /* ------------------------------------ */

  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (tickets.length === 0) return <Typography>No tickets found.</Typography>;

  /* ------------------------------------ */
  /* Rendu                                */
  /* ------------------------------------ */

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" gutterBottom align="center">
        Tickets - Administration
      </Typography>

      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
        <FormControl sx={{ minWidth: 150 }}>
          <InputLabel id="client-filter-label">Client</InputLabel>
          <Select
            labelId="client-filter-label"
            value={filterClient}
            label="Client"
            onChange={(e) => setFilterClient(e.target.value as number | "all")}
            MenuProps={{
              PaperProps: { style: { maxHeight: 200, overflowY: "auto" } },
            }}
          >
            <MenuItem value="all">All</MenuItem>
            {clients.map((client) => (
              <MenuItem key={client.id} value={client.id}>
                {client.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 150 }}>
          <InputLabel id="status-filter-label">Status</InputLabel>
          <Select
            labelId="status-filter-label"
            value={filterStatus}
            label="Status"
            onChange={(e) =>
              setFilterStatus(
                e.target.value as "all" | "PENDING" | "IN_PROGRESS" | "CLOSED"
              )
            }
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="PENDING">Pending</MenuItem>
            <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
            <MenuItem value="CLOSED">Closed</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Box sx={{ mt: 2, mb: 3 }}>
        <Typography variant="caption" sx={{ display: "flex", alignItems: "center", mb: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: orange[500], mr: 1 }} />
          Pending
        </Typography>
        <Typography variant="caption" sx={{ display: "flex", alignItems: "center", mb: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: green[500], mr: 1 }} />
          In Progress
        </Typography>
        <Typography variant="caption" sx={{ display: "flex", alignItems: "center" }}>
          <Box sx={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: red[500], mr: 1 }} />
          Closed
        </Typography>
      </Box>

      {sortedTickets.map((ticket) => (
        <Card
          key={ticket.id}
          sx={{
            mb: 2,
            cursor: "pointer",
            backgroundColor: "#f9f9f9",
            boxShadow: 2,
            "&:hover": { boxShadow: 6 },
          }}
          onClick={() => {
            setSelectedTicket(ticket);
            setUpdateStatus(ticket.status);
            setUpdateError(null);
            setUpdateSuccess(null);
          }}
        >
          <CardContent>
            <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
              <StatusDot status={ticket.status} />
              <Typography variant="h6">{ticket.subject}</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              {truncate(ticket.message, 50)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Client: {ticket.user.name}
            </Typography>
          </CardContent>
        </Card>
      ))}

      <Dialog
        open={Boolean(selectedTicket)}
        onClose={() => setSelectedTicket(null)}
        maxWidth="sm"
        fullWidth
      >
        {selectedTicket && (
          <>
            <DialogTitle>{selectedTicket.subject}</DialogTitle>
            <DialogContent dividers>
              <Typography variant="body1" gutterBottom>
                {selectedTicket.message}
              </Typography>
              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ fontWeight: "bold", mb: 1 }}>
                Statut: {selectedTicket.status}
              </Typography>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel id="update-status-label">Mettre à jour le statut</InputLabel>
                <Select
                  labelId="update-status-label"
                  value={updateStatus}
                  label="Mettre à jour le statut"
                  onChange={(e) =>
                    setUpdateStatus(
                      e.target.value as "PENDING" | "IN_PROGRESS" | "CLOSED"
                    )
                  }
                >
                  <MenuItem value="PENDING">Pending</MenuItem>
                  <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
                  <MenuItem value="CLOSED">Closed</MenuItem>
                </Select>
              </FormControl>

              {updateError && <Alert severity="error" sx={{ mb: 2 }}>{updateError}</Alert>}
              {updateSuccess && <Alert severity="success" sx={{ mb: 2 }}>{updateSuccess}</Alert>}

              <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
                Créé le:{" "}
                <span>
                  {new Date(selectedTicket.createdAt).toLocaleDateString()} à{" "}
                  {new Date(selectedTicket.createdAt).toLocaleTimeString()}
                </span>
              </Typography>
              <Typography variant="subtitle2" sx={{ fontWeight: "bold", mt: 1 }}>
                Client: {selectedTicket.user.name} ({selectedTicket.user.email})
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleUpdateStatus} variant="contained" color="primary">
                Mettre à jour
              </Button>
              <Button onClick={() => setSelectedTicket(null)}>Fermer</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default AdminTicketsPage;
