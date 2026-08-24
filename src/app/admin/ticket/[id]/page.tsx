"use client";

import { useCallback, useEffect, useState } from "react";
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
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  ArrowBack,
  CheckCircle,
  Lock,
  LockOpen,
  PlayArrow,
} from "@mui/icons-material";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import TicketConversation, { ApiTicket } from "@/components/tickets/TicketConversation";

/**
 * Page detail ticket cote admin : /admin/ticket/[id]
 *
 * Meme conversation qu'en client, plus un panneau lateral avec :
 *   - Info client (nom, email, centre)
 *   - Actions de status : Prendre en charge / Marquer resolu / Fermer / Reouvrir
 *   - Note optionnelle envoyee dans le mail au client quand on marque
 *     resolu ou ferme (visible dans le mail sous "Note du support")
 *
 * Le composant TicketConversation gere le fil + le refresh websocket.
 * Cette page ecoute onTicketLoaded pour connaitre l'etat actuel et adapter
 * les boutons disponibles.
 */

const BRAND_TEAL = "var(--accent)";
const BRAND_TEAL_DARK = "var(--accent-press)";

type TargetStatus = "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "PENDING";

interface StatusActionDef {
  target: TargetStatus;
  label: string;
  Icon: typeof PlayArrow;
  color: string;
  needsNote: boolean;
  helpText: string;
}

const ACTIONS_BY_CURRENT_STATUS: Record<ApiTicket["status"], StatusActionDef[]> = {
  PENDING: [
    {
      target: "IN_PROGRESS",
      label: "Prendre en charge",
      Icon: PlayArrow,
      color: "var(--accent-deep)",
      needsNote: false,
      helpText: "Vous serez assigne au ticket. Le client est notifie.",
    },
    {
      target: "RESOLVED",
      label: "Marquer resolu",
      Icon: CheckCircle,
      color: "#22C55E",
      needsNote: true,
      helpText: "Le client recoit un mail avec votre note (facultative).",
    },
    {
      target: "CLOSED",
      label: "Fermer sans reponse",
      Icon: Lock,
      color: "#6b7280",
      needsNote: true,
      helpText: "Ferme le ticket sans le resoudre. Le client recoit un mail.",
    },
  ],
  IN_PROGRESS: [
    {
      target: "RESOLVED",
      label: "Marquer resolu",
      Icon: CheckCircle,
      color: "#22C55E",
      needsNote: true,
      helpText: "Le client recoit un mail avec votre note (facultative).",
    },
    {
      target: "CLOSED",
      label: "Fermer",
      Icon: Lock,
      color: "#6b7280",
      needsNote: true,
      helpText: "Le client recoit un mail.",
    },
    {
      target: "PENDING",
      label: "Remettre en attente",
      Icon: PlayArrow,
      color: "#c2410c",
      needsNote: false,
      helpText: "Retire la prise en charge, le ticket redevient PENDING.",
    },
  ],
  RESOLVED: [
    {
      target: "IN_PROGRESS",
      label: "Rouvrir (en cours)",
      Icon: LockOpen,
      color: "var(--accent-deep)",
      needsNote: false,
      helpText: "Le ticket redevient IN_PROGRESS. Vous restez assigne.",
    },
    {
      target: "CLOSED",
      label: "Archiver definitivement",
      Icon: Lock,
      color: "#6b7280",
      needsNote: false,
      helpText: "Ferme le ticket. Plus de messages possibles.",
    },
  ],
  CLOSED: [
    {
      target: "PENDING",
      label: "Rouvrir",
      Icon: LockOpen,
      color: "#c2410c",
      needsNote: false,
      helpText: "Le ticket redevient PENDING, l'assignation est reset.",
    },
  ],
};

interface Props {
  params: { id: string };
}

