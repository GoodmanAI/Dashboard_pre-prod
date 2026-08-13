"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import PermissionsGrid from "./PermissionsGrid";
import { AccessLevel, PageKey } from "@/lib/permissions";

const BRAND_TEAL = "var(--accent)";

type ApiUser = {
  id: number;
  name: string | null;
  email: string;
  permissions: unknown;
};

type Props = {
  user: ApiUser | null;
  onClose: () => void;
  onSuccess: (msg: string) => void;
};

/**
 * Dialog d'edition des permissions d'un sous-compte (chantier 3, Lot C).
 * -----------------------------------------------------------------------------
 * Ouvre la meme grille que la creation. PATCH sur /api/admin/users/[id] avec
 * le nouveau JSON permissions. L'endpoint bump tokenVersion -> le sous-compte
 * doit re-fetch au prochain refresh (updateAge=1h) OU se reconnecter.
 */
export default function EditPermissionsDialog({ user, onClose, onSuccess }: Props) {
  const [permissions, setPermissions] = useState<Partial<Record<PageKey, AccessLevel>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.permissions && typeof user.permissions === "object") {
      const initial: Partial<Record<PageKey, AccessLevel>> = {};
      for (const [k, v] of Object.entries(user.permissions as Record<string, unknown>)) {
        if (v === "read" || v === "write") {
          initial[k as PageKey] = v;
        }
      }
      setPermissions(initial);
    } else {
      setPermissions({});
    }
    setError(null);
  }, [user]);

  if (!user) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onSuccess(
        `Permissions mises a jour pour ${user.email}. Le sous-compte sera deconnecte au prochain refresh.`
      );
    } catch (e: any) {
      setError(e?.message ?? "Erreur inconnue");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!user} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        Editer permissions
        <Typography variant="body2" sx={{ color: "#7A8FA6", fontWeight: 400, mt: 0.5 }}>
          {user.name ?? user.email}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="caption" sx={{ color: "#7A8FA6" }}>
            Coche les pages accessibles et choisis le niveau. Les modifications
            deconnecteront le compte automatiquement (bump tokenVersion).
          </Typography>
          <PermissionsGrid value={permissions} onChange={setPermissions} disabled={submitting} />
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
          disabled={submitting || Object.keys(permissions).length === 0}
          sx={{ bgcolor: BRAND_TEAL, "&:hover": { bgcolor: "#3aa896" } }}
        >
          {submitting ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
