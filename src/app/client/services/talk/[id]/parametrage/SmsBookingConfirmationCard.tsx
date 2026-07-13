"use client";

import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  CircularProgress,
  FormControlLabel,
  Snackbar,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

/**
 * Section "Confirmation de RDV par SMS" (à ne pas confondre avec la carte
 * "Rappel de RDV par SMS (No-show)").
 *
 * Un seul flag : au moment où le patient prend un RDV via le bot LyraeTalk,
 * on lui envoie (ou pas) un SMS de confirmation immédiate. Le bot lit le flag
 * via GET /api/configuration, la valeur est stockée dans la même table
 * SmsConfirmationConfig que les autres réglages SMS (colonne dédiée).
 *
 * Auto-save au toggle avec optimistic UI + rollback en cas d'échec.
 */
export default function SmsBookingConfirmationCard({
  userProductId,
}: {
  userProductId: number;
}) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/sms-confirmation-config?userProductId=${userProductId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!alive) return;
        setEnabled(Boolean(data.sendConfirmationSms));
      })
      .catch(() => {
        if (!alive) return;
        setError("Impossible de charger la configuration.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userProductId]);

  async function toggle(value: boolean) {
    const prev = enabled;
    setEnabled(value);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sms-confirmation-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userProductId,
          sendConfirmationSms: value,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEnabled(Boolean(data.sendConfirmationSms));
      setSavedAt(Date.now());
    } catch {
      setEnabled(prev);
      setError("Échec de l'enregistrement, modification annulée.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6">Confirmation de RDV par SMS</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          {loading ? (
            <Stack alignItems="center" sx={{ py: 2 }}>
              <CircularProgress size={24} />
            </Stack>
          ) : (
            <FormControlLabel
              control={
                <Switch
                  checked={enabled}
                  disabled={saving}
                  onChange={(e) => toggle(e.target.checked)}
                />
              }
              label={
                <Stack spacing={0.5}>
                  <Typography variant="body1">
                    Envoyer un SMS au patient quand il prend un RDV par le robot
                    pour lui confirmer.
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Le SMS est envoyé immédiatement après la prise de RDV.
                    Distinct des rappels no-show configurés ci-dessous.
                  </Typography>
                </Stack>
              }
            />
          )}

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>

        <Snackbar
          open={savedAt !== null}
          autoHideDuration={1500}
          onClose={() => setSavedAt(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          <Alert severity="success" variant="filled" sx={{ width: "100%" }}>
            Enregistré
          </Alert>
        </Snackbar>
      </AccordionDetails>
    </Accordion>
  );
}
