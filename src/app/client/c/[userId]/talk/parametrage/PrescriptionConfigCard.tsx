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
  Chip,
  FormControlLabel,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useSession } from "next-auth/react";

/**
 * Bloc de configuration "Ordonnances" affiche dans la page /parametrage.
 * Le centre coche quels types d'examens necessitent une ordonnance patient
 * (le SMS de confirmation contiendra alors un lien depot-ordonnances) et
 * definit le delai apres lequel une alerte "ordonnance manquante" apparait
 * pour les secretaires (defaut 48h).
 *
 * Auth mixte cote endpoint /api/prescriptions/config :
 *  - Cette carte utilise le mode session (userProductId), avec ownership
 *    check cote serveur.
 *  - LyraeTalk lira la meme donnee via externalCenterCode dans son propre
 *    endpoint config groupe (chantier LyraeTalk).
 */

type ExamKey = "radiographie" | "irm" | "echographie" | "scanner" | "mammo";
type Enabled = Record<ExamKey, boolean>;

const EXAM_TYPES: { key: ExamKey; label: string }[] = [
  { key: "radiographie", label: "Radiographie" },
  { key: "irm", label: "IRM" },
  { key: "echographie", label: "Echographie" },
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

const DEFAULT_ALERT_HOURS = 48;
const MIN_ALERT_HOURS = 1;
const MAX_ALERT_HOURS = 720;

export default function PrescriptionConfigCard({
  userProductId,
}: {
  userProductId: number;
}) {
  const { data: sessionData } = useSession();
  const readOnly = !!sessionData?.user?.isSecretary;

  const [enabledExamTypes, setEnabledExamTypes] = useState<Enabled>(EMPTY_ENABLED);
  const [alertAfterHours, setAlertAfterHours] = useState<string>(String(DEFAULT_ALERT_HOURS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: "success" | "error" }>({
    open: false,
    msg: "",
    sev: "success",
  });

  // Chargement initial
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/prescriptions/config?userProductId=${userProductId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!alive) return;
        setEnabledExamTypes(data.enabledExamTypes ?? EMPTY_ENABLED);
        setAlertAfterHours(String(data.alertAfterHours ?? DEFAULT_ALERT_HOURS));
        setDirty(false);
      } catch (err) {
        console.error("[PrescriptionConfigCard] fetch failed:", err);
        if (alive) {
          setSnack({ open: true, msg: "Impossible de charger la configuration.", sev: "error" });
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userProductId]);

  const toggleExam = useCallback((key: ExamKey, checked: boolean) => {
    setEnabledExamTypes((prev) => ({ ...prev, [key]: checked }));
    setDirty(true);
  }, []);

  const handleHoursChange = useCallback((val: string) => {
    // Autorise vide temporaire, mais borne au save
    setAlertAfterHours(val.replace(/\D/g, ""));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    const hoursNum = parseInt(alertAfterHours, 10);
    if (!Number.isFinite(hoursNum) || hoursNum < MIN_ALERT_HOURS || hoursNum > MAX_ALERT_HOURS) {
      setSnack({
        open: true,
        msg: `Le delai doit etre entre ${MIN_ALERT_HOURS} et ${MAX_ALERT_HOURS} heures.`,
        sev: "error",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/prescriptions/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userProductId,
          enabledExamTypes,
          alertAfterHours: hoursNum,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({} as any));
      setDirty(false);

      // Le backend peut avoir auto-active la confirmation SMS pour les types
      // qui n'avaient pas encore la SMS. On l'affiche dans le snack pour que
      // la secretaire comprenne le lien de cause a effet (voir l'Alert info
      // permanente en tete de la card).
      const autoEnabled: string[] = Array.isArray(data?.smsAutoEnabledTypes)
        ? data.smsAutoEnabledTypes
        : [];
      if (autoEnabled.length > 0) {
        const labels = autoEnabled
          .map((k) => EXAM_TYPES.find((e) => e.key === k)?.label ?? k)
          .join(", ");
        setSnack({
          open: true,
          msg: `Configuration enregistree. Confirmation SMS auto-activee pour : ${labels}.`,
          sev: "success",
        });
      } else {
        setSnack({ open: true, msg: "Configuration enregistree.", sev: "success" });
      }
    } catch (err) {
      console.error("[PrescriptionConfigCard] save failed:", err);
      setSnack({ open: true, msg: "Echec de l'enregistrement.", sev: "error" });
    } finally {
      setSaving(false);
    }
  }, [alertAfterHours, enabledExamTypes, userProductId]);

  const enabledCount = Object.values(enabledExamTypes).filter(Boolean).length;

  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Typography variant="h6">Depot d&apos;ordonnance patient</Typography>
          <Chip
            size="small"
            label={
              enabledCount === 0
                ? "aucun type active"
                : `${enabledCount} / ${EXAM_TYPES.length} types actives`
            }
            sx={{
              bgcolor: enabledCount === 0 ? "rgba(0,0,0,0.06)" : "rgba(var(--accent-rgb), 0.15)",
              color: enabledCount === 0 ? "text.secondary" : "var(--accent-deep)",
              fontWeight: 700,
            }}
          />
        </Stack>
      </AccordionSummary>

      <AccordionDetails>
        {loading ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress sx={{ color: "var(--accent)" }} />
          </Stack>
        ) : (
          <Stack spacing={3}>
            <Alert severity="info" variant="outlined" sx={{ borderColor: "rgba(var(--accent-rgb), 0.4)" }}>
              Cochez les types d&apos;examens pour lesquels le patient doit deposer une
              ordonnance. LyraeTalk ajoutera alors un lien de depot dans le SMS de
              confirmation de RDV. Le patient recoit un lien court + un code a 6 chiffres.
            </Alert>

            <Alert
              severity="warning"
              variant="outlined"
              sx={{ borderColor: "rgba(234,88,12,0.4)" }}
            >
              <strong>Important :</strong> activer une ordonnance pour un type d&apos;examen
              active automatiquement la confirmation SMS pour ce meme type. Le lien de
              depot est inclus dans le SMS envoye au patient — sans SMS, le patient ne
              peut pas deposer son ordonnance.
            </Alert>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                Types d&apos;examens necessitant une ordonnance
              </Typography>
              <Stack spacing={0.5}>
                {EXAM_TYPES.map((t) => (
                  <FormControlLabel
                    key={t.key}
                    control={
                      <Checkbox
                        checked={!!enabledExamTypes[t.key]}
                        disabled={readOnly}
                        onChange={(e) => toggleExam(t.key, e.target.checked)}
                        sx={{
                          color: "var(--accent)",
                          "&.Mui-checked": { color: "var(--accent)" },
                        }}
                      />
                    }
                    label={t.label}
                  />
                ))}
              </Stack>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Delai avant alerte secretaire (heures)
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Si l&apos;ordonnance n&apos;est pas deposee dans ce delai apres l&apos;envoi
                du SMS, une alerte apparait dans le dashboard secretaire pour rappeler le
                patient. Defaut : {DEFAULT_ALERT_HOURS}h. Plage autorisee : {MIN_ALERT_HOURS}
                –{MAX_ALERT_HOURS}h.
              </Typography>
              <TextField
                type="number"
                inputProps={{ min: MIN_ALERT_HOURS, max: MAX_ALERT_HOURS }}
                value={alertAfterHours}
                onChange={(e) => handleHoursChange(e.target.value)}
                disabled={readOnly}
                sx={{ maxWidth: 180 }}
                size="small"
              />
            </Box>

            {!readOnly && dirty && (
              <Alert severity="warning" sx={{ borderRadius: 2 }}>
                Vous avez des modifications non enregistrees. Cliquez sur &laquo;
                Enregistrer &raquo; ci-dessous pour valider.
              </Alert>
            )}

            {!readOnly && (
              <Box>
                <button
                  type="button"
                  disabled={!dirty || saving}
                  onClick={handleSave}
                  style={{
                    padding: "8px 20px",
                    borderRadius: 6,
                    border: "none",
                    backgroundColor: !dirty || saving ? "#CFE9E1" : "var(--accent)",
                    color: "#FFF",
                    fontWeight: 600,
                    cursor: !dirty || saving ? "default" : "pointer",
                    fontSize: 14,
                  }}
                >
                  {saving ? "Enregistrement..." : "Enregistrer la configuration ordonnance"}
                </button>
              </Box>
            )}
          </Stack>
        )}

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
      </AccordionDetails>
    </Accordion>
  );
}
