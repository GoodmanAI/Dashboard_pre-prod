"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  Typography,
  Tabs,
  Tab,
  Stack,
  Button,
  Alert,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  CircularProgress,
  InputAdornment,
  IconButton,
} from "@mui/material";
import {
  IconArrowLeft,
  IconLockCog,
  IconTrash,
  IconAlertTriangle,
  IconEye,
  IconEyeOff,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import CustomTextField from "@/app/(DashboardLayout)/components/forms/theme-elements/CustomTextField";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";

interface Client {
  id: number;
  name: string | null;
  email: string;
}

export default function ManageClientsPage() {
  const router = useRouter();
  const [currentTab, setCurrentTab] = useState(0);
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);

  useEffect(() => {
    const run = async () => {
      setLoadingClients(true);
      try {
        const res = await fetch("/api/admin/clients");
        const data = await res.json();
        if (res.ok) setClients(data);
      } catch (err) {
        console.error("Error fetching clients:", err);
      } finally {
        setLoadingClients(false);
      }
    };
    run();
  }, []);

  return (
    <PageContainer title="Gérer les clients" description="Administration des comptes clients">
      <Box>
        <Button
          variant="text"
          size="small"
          startIcon={<IconArrowLeft size={16} />}
          onClick={() => router.push("/admin/actions")}
          sx={{
            color: "text.secondary",
            mb: 2,
            ml: -1,
            px: 1,
            textTransform: "none",
            fontWeight: 500,
            "&:hover": { bgcolor: "rgba(72,200,175,0.08)", color: "#2a6f64" },
          }}
        >
          Retour aux actions
        </Button>

        <SectionHeader
          title="Gérer les clients"
          subtitle="Réinitialisation de mot de passe et suppression de compte"
        />

        <Card sx={{ p: 0, overflow: "hidden" }} elevation={1}>
          <Tabs
            value={currentTab}
            onChange={(_e, v) => setCurrentTab(v)}
            sx={{
              px: 2,
              borderBottom: "1px solid #e5e7eb",
              "& .MuiTab-root": {
                textTransform: "none",
                fontWeight: 600,
                minHeight: 48,
              },
              "& .MuiTabs-indicator": { bgcolor: "#48C8AF", height: 3 },
              "& .Mui-selected": { color: "#2a6f64 !important" },
            }}
          >
            <Tab icon={<IconLockCog size={18} />} iconPosition="start" label="Réinitialiser mot de passe" />
            <Tab icon={<IconTrash size={18} />} iconPosition="start" label="Supprimer le compte" />
          </Tabs>

          <Box sx={{ p: { xs: 3, md: 4 } }}>
            {currentTab === 0 && (
              <ResetPasswordPanel clients={clients} loading={loadingClients} />
            )}
            {currentTab === 1 && (
              <DeleteAccountPanel
                clients={clients}
                loading={loadingClients}
                onDeleted={(id) => setClients((prev) => prev.filter((c) => c.id !== id))}
              />
            )}
          </Box>
        </Card>
      </Box>
    </PageContainer>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Panel : Reset Password                                                   */
/* ──────────────────────────────────────────────────────────────────────── */

function ResetPasswordPanel({
  clients,
  loading,
}: {
  clients: Client[];
  loading: boolean;
}) {
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedId),
    [clients, selectedId]
  );

  const handleReset = async () => {
    if (!selectedClient) return;
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setConfirmOpen(false);

    try {
      const res = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClient.id,
          name: selectedClient.name,
          email: selectedClient.email,
          newPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMessage(data.message || "Mot de passe réinitialisé.");
        setSelectedId("");
        setNewPassword("");
      } else {
        setErrorMessage(data.error || "Échec de la réinitialisation.");
      }
    } catch {
      setErrorMessage("Une erreur inattendue s'est produite.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 560 }}>
      <Box>
        <Typography variant="subtitle1" fontWeight={700}>
          Réinitialiser le mot de passe
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Assigne un nouveau mot de passe au client sélectionné. L&apos;ancien sera immédiatement invalidé.
        </Typography>
      </Box>

      <FormControl fullWidth disabled={loading}>
        <InputLabel id="client-select-reset">Client</InputLabel>
        <Select
          labelId="client-select-reset"
          value={selectedId}
          label="Client"
          onChange={(e) => setSelectedId(Number(e.target.value))}
          MenuProps={{ PaperProps: { style: { maxHeight: 280 } } }}
        >
          {clients.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name} — {c.email}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <CustomTextField
        label="Nouveau mot de passe"
        type={showPassword ? "text" : "password"}
        variant="outlined"
        fullWidth
        value={newPassword}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
        disabled={submitting}
        helperText="Minimum 8 caractères, au moins une minuscule."
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                onClick={() => setShowPassword((v) => !v)}
                edge="end"
                size="small"
                disabled={submitting}
                aria-label={
                  showPassword
                    ? "Masquer le mot de passe"
                    : "Afficher le mot de passe"
                }
                sx={{ color: "#91A3B7" }}
              >
                {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </IconButton>
            </InputAdornment>
          ),
        }}
      />

      <Box>
        <Button
          variant="contained"
          size="large"
          startIcon={<IconLockCog size={18} />}
          onClick={() => setConfirmOpen(true)}
          disabled={submitting || !selectedClient || !newPassword}
          sx={{
            bgcolor: "#48C8AF",
            fontWeight: 600,
            "&:hover": { bgcolor: "#3BA992" },
          }}
        >
          {submitting ? "En cours…" : "Réinitialiser le mot de passe"}
        </Button>
      </Box>

      {successMessage && <Alert severity="success">{successMessage}</Alert>}
      {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        PaperProps={{ sx: { borderRadius: 2, minWidth: 420 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Confirmer la réinitialisation</DialogTitle>
        <DialogContent dividers>
          <DialogContentText sx={{ mb: 2 }}>
            L&apos;ancien mot de passe sera invalidé immédiatement.
          </DialogContentText>
          <Stack spacing={1}>
            <Row label="Client" value={selectedClient?.name || "—"} />
            <Row label="Email" value={selectedClient?.email || "—"} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setConfirmOpen(false)} variant="text">
            Annuler
          </Button>
          <Button
            onClick={handleReset}
            variant="contained"
            disabled={submitting}
            sx={{ bgcolor: "#48C8AF", fontWeight: 600, "&:hover": { bgcolor: "#3BA992" } }}
          >
            Confirmer
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Panel : Delete Account (double confirmation à la GitHub)                 */
/* ──────────────────────────────────────────────────────────────────────── */

function DeleteAccountPanel({
  clients,
  loading,
  onDeleted,
}: {
  clients: Client[];
  loading: boolean;
  onDeleted: (id: number) => void;
}) {
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [stage, setStage] = useState<0 | 1 | 2>(0); // 0=select, 1=warn, 2=final modal
  const [confirmName, setConfirmName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedId),
    [clients, selectedId]
  );

  const canSubmit =
    !!selectedClient &&
    confirmName === selectedClient.name &&
    !submitting;

  const handleDelete = async () => {
    if (!selectedClient) return;
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/admin/clients/${selectedClient.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName }),
      });
      const data = await res.json();

      if (res.ok) {
        setSuccessMessage(
          `Client "${selectedClient.name}" supprimé avec succès.`
        );
        onDeleted(selectedClient.id);
        setSelectedId("");
        setConfirmName("");
        setStage(0);
      } else {
        setErrorMessage(data.error || "Échec de la suppression.");
      }
    } catch {
      setErrorMessage("Une erreur inattendue s'est produite.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 560 }}>
      <Box>
        <Typography variant="subtitle1" fontWeight={700}>
          Supprimer le compte
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Supprime définitivement le compte client et toutes les données associées
          (appels, configurations, tickets, fichiers). Action irréversible.
        </Typography>
      </Box>

      <FormControl fullWidth disabled={loading}>
        <InputLabel id="client-select-delete">Client</InputLabel>
        <Select
          labelId="client-select-delete"
          value={selectedId}
          label="Client"
          onChange={(e) => {
            setSelectedId(Number(e.target.value));
            setConfirmName("");
            setStage(0);
          }}
          MenuProps={{ PaperProps: { style: { maxHeight: 280 } } }}
        >
          {clients.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name} — {c.email}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {selectedClient && stage === 0 && (
        <Box>
          <Button
            variant="outlined"
            color="error"
            startIcon={<IconAlertTriangle size={18} />}
            onClick={() => setStage(1)}
          >
            Je veux supprimer ce compte
          </Button>
        </Box>
      )}

      {selectedClient && stage >= 1 && (
        <Box
          sx={{
            border: "1px solid #fecaca",
            bgcolor: "#fef2f2",
            borderRadius: 2,
            p: 3,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
            <IconAlertTriangle size={20} color="#dc2626" />
            <Typography fontWeight={700} sx={{ color: "#991b1b" }}>
              Zone dangereuse
            </Typography>
          </Box>

          <Typography variant="body2" sx={{ color: "#7f1d1d", mb: 2 }}>
            Tu t&apos;apprêtes à supprimer{" "}
            <strong>{selectedClient.name}</strong> ({selectedClient.email}).
            Toutes les données associées seront également supprimées et ne pourront
            pas être récupérées.
          </Typography>

          <Divider sx={{ my: 2, borderColor: "#fecaca" }} />

          <Typography variant="body2" sx={{ color: "#7f1d1d", mb: 1 }}>
            Pour confirmer, tape le nom exact du client :{" "}
            <Box component="code" sx={{ bgcolor: "#fee2e2", px: 0.75, py: 0.25, borderRadius: 0.5 }}>
              {selectedClient.name}
            </Box>
          </Typography>

          <CustomTextField
            variant="outlined"
            fullWidth
            value={confirmName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmName(e.target.value)}
            placeholder={selectedClient.name ?? ""}
            sx={{ my: 1.5 }}
          />

          <Box sx={{ display: "flex", gap: 1.5, mt: 1 }}>
            <Button
              variant="text"
              onClick={() => {
                setStage(0);
                setConfirmName("");
              }}
              disabled={submitting}
            >
              Annuler
            </Button>
            <Button
              variant="contained"
              color="error"
              startIcon={
                submitting ? <CircularProgress size={16} color="inherit" /> : <IconTrash size={18} />
              }
              onClick={() => setStage(2)}
              disabled={!canSubmit}
            >
              {submitting ? "Suppression…" : "Supprimer définitivement"}
            </Button>
          </Box>
        </Box>
      )}

      {successMessage && <Alert severity="success">{successMessage}</Alert>}
      {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

      {/* Dialog finale : vraiment, vraiment sûr ? */}
      <Dialog
        open={stage === 2}
        onClose={() => !submitting && setStage(1)}
        PaperProps={{ sx: { borderRadius: 2, minWidth: 420 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, color: "#991b1b" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <IconAlertTriangle size={22} />
            Confirmation finale
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <DialogContentText sx={{ mb: 2 }}>
            Dernière confirmation avant suppression définitive.
          </DialogContentText>
          <Stack spacing={1}>
            <Row label="Client" value={selectedClient?.name || "—"} />
            <Row label="Email" value={selectedClient?.email || "—"} />
            <Row label="ID" value={String(selectedClient?.id ?? "—")} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setStage(1)} variant="text" disabled={submitting}>
            Non, retour
          </Button>
          <Button
            onClick={handleDelete}
            variant="contained"
            color="error"
            startIcon={<IconTrash size={16} />}
            disabled={!canSubmit}
          >
            Oui, supprimer
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

/* Ligne label/value dans les dialogues */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", gap: 1 }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 100 }}>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={600}>
        {value}
      </Typography>
    </Box>
  );
}
