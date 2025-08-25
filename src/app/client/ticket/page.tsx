"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Tabs,
  Tab,
  Typography,
  CircularProgress,
  TextField,
  Button,
  Alert,
  Card,
  CardContent,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import { orange, green, red } from "@mui/material/colors";
import { useCentre } from "@/app/context/CentreContext";

// ---- Types ----
interface Ticket {
  id: number;
  subject: string;
  message: string;
  status: "PENDING" | "IN_PROGRESS" | "CLOSED";
  createdAt: string;
  updatedAt: string;
}

// ---- UI helpers ----
const StatusDot = ({ status }: { status: Ticket["status"] }) => {
  let color: string = orange[500];
  if (status === "IN_PROGRESS") color = green[500];
  else if (status === "CLOSED") color = red[500];
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

// ---- Création ticket (centre-aware) ----
const TicketForm = ({ onSuccess }: { onSuccess: () => void }) => {
  const { selectedUserId } = useCentre(); // ← centre-aware
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const url = selectedUserId
        ? `/api/tickets?asUserId=${selectedUserId}`
        : `/api/tickets`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessMessage(data.message || "Ticket créé avec succès.");
        setSubject("");
        setMessage("");
        onSuccess(); // bascule sur l’onglet “Mes tickets”
      } else {
        setErrorMessage(data.error || "Erreur lors de la création du ticket.");
      }
    } catch (error) {
      setErrorMessage("Erreur inattendue lors de la création du ticket.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
      {errorMessage && <Alert severity="error" sx={{ mb: 2 }}>{errorMessage}</Alert>}
      {successMessage && <Alert severity="success" sx={{ mb: 2 }}>{successMessage}</Alert>}

      <TextField
        label="Sujet"
        fullWidth
        margin="normal"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        required
        sx={{
          "& label.Mui-focused": { color: "#48C8AF" },
          "& .MuiOutlinedInput-root": {
            "&.Mui-focused fieldset": { borderColor: "#48C8AF" },
          },
        }}
      />
      <TextField
        label="Message"
        fullWidth
        margin="normal"
        multiline
        rows={5}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
        sx={{
          "& label.Mui-focused": { color: "#48C8AF" },
          "& .MuiOutlinedInput-root": {
            "&.Mui-focused fieldset": { borderColor: "#48C8AF" },
          },
        }}
      />
      <Button
        type="submit"
        variant="contained"
        disabled={loading}
        sx={{ backgroundColor: "#48C8AF", "&:hover": { backgroundColor: "#3bb39d" }, textTransform: "none" }}
      >
        {loading ? "Envoi en cours…" : "Envoyer"}
      </Button>
    </Box>
  );
};

// ---- Liste des tickets (centre-aware) ----
const TicketsList = () => {
  const { selectedUserId, selectedCentre } = useCentre(); // ← centre-aware
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  useEffect(() => {
    async function fetchTickets() {
      setLoading(true);
      setError(null);
      try {
        const url = selectedUserId
          ? `/api/tickets?asUserId=${selectedUserId}`
          : `/api/tickets`;
        const res = await fetch(url);
        const data = await res.json();
        if (res.ok) {
          setTickets(data.tickets || []);
        } else {
          setError(data.error || "Erreur lors de la récupération des tickets.");
        }
      } catch (err) {
        setError("Erreur inattendue lors de la récupération des tickets.");
      } finally {
        setLoading(false);
      }
    }
    fetchTickets();
  }, [selectedUserId]); // ← refetch si changement de centre

  if (loading)
    return (
      <CircularProgress
        sx={{ "& .MuiCircularProgress-svg": { color: "#48C8AF" } }}
      />
    );
  if (error) return <Alert severity="error">{error}</Alert>;
  if (tickets.length === 0)
    return (
      <Typography>
        {selectedCentre ? "Aucun ticket pour ce centre." : "Aucun ticket trouvé."}
      </Typography>
    );

  return (
    <Box>
      {tickets.map((ticket) => (
        <Card
          key={ticket.id}
          sx={{
            mb: 2,
            cursor: "pointer",
            backgroundColor: "#f9f9f9",
            boxShadow: 2,
            "&:hover": { boxShadow: 6 },
          }}
          onClick={() => setSelectedTicket(ticket)}
        >
          <CardContent>
            <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
              <StatusDot status={ticket.status} />
              <Typography variant="h6">{ticket.subject}</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              {truncate(ticket.message, 50)}
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
              <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
                Créé le:{" "}
                <span>
                  {new Date(selectedTicket.createdAt).toLocaleDateString()} à{" "}
                  {new Date(selectedTicket.createdAt).toLocaleTimeString()}
                </span>
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => setSelectedTicket(null)}
                sx={{
                  backgroundColor: "#48C8AF",
                  color: "white",
                  "&:hover": { backgroundColor: "#3bb39d" },
                  textTransform: "none",
                }}
              >
                Fermer
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

// ---- Page ----
const TicketsPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState(0);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    }
  }, [status, router]);

  return (
    <Box sx={{ px: 4, py: 3, bgcolor: "#f5f5f5", minHeight: "100vh" }}>
      {/* Bandeau d'en-tête */}
      <Box sx={{ backgroundColor: "#f5f5f5", py: 3, px: 2, mb: 4 }}>
        <Typography variant="h2" fontWeight="bold" sx={{ mb: 1 }}>
          Support
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Pour toute demande de changement d&apos;informations de compte (nom, email, mot de passe),
          veuillez contacter<br /> notre service client à l&apos;adresse&nbsp;
          <strong>support@neuracorp.ai</strong>.
        </Typography>
      </Box>

      {/* Contenu */}
      <Box sx={{ backgroundColor: "#fff", borderRadius: 2, boxShadow: 1, p: 3 }}>
        <Typography variant="h5" fontWeight="bold" gutterBottom>
          Tickets
        </Typography>

        <Tabs
          value={tab}
          onChange={(e, newVal) => setTab(newVal)}
          sx={{
            mb: 3,
            "& .MuiTab-root.Mui-selected": { color: "#48C8AF" },
            "& .MuiTabs-indicator": { backgroundColor: "#48C8AF" },
          }}
        >
          <Tab label="Créer un ticket" />
          <Tab label="Mes tickets" />
        </Tabs>

        {tab === 0 && <TicketForm onSuccess={() => setTab(1)} />}
        {tab === 1 && <TicketsList />}
      </Box>
    </Box>
  );
};

export default TicketsPage;
