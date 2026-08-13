"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import PermissionsGrid from "./PermissionsGrid";
import { AccessLevel, PageKey } from "@/lib/permissions";

const BRAND_TEAL = "var(--accent)";

type ClientOption = {
  id: number;
  name: string | null;
  email: string;
};

type Props = {
  open: boolean;
  mode: "admin" | "sub-account";
  clients: ClientOption[]; // Pour choisir un compte parent en mode sub-account
  onClose: () => void;
  onSuccess: (message: string) => void;
};

/**
 * Dialog de creation d'un compte (chantier 3, Lot C).
 * -----------------------------------------------------------------------------
 * Deux modes :
 *   - "admin"       : email + password + name -> role ADMIN
 *   - "sub-account" : idem + managerId (parent CLIENT) + permissions granulaires
 */
export default function CreateAccountDialog({
  open,
  mode,
  clients,
  onClose,
  onSuccess,
}: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [managerId, setManagerId] = useState<number | "">("");
  const [permissions, setPermissions] = useState<Partial<Record<PageKey, AccessLevel>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEmail("");
      setPassword("");
      setName("");
      setManagerId("");
      setPermissions({});
      setError(null);
    }
  }, [open]);

  const title = useMemo(
    () => (mode === "admin" ? "Nouvel administrateur" : "Nouveau sous-compte"),
    [mode]
  );

  const canSubmit =
    email.trim().length >= 3 &&
    password.length >= 8 &&
    name.trim().length > 0 &&
    (mode === "admin" || (typeof managerId === "number" && Object.keys(permissions).length > 0));

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const body =
        mode === "admin"
          ? { mode, email, password, name }
          : { mode, email, password, name, managerId, permissions };
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const detailMsg = Array.isArray(data.details)
          ? data.details.map((d: any) => `${d.field}: ${d.message}`).join(" / ")
          : "";
        throw new Error([data.error, detailMsg].filter(Boolean).join(" — "));
      }
      onSuccess(
        mode === "admin"
          ? `Admin ${data.user.email} cree.`
          : `Sous-compte ${data.user.email} cree.`
      );
    } catch (e: any) {
      setError(e?.message ?? "Erreur inconnue");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{title}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField
            label="Nom"
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            autoFocus
          />
          <TextField
            label="Email (identifiant)"
            fullWidth
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            helperText="Sera normalise en minuscules. Peut ne pas contenir de @."
          />
          <TextField
            label="Mot de passe"
            type="password"
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            helperText="Min 12 caracteres, avec majuscule, minuscule, chiffre et special."
          />

          {mode === "sub-account" && (
            <>
              <Divider />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Compte parent
              </Typography>
              <FormControl fullWidth disabled={submitting}>
                <InputLabel id="parent-label">Client parent</InputLabel>
                <Select
                  labelId="parent-label"
                  label="Client parent"
                  value={managerId}
                  onChange={(e) => setManagerId(Number(e.target.value) as any)}
                >
                  {clients.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name ?? c.email} <Typography component="span" sx={{ color: "#7A8FA6", ml: 1, fontSize: 12 }}>({c.email})</Typography>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 1 }}>
                Permissions par page
              </Typography>
              <Typography variant="caption" sx={{ color: "#7A8FA6" }}>
                Coche les pages accessibles et choisis le niveau (read / write).
                Les pages non cochees ne seront pas visibles pour ce sous-compte.
              </Typography>
              <PermissionsGrid value={permissions} onChange={setPermissions} disabled={submitting} />
            </>
          )}

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Annuler
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!canSubmit || submitting}
          sx={{ bgcolor: BRAND_TEAL, "&:hover": { bgcolor: "#3aa896" } }}
        >
          {submitting ? "Creation..." : "Creer"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