export default function AdminTicketDetailPage({ params }: Props) {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [ticket, setTicket] = useState<ApiTicket | null>(null);
  const [pendingAction, setPendingAction] = useState<StatusActionDef | null>(null);
  const [note, setNote] = useState("");
  const [applying, setApplying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: "success" | "error" }>({
    open: false, msg: "", sev: "success",
  });

  useEffect(() => {
    const parsed = parseInt(params.id, 10);
    if (Number.isFinite(parsed)) setTicketId(parsed);
  }, [params.id]);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/authentication/signin");
    }
  }, [authStatus, router]);

  const onTicketLoaded = useCallback((loaded: ApiTicket) => {
    setTicket(loaded);
  }, []);

  const applyStatusChange = async () => {
    if (!pendingAction || !ticketId) return;
    setApplying(true);
    setActionError(null);
    try {
      const body: any = { status: pendingAction.target };
      if (pendingAction.needsNote && note.trim().length > 0) {
        body.note = note.trim();
      }
      const res = await fetch(`/api/tickets/${ticketId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      setSnack({ open: true, msg: `Ticket marque comme ${pendingAction.label.toLowerCase()}`, sev: "success" });
      setPendingAction(null);
      setNote("");
      // ticket refetch trigger par le websocket ticket-updated
    } catch (err: any) {
      setActionError(err?.message ?? "Echec de la mise a jour");
    } finally {
      setApplying(false);
    }
  };

  if (authStatus !== "authenticated" || !session?.user?.id || !ticketId) {
    return (
      <PageContainer title="Ticket" description="Detail admin">
        <Box />
      </PageContainer>
    );
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return (
      <PageContainer title="Ticket" description="Detail admin">
        <Alert severity="error">Accès refusé — reservé aux administrateurs.</Alert>
      </PageContainer>
    );
  }

  const currentUserId = Number(session.user.id);
  const actions = ticket ? ACTIONS_BY_CURRENT_STATUS[ticket.status] : [];

  return (
    <PageContainer title="Ticket" description="Detail admin">
      <Stack spacing={2}>
        <Box>
          <Button
            startIcon={<ArrowBack />}
            onClick={() => router.push("/admin/ticket")}
            sx={{ color: BRAND_TEAL }}
          >
            Retour aux tickets
          </Button>
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 320px" },
            gap: 2,
            alignItems: "start",
          }}
        >
          {/* Colonne principale : conversation */}
          <Card sx={{ p: { xs: 2, sm: 3 } }}>
            <TicketConversation
              ticketId={ticketId}
              currentUserId={currentUserId}
              onTicketLoaded={onTicketLoaded}
            />
          </Card>

          {/* Colonne laterale : info client + actions status */}
          <Stack spacing={2} sx={{ position: { md: "sticky" }, top: { md: 90 } }}>
            <Card sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: "#1F3448" }}>
                Client
              </Typography>
              {ticket ? (
                <Stack spacing={0.5}>
                  <Typography variant="body2" fontWeight={700}>
                    {ticket.user.name ?? "—"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {ticket.user.email}
                  </Typography>
                  {ticket.contactEmail && ticket.contactEmail !== ticket.user.email && (
                    <>
                      <Divider sx={{ my: 1 }} />
                      <Typography variant="caption" color="text.secondary">
                        Email de contact ticket
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, color: BRAND_TEAL_DARK }}
                      >
                        {ticket.contactEmail}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
                        C&apos;est cette adresse qui reçoit les notifications de clôture.
                      </Typography>
                    </>
                  )}
                  {ticket.userProduct && (
                    <>
                      <Divider sx={{ my: 1 }} />
                      <Typography variant="caption" color="text.secondary">
                        Centre
                      </Typography>
                      <Typography variant="body2">
                        {ticket.userProduct.product.name} <span style={{ color: "#7A8FA6" }}>#{ticket.userProduct.id}</span>
                      </Typography>
                    </>
                  )}
                  {ticket.assignedTo && (
                    <>
                      <Divider sx={{ my: 1 }} />
                      <Typography variant="caption" color="text.secondary">
                        Pris en charge par
                      </Typography>
                      <Typography variant="body2">
                        {ticket.assignedTo.name ?? ticket.assignedTo.email}
                        {ticket.assignedToId === currentUserId && (
                          <Chip label="vous" size="small" sx={{ ml: 0.5, height: 16, fontSize: 10 }} />
                        )}
                      </Typography>
                    </>
                  )}
                </Stack>
              ) : (
                <CircularProgress size={20} sx={{ color: BRAND_TEAL }} />
              )}
            </Card>

            <Card sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: "#1F3448" }}>
                Actions
              </Typography>
              {ticket ? (
                <Stack spacing={1}>
                  {actions.map((a) => (
                    <Button
                      key={a.target}
                      variant="outlined"
                      startIcon={<a.Icon />}
                      onClick={() => {
                        setPendingAction(a);
                        setNote("");
                        setActionError(null);
                      }}
                      sx={{
                        borderColor: a.color,
                        color: a.color,
                        "&:hover": { borderColor: a.color, bgcolor: `${a.color}15` },
                        justifyContent: "flex-start",
                      }}
                    >
                      {a.label}
                    </Button>
                  ))}
                  {actions.length === 0 && (
                    <Typography variant="caption" color="text.secondary">
                      Aucune action disponible.
                    </Typography>
                  )}
                </Stack>
              ) : (
                <CircularProgress size={20} sx={{ color: BRAND_TEAL }} />
              )}
            </Card>
          </Stack>
        </Box>
      </Stack>

      {/* Confirmation d'action + note optionnelle */}
      <Dialog
        open={pendingAction !== null}
        onClose={() => !applying && setPendingAction(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {pendingAction ? pendingAction.label : ""}
        </DialogTitle>
        <DialogContent dividers>
          {pendingAction && (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                {pendingAction.helpText}
              </Typography>
              {pendingAction.needsNote && (
                <TextField
                  multiline
                  minRows={3}
                  maxRows={8}
                  fullWidth
                  label="Note pour le client (facultative)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ex: Le probleme est corrige, votre configuration a ete mise a jour..."
                  helperText="Cette note sera inseree dans l'email envoye au client."
                  disabled={applying}
                />
              )}
              {actionError && (
                <Alert severity="error" sx={{ borderRadius: 2 }}>
                  {actionError}
                </Alert>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingAction(null)} disabled={applying}>
            Annuler
          </Button>
          <Button
            variant="contained"
            onClick={applyStatusChange}
            disabled={applying}
            sx={{ bgcolor: BRAND_TEAL, "&:hover": { bgcolor: BRAND_TEAL_DARK } }}
          >
            {applying ? <CircularProgress size={18} sx={{ color: "#FFF" }} /> : "Confirmer"}
          </Button>
        </DialogActions>
      </Dialog>

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
    </PageContainer>
  );
}
