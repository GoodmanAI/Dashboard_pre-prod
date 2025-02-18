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

const StatusDot = ({ status }: { status: Ticket["status"] }) => {
  let color: string = orange[500];
  if (status === "IN_PROGRESS") {
    color = green[500];
  } else if (status === "CLOSED") {
    color = red[500];
  }
  return (
    <Box
      sx={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        backgroundColor: color,
        display: "inline-block",
        mr: 1,
      }}
    />
  );
};

const truncate = (text: string, length: number) =>
  text.length > length ? text.slice(0, length) + "..." : text;

const AdminTicketsPage = () => {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [updateStatus, setUpdateStatus] = useState<"PENDING" | "IN_PROGRESS" | "CLOSED">("PENDING");
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
  const [filterClient, setFilterClient] = useState<number | "all">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "PENDING" | "IN_PROGRESS" | "CLOSED">("all");
  const [clients, setClients] = useState<{ id: number; name: string }[]>([]);

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
      } catch (err) {
        setError("Unexpected error while fetching tickets.");
      } finally {
        setLoading(false);
      }
    }

    async function fetchClients() {
      try {
        const res = await fetch("/api/admin/clients");
        const data = await res.json();
        if (res.ok) {
          setClients(data);
        }
      } catch (err) {
        console.error("Error fetching clients:", err);
      }
    }

    fetchTickets();
    fetchClients();
  }, []);

  const filteredTickets = tickets.filter((ticket) => {
    const clientMatch = filterClient === "all" ? true : ticket.user.id === filterClient;
    const statusMatch = filterStatus === "all" ? true : ticket.status === filterStatus;
    return clientMatch && statusMatch;
  });

  const statusOrder = { "PENDING": 0, "IN_PROGRESS": 1, "CLOSED": 2 };
  const sortedTickets = [...filteredTickets].sort(
    (a, b) => statusOrder[a.status] - statusOrder[b.status]
  );

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
        // Actualiser la liste locale
        const updatedTickets = tickets.map((ticket) =>
          ticket.id === selectedTicket.id ? { ...ticket, status: updateStatus } : ticket
        );
        setTickets(updatedTickets);
        setSelectedTicket({ ...selectedTicket, status: updateStatus });
      } else {
        setUpdateError(data.error || "Failed to update ticket status.");
      }
    } catch (err) {
      setUpdateError("Unexpected error while updating ticket status.");
    }
  };

  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (tickets.length === 0) return <Typography>No tickets found.</Typography>;

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" gutterBottom align="center">
        Tickets - Administration
      </Typography>
      {/* Filtres */}
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
        <FormControl sx={{ minWidth: 150 }}>
          <InputLabel id="client-filter-label">Client</InputLabel>
          <Select
            labelId="client-filter-label"
            value={filterClient}
            label="Client"
            onChange={(e) => setFilterClient(e.target.value as number | "all")}
            MenuProps={{
                PaperProps: {
                  style: {
                    maxHeight: 200,
                    overflowY: "auto",
                  },
                },
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
              setFilterStatus(e.target.value as "all" | "PENDING" | "IN_PROGRESS" | "CLOSED")
            }
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="PENDING">Pending</MenuItem>
            <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
            <MenuItem value="CLOSED">Closed</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Légende des statuts */}
      <Box sx={{ mt: 2, mb: 3 }}>
        <Typography variant="caption" sx={{ display: "flex", alignItems: "center", mb: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: orange[500], mr: 1 }} /> Pending
        </Typography>
        <Typography variant="caption" sx={{ display: "flex", alignItems: "center", mb: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: green[500], mr: 1 }} /> In Progress
        </Typography>
        <Typography variant="caption" sx={{ display: "flex", alignItems: "center" }}>
          <Box sx={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: red[500], mr: 1 }} /> Closed
        </Typography>
      </Box>
      
      {/* Liste des tickets */}
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
      {/* Détails du ticket dans une popup */}
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
                    setUpdateStatus(e.target.value as "PENDING" | "IN_PROGRESS" | "CLOSED")
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
