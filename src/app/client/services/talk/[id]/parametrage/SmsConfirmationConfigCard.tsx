"use client";

import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  FormGroup,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

const EXAM_TYPES: { key: ExamKey; label: string }[] = [
  { key: "radiographie", label: "Radiographie" },
  { key: "irm", label: "IRM" },
  { key: "echographie", label: "Échographie" },
  { key: "scanner", label: "Scanner" },
  { key: "mammo", label: "Mammographie" },
];

type ExamKey = "radiographie" | "irm" | "echographie" | "scanner" | "mammo";
type Enabled = Record<ExamKey, boolean>;

const EMPTY: Enabled = {
  radiographie: false,
  irm: false,
  echographie: false,
  scanner: false,
  mammo: false,
};

export default function SmsConfirmationConfigCard({
  userProductId,
}: {
  userProductId: number;
}) {
  const [enabled, setEnabled] = useState<Enabled>(EMPTY);
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
        setEnabled({ ...EMPTY, ...(data.enabledExamTypes ?? {}) });
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

  async function toggle(key: ExamKey, value: boolean) {
    const prev = enabled;
    const next = { ...enabled, [key]: value };
    setEnabled(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sms-confirmation-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userProductId, enabledExamTypes: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
        <Typography variant="h6">Confirmation de rendez-vous par SMS</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">
            Sélectionnez les types d&apos;examens pour lesquels un SMS de
            confirmation sera envoyé au patient avant son rendez-vous.
          </Typography>

          {loading ? (
            <Stack alignItems="center" sx={{ py: 2 }}>
              <CircularProgress size={24} />
            </Stack>
          ) : (
            <FormGroup row>
              {EXAM_TYPES.map(({ key, label }) => (
                <FormControlLabel
                  key={key}
                  control={
                    <Checkbox
                      checked={enabled[key]}
                      disabled={saving}
                      onChange={(e) => toggle(key, e.target.checked)}
                    />
                  }
                  label={label}
                />
              ))}
            </FormGroup>
          )}

          <Typography variant="caption" color="text.secondary">
            Les modifications sont enregistrées automatiquement.
          </Typography>

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
