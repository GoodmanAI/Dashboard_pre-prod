"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  CircularProgress,
  FormControlLabel,
  Snackbar,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { io as ioClient, Socket } from "socket.io-client";

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
 *
 * Dépendance métier : si au moins un type d'examen a une ordonnance activée,
 * le switch est **verrouillé sur ON** (le lien de dépôt patient est inclus
 * dans ce SMS, donc désactiver = casser silencieusement le flow ordonnance).
 * Le composant fetch la config prescription pour connaître l'état, et le
 * backend renforce la même règle avec un 409 explicite.
 */

const EXAM_LABELS: Record<string, string> = {
  scanner: "Scanner",
  irm: "IRM",
  mammo: "Mammographie",
  radiographie: "Radiographie",
  echographie: "Echographie",
};

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
  // Liste des types d'examens avec ordonnance active (source: PrescriptionConfig)
  // Utilisée pour verrouiller le switch et afficher l'explication contextuelle.
  const [prescriptionActiveTypes, setPrescriptionActiveTypes] = useState<string[]>(
    []
  );

  // Refetch de la seule config prescription (utilise apres event websocket
  // "prescription-alerts-updated" pour re-synchroniser le lock du switch sans
  // que l'user ait a rafraichir la page manuellement).
  const refetchPrescriptionState = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/prescriptions/config?userProductId=${userProductId}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = await res.json();
      const enabledTypes: string[] = Object.entries(data.enabledExamTypes ?? {})
        .filter(([, v]) => v === true)
        .map(([k]) => k);
      setPrescriptionActiveTypes(enabledTypes);
    } catch {
      // Silencieux : garder l'etat courant plutot que casser l'UI
    }
  }, [userProductId]);

  // Fetch simultané des 2 configs (SMS + prescription) pour connaître l'état
  // et la dépendance dès le mount.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/sms-confirmation-config?userProductId=${userProductId}`).then(
        (r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      ),
      fetch(`/api/prescriptions/config?userProductId=${userProductId}`).then(
        (r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      ),
    ])
      .then(([smsData, prescData]) => {
        if (!alive) return;
        setEnabled(Boolean(smsData.sendConfirmationSms));
        const enabledTypes: string[] = Object.entries(
          prescData.enabledExamTypes ?? {}
        )
          .filter(([, v]) => v === true)
          .map(([k]) => k);
        setPrescriptionActiveTypes(enabledTypes);
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

  // Websocket : refresh instantane du lock quand la config prescription
  // change (meme event que le badge navbar/header). Sans ca, apres avoir
  // decoche toutes les ordonnances, le user devait recharger la page pour
  // que le switch se debloque.
  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    if (!userProductId) return;
    let cancelled = false;
    (async () => {
      try {
        await fetch("/api/socket");
        if (cancelled) return;
        const socket = ioClient({ path: "/api/socket" });
        socketRef.current = socket;
        socket.on("prescription-alerts-updated", () => {
          if (!cancelled) refetchPrescriptionState();
        });
      } catch {
        // Socket KO : le user devra refresh manuellement. Comportement
        // acceptable en degrade.
      }
    })();
    return () => {
      cancelled = true;
      if (socketRef.current) {
        socketRef.current.off("prescription-alerts-updated");
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [userProductId, refetchPrescriptionState]);

  const prescriptionLocked = prescriptionActiveTypes.length > 0;
  const prescriptionLabels = prescriptionActiveTypes
    .map((k) => EXAM_LABELS[k] ?? k)
    .join(", ");

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
      if (!res.ok) {
        // Cas particulier du 409 (blocage prescription) : message dedie et
        // rollback local.
        if (res.status === 409) {
          const data = await res.json().catch(() => ({} as any));
          setEnabled(prev);
          setError(
            data?.error ??
              "Impossible de desactiver : des ordonnances sont actives."
          );
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
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

  const switchDisabled = saving || (prescriptionLocked && enabled);

  const tooltipTitle = prescriptionLocked
    ? `Verrouille sur ON : ordonnances actives pour ${prescriptionLabels}. Le lien de depot patient est envoye dans ce SMS. Desactivez d'abord les ordonnances pour pouvoir eteindre ce reglage.`
    : "";

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
            <>
              {prescriptionLocked && (
                <Alert
                  severity="info"
                  variant="outlined"
                  sx={{ borderColor: "rgba(72,200,175,0.4)" }}
                >
                  Ce reglage est <strong>verrouille sur ON</strong> car des
                  ordonnances sont actives pour : <strong>{prescriptionLabels}</strong>.
                  Le lien de depot patient est inclus dans ce SMS. Pour pouvoir
                  desactiver, desactivez d&apos;abord les ordonnances concernees
                  dans la carte &laquo; Depot d&apos;ordonnance patient &raquo;.
                </Alert>
              )}

              <Tooltip title={tooltipTitle} placement="top" arrow>
                {/* span wrapper pour permettre au Tooltip de s'afficher meme
                    quand le control est disabled (MUI limitation connue) */}
                <Box component="span" sx={{ display: "inline-block", width: "fit-content" }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={enabled}
                        disabled={switchDisabled}
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
                </Box>
              </Tooltip>
            </>
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
