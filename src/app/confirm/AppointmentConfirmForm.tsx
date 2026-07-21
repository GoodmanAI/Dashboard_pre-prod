"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

/**
 * Formulaire de confirmation/annulation partagé entre les 2 pages patient :
 *  - /confirm/[token]/page.tsx  (URL longue historique — rétrocompat)
 *  - /c/[shortCode]/page.tsx    (URL courte SMS-friendly, actuelle)
 *
 * Reçoit en prop le `token` HMAC déjà résolu par le server component parent.
 * Le patient saisit le code à 6 chiffres reçu par SMS, choisit
 * Confirmer/Annuler, on POST `/api/rdv/{token}/respond` avec { code, action }.
 *
 * Design :
 *  - Fond doux teinté teal, carte blanche centrée verticalement + horiz.
 *  - Cadre unique, ombres douces, coins arrondis généreux
 *  - Layout mobile-first : padding responsive, boutons en colonne sur xs
 *    puis côte à côte à partir de sm ; le champ code prend un rendu type OTP
 *    (grosse police monospace, letter-spacing) pour rester lisible même
 *    quand le patient tape à l'aveugle
 */

type Status = "PENDING" | "CONFIRMED" | "CANCELLED" | "EXPIRED" | "LOCKED";

interface RdvInfo {
  status: Status;
  attempts: number;
  expiresAt: string;
  appointmentDate: string | null;
  center: { name: string | null; city: string | null };
}

// Palette brand (mêmes valeurs que le reste du dashboard)
const BRAND_TEAL = "#48C8AF";
const BRAND_TEAL_DARK = "#3AB19B";
const BRAND_TEAL_SOFT = "#E6F7F3";
const DANGER = "#E15554";
const DANGER_SOFT = "#FBECEB";
const TEXT_MAIN = "#1F3448";
const TEXT_MUTED = "#7A8FA6";
const CARD_BG = "#FFFFFF";
const PAGE_BG_TOP = "#F0F7F5";
const PAGE_BG_BOTTOM = "#FAFCFB";

