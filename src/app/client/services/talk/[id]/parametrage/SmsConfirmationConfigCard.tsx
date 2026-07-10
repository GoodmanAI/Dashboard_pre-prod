"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Checkbox,
  CircularProgress,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

type ExamKey = "radiographie" | "irm" | "echographie" | "scanner" | "mammo";
type Enabled = Record<ExamKey, boolean>;
type PostesByType = Partial<Record<ExamKey, string[]>>;

const EXAM_TYPES: { key: ExamKey; label: string }[] = [
  { key: "radiographie", label: "Radiographie" },
  { key: "irm", label: "IRM" },
  { key: "echographie", label: "Échographie" },
  { key: "scanner", label: "Scanner" },
  { key: "mammo", label: "Mammographie" },
];

const EMPTY_ENABLED: Enabled = {
  radiographie: false,
  irm: false,
  echographie: false,
  scanner: false,
  mammo: false,
};

const EMPTY_POSTES_INPUT: Record<ExamKey, string> = {
  radiographie: "",
  irm: "",
  echographie: "",
  scanner: "",
  mammo: "",
};

// Formatage : liste de postes → string saisissable (avec espaces après virgule).
function postesListToInput(list: string[] | undefined): string {
  return (list ?? []).join(", ");
}

// Parsing : string saisie → liste de postes (trim, dédup, empty drop).
// Reste tolérant : la validation stricte (longueur, cap) se fait côté serveur.
function inputToPostesList(str: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of str.split(",")) {
    const t = raw.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function reminderDaysToInput(list: number[] | null): string {
  return list && list.length > 0 ? list.join(", ") : "";
}

function inputToReminderDays(str: string): number[] {
  const seen = new Set<number>();
  for (const raw of str.split(",")) {
    const n = Number(raw.trim());
    if (!Number.isFinite(n)) continue;
    const i = Math.trunc(n);
    if (i > 0) seen.add(i);
  }
  return Array.from(seen).sort((a, b) => b - a);
}

function cutoffHoursToInput(n: number | null): string {
  return n === null ? "" : String(n);
}

type ConfigPatch = Partial<{
  enabledExamTypes: Enabled;
  postesByType: PostesByType;
  reminderDays: number[] | null;
  cutoffHours: number | null;
}>;

export default function SmsConfirmationConfigCard({
  userProductId,
}: {
  userProductId: number;
}) {
  const [enabled, setEnabled] = useState<Enabled>(EMPTY_ENABLED);
  const [postesInput, setPostesInput] = useState<Record<ExamKey, string>>(
    EMPTY_POSTES_INPUT
  );
  const [postesSaved, setPostesSaved] = useState<Record<ExamKey, string>>(
    EMPTY_POSTES_INPUT
  );
  const [reminderDaysInput, setReminderDaysInput] = useState("");
  const [reminderDaysSaved, setReminderDaysSaved] = useState("");
  const [cutoffHoursInput, setCutoffHoursInput] = useState("");
  const [cutoffHoursSaved, setCutoffHoursSaved] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Applique une réponse serveur à l'ensemble du state (loading initial + après save).
  const applyServerState = useCallback((data: {
    enabledExamTypes?: Partial<Enabled>;
    postesByType?: PostesByType;
    reminderDays?: number[] | null;
    cutoffHours?: number | null;
  }) => {
    const nextEnabled = { ...EMPTY_ENABLED, ...(data.enabledExamTypes ?? {}) };
    setEnabled(nextEnabled);

    const nextPostesInput: Record<ExamKey, string> = { ...EMPTY_POSTES_INPUT };
    const p = data.postesByType ?? {};
    for (const { key } of EXAM_TYPES) {
      nextPostesInput[key] = postesListToInput(p[key]);
    }
    setPostesInput(nextPostesInput);
    setPostesSaved(nextPostesInput);

    const rd = reminderDaysToInput(data.reminderDays ?? null);
    setReminderDaysInput(rd);
    setReminderDaysSaved(rd);

    const ch = cutoffHoursToInput(data.cutoffHours ?? null);
    setCutoffHoursInput(ch);
    setCutoffHoursSaved(ch);
  }, []);

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
        applyServerState(data);
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
  }, [userProductId, applyServerState]);

  // POST partiel : envoie uniquement les champs du patch.
  const savePatch = useCallback(
    async (patch: ConfigPatch, onRollback: () => void) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/sms-confirmation-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userProductId, ...patch }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        applyServerState(data);
        setSavedAt(Date.now());
      } catch {
        onRollback();
        setError("Échec de l'enregistrement, modification annulée.");
      } finally {
        setSaving(false);
      }
    },
    [userProductId, applyServerState]
  );

  const toggle = (key: ExamKey, value: boolean) => {
    const prev = enabled;
    const next = { ...enabled, [key]: value };
    setEnabled(next);
    savePatch({ enabledExamTypes: next }, () => setEnabled(prev));
  };

  const savePosteField = (key: ExamKey) => {
    if (postesInput[key] === postesSaved[key]) return;
    // Construit la map complète des postes à partir de l'input courant.
    const nextByType: PostesByType = {};
    for (const { key: k } of EXAM_TYPES) {
      const list = inputToPostesList(postesInput[k]);
      if (list.length > 0) nextByType[k] = list;
    }
    const prevSaved = postesSaved;
    savePatch({ postesByType: nextByType }, () => {
      setPostesInput(prevSaved);
      setPostesSaved(prevSaved);
    });
  };

  const saveReminderDays = () => {
    if (reminderDaysInput === reminderDaysSaved) return;
    const list = inputToReminderDays(reminderDaysInput);
    const value = list.length > 0 ? list : null;
    const prevSaved = reminderDaysSaved;
    savePatch({ reminderDays: value }, () => {
      setReminderDaysInput(prevSaved);
      setReminderDaysSaved(prevSaved);
    });
  };

  const saveCutoffHours = () => {
    if (cutoffHoursInput === cutoffHoursSaved) return;
    const trimmed = cutoffHoursInput.trim();
    let value: number | null = null;
    if (trimmed !== "") {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0) {
        setCutoffHoursInput(cutoffHoursSaved);
        setError("Valeur invalide pour la fenêtre de coupure.");
        return;
      }
      value = Math.trunc(n);
    }
    const prevSaved = cutoffHoursSaved;
    savePatch({ cutoffHours: value }, () => {
      setCutoffHoursInput(prevSaved);
      setCutoffHoursSaved(prevSaved);
    });
  };

  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6">Confirmation de rendez-vous par SMS</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Sélectionnez les types d&apos;examens pour lesquels un SMS de
            confirmation sera envoyé au patient avant son rendez-vous, et
            indiquez les numéros de poste Xplore concernés pour chaque type
            activé.
          </Typography>

          {loading ? (
            <Stack alignItems="center" sx={{ py: 2 }}>
              <CircularProgress size={24} />
            </Stack>
          ) : (
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{ minWidth: 480 }}>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell>Type d&apos;examen</TableCell>
                    <TableCell>Postes Xplore (séparés par une virgule)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {EXAM_TYPES.map(({ key, label }) => {
                    const isEnabled = enabled[key];
                    return (
                      <TableRow key={key} hover>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={isEnabled}
                            disabled={saving}
                            onChange={(e) => toggle(key, e.target.checked)}
                          />
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>{label}</TableCell>
                        <TableCell>
                          {isEnabled ? (
                            <TextField
                              size="small"
                              fullWidth
                              placeholder="Ex : 1, 2, 3"
                              value={postesInput[key]}
                              onChange={(e) =>
                                setPostesInput((prev) => ({
                                  ...prev,
                                  [key]: e.target.value,
                                }))
                              }
                              onBlur={() => savePosteField(key)}
                              disabled={saving}
                            />
                          ) : (
                            <Typography
                              variant="caption"
                              color="text.disabled"
                              sx={{ fontStyle: "italic" }}
                            >
                              type désactivé
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          )}

          <Accordion disableGutters variant="outlined" sx={{ mt: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">Paramètres avancés</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                <TextField
                  size="small"
                  label="Cadence des relances (jours avant RDV)"
                  helperText="Séparés par une virgule. Ex : 3, 2 pour envoyer un SMS à J-3 puis à J-2. Laisser vide pour la cadence par défaut du service."
                  value={reminderDaysInput}
                  onChange={(e) => setReminderDaysInput(e.target.value)}
                  onBlur={saveReminderDays}
                  disabled={saving || loading}
                  placeholder="Ex : 3, 2"
                />
                <TextField
                  size="small"
                  type="number"
                  label="Fenêtre de coupure (heures)"
                  helperText="Aucun SMS ne sera envoyé s'il reste moins d'X heures avant le RDV. Laisser vide pour la valeur par défaut du service."
                  value={cutoffHoursInput}
                  onChange={(e) => setCutoffHoursInput(e.target.value)}
                  onBlur={saveCutoffHours}
                  disabled={saving || loading}
                  inputProps={{ min: 0, max: 168, step: 1 }}
                  placeholder="Ex : 3"
                />
              </Stack>
            </AccordionDetails>
          </Accordion>

          <Typography variant="caption" color="text.secondary">
            Les modifications sont enregistrées automatiquement à la validation
            (case cochée, ou champ quitté après saisie).
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