export default function AppointmentConfirmForm({ token }: { token: string }) {
  const [info, setInfo] = useState<RdvInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [code, setCode] = useState("");

  const [submitting, setSubmitting] = useState<"CONFIRMED" | "CANCELLED" | null>(
    null
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [finalStatus, setFinalStatus] = useState<Status | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/rdv/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Lien invalide");
        }
        return res.json();
      })
      .then((data: RdvInfo) => {
        if (!alive) return;
        setInfo(data);
        if (data.status !== "PENDING") setFinalStatus(data.status);
      })
      .catch((err) => {
        if (!alive) return;
        setLoadError(err.message || "Lien invalide");
      });
    return () => {
      alive = false;
    };
  }, [token]);

  async function submit(action: "CONFIRMED" | "CANCELLED") {
    setSubmitError(null);
    setSubmitting(action);
    try {
      const res = await fetch(`/api/rdv/${token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.status === "LOCKED") setFinalStatus("LOCKED");
        else if (data.status === "EXPIRED") setFinalStatus("EXPIRED");
        setSubmitError(
          data.error +
            (typeof data.attemptsLeft === "number"
              ? ` (${data.attemptsLeft} tentative(s) restante(s))`
              : "")
        );
        return;
      }
      setFinalStatus(data.status);
    } catch {
      setSubmitError("Erreur réseau. Merci de réessayer.");
    } finally {
      setSubmitting(null);
    }
  }

  const centerLabel =
    [info?.center.name, info?.center.city].filter(Boolean).join(" — ") ||
    "votre centre";

  const codeTrimmed = code.trim();
  const codeReady = /^\d{6}$/.test(codeTrimmed);

  const formattedAppointment =
    info?.appointmentDate &&
    new Date(info.appointmentDate).toLocaleString("fr-FR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Box
      sx={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: { xs: 2, sm: 3 },
        background: `linear-gradient(180deg, ${PAGE_BG_TOP} 0%, ${PAGE_BG_BOTTOM} 100%)`,
        fontFamily: "Inter, Lato, system-ui, sans-serif",
        color: TEXT_MAIN,
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 460,
          bgcolor: CARD_BG,
          borderRadius: { xs: 3, sm: 4 },
          p: { xs: 3, sm: 5 },
          boxShadow:
            "0 1px 2px rgba(15, 23, 42, 0.04), 0 20px 40px -12px rgba(15, 23, 42, 0.10)",
          border: "1px solid rgba(72, 200, 175, 0.10)",
        }}
      >
        {/* ---------- En-tête : logo + titres ---------- */}
        <Stack spacing={2} alignItems="center" sx={{ mb: 3 }}>
          <Box
            sx={{
              width: 88,
              height: 88,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background: `radial-gradient(circle, ${BRAND_TEAL_SOFT} 0%, transparent 70%)`,
            }}
          >
            <Box
              component="img"
              src="/images/logos/neuracorp-ai-icon_fond.png"
              alt="Neuracorp"
              sx={{
                width: 64,
                height: 64,
                objectFit: "contain",
              }}
            />
          </Box>

          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              fontSize: { xs: 22, sm: 26 },
              lineHeight: 1.2,
              color: TEXT_MAIN,
              textAlign: "center",
            }}
          >
            Confirmation de rendez-vous
          </Typography>

          {info && (
            <Stack spacing={0.5} alignItems="center" sx={{ maxWidth: "100%" }}>
              {info.center.name && (
                <Typography
                  sx={{
                    fontSize: 14,
                    color: TEXT_MUTED,
                    textAlign: "center",
                  }}
                >
                  {centerLabel}
                </Typography>
              )}
              {formattedAppointment && (
                <Box
                  sx={{
                    mt: 1,
                    px: 2,
                    py: 0.75,
                    bgcolor: BRAND_TEAL_SOFT,
                    borderRadius: 99,
                    color: BRAND_TEAL_DARK,
                    fontWeight: 600,
                    fontSize: 13,
                    textAlign: "center",
                    textTransform: "capitalize",
                  }}
                >
                  {formattedAppointment}
                </Box>
              )}
            </Stack>
          )}
        </Stack>

        {/* ---------- Erreur de chargement / loader ---------- */}
        {loadError && (
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            {loadError}
          </Alert>
        )}

        {!loadError && !info && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}>
            <CircularProgress sx={{ color: BRAND_TEAL }} />
          </Box>
        )}

        {/* ---------- États terminaux ---------- */}
        {info && finalStatus === "CONFIRMED" && (
          <Alert severity="success" sx={{ borderRadius: 2 }}>
            Merci, votre rendez-vous est confirmé.
          </Alert>
        )}
        {info && finalStatus === "CANCELLED" && (
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            Votre annulation a bien été enregistrée.
          </Alert>
        )}
        {info && finalStatus === "EXPIRED" && (
          <Alert severity="warning" sx={{ borderRadius: 2 }}>
            Ce lien a expiré. Merci de contacter directement {centerLabel}.
          </Alert>
        )}
        {info && finalStatus === "LOCKED" && (
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            Trop de tentatives incorrectes. Pour confirmer ou annuler votre
            rendez-vous, merci de contacter directement {centerLabel}.
          </Alert>
        )}

        {/* ---------- Formulaire code ---------- */}
        {info && !finalStatus && (
          <Stack spacing={2.5}>
            <Box>
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: TEXT_MAIN,
                  mb: 1,
                }}
              >
                Code reçu par SMS
              </Typography>
              <TextField
                fullWidth
                value={code}
                onChange={(e) => {
                  const next = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(next);
                }}
                disabled={submitting !== null}
                placeholder="••••••"
                autoComplete="one-time-code"
                inputProps={{
                  inputMode: "numeric",
                  pattern: "[0-9]*",
                  maxLength: 6,
                  "aria-label": "Code à 6 chiffres reçu par SMS",
                  style: {
                    fontSize: 26,
                    letterSpacing: "0.55em",
                    textAlign: "center",
                    fontVariantNumeric: "tabular-nums",
                    padding: "14px 12px",
                    fontWeight: 600,
                  },
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2.5,
                    bgcolor: "#F7F9FB",
                    "& fieldset": {
                      borderColor: "rgba(31, 52, 72, 0.10)",
                      borderWidth: 1.5,
                    },
                    "&:hover fieldset": {
                      borderColor: "rgba(72, 200, 175, 0.4)",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: BRAND_TEAL,
                      borderWidth: 2,
                    },
                  },
                }}
              />
              <Typography
                sx={{
                  mt: 1,
                  fontSize: 12,
                  color: TEXT_MUTED,
                  textAlign: "center",
                }}
              >
                Saisissez les 6 chiffres reçus dans le SMS.
              </Typography>
            </Box>

            {submitError && (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {submitError}
              </Alert>
            )}

            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              sx={{ mt: 0.5 }}
            >
              <Button
                fullWidth
                disabled={submitting !== null || !codeReady}
                onClick={() => submit("CONFIRMED")}
                sx={{
                  bgcolor: BRAND_TEAL,
                  color: "#FFFFFF",
                  borderRadius: 99,
                  fontWeight: 700,
                  fontSize: 15,
                  textTransform: "none",
                  py: 1.35,
                  boxShadow: "0 4px 12px rgba(72, 200, 175, 0.35)",
                  transition:
                    "transform 150ms ease, box-shadow 150ms ease, background-color 150ms ease",
                  ":hover": {
                    bgcolor: BRAND_TEAL_DARK,
                    boxShadow: "0 6px 16px rgba(72, 200, 175, 0.45)",
                    transform: "translateY(-1px)",
                  },
                  "&.Mui-disabled": {
                    bgcolor: "#C5E9DF",
                    color: "#FFFFFF",
                    boxShadow: "none",
                  },
                }}
              >
                {submitting === "CONFIRMED" ? "Envoi…" : "Confirmer"}
              </Button>
              <Button
                fullWidth
                disabled={submitting !== null || !codeReady}
                onClick={() => submit("CANCELLED")}
                sx={{
                  bgcolor: "#FFFFFF",
                  color: DANGER,
                  border: `1.5px solid ${DANGER}`,
                  borderRadius: 99,
                  fontWeight: 700,
                  fontSize: 15,
                  textTransform: "none",
                  py: 1.35,
                  transition:
                    "transform 150ms ease, background-color 150ms ease",
                  ":hover": {
                    bgcolor: DANGER_SOFT,
                    transform: "translateY(-1px)",
                  },
                  "&.Mui-disabled": {
                    borderColor: "#F1B4B3",
                    color: "#F1B4B3",
                  },
                }}
              >
                {submitting === "CANCELLED" ? "Envoi…" : "Annuler"}
              </Button>
            </Stack>
          </Stack>
        )}

        {/* ---------- Footer ---------- */}
        <Typography
          sx={{
            mt: 4,
            pt: 3,
            borderTop: "1px solid rgba(31, 52, 72, 0.06)",
            color: TEXT_MUTED,
            fontSize: 12,
            textAlign: "center",
            lineHeight: 1.6,
          }}
        >
          Pour modifier votre rendez-vous (changer de date ou d&apos;horaire),
          merci de contacter directement {centerLabel}.
        </Typography>
      </Box>
    </Box>
  );
}
