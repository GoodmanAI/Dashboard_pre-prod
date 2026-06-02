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

type Status =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "EXPIRED"
  | "LOCKED";

interface RdvInfo {
  status: Status;
  attempts: number;
  expiresAt: string;
  appointmentDate: string | null;
  center: { name: string | null; city: string | null };
}

export default function ConfirmAppointmentPage({
  params,
}: {
  params: { token: string };
}) {
  const [info, setInfo] = useState<RdvInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [birthdate, setBirthdate] = useState("");

  const [submitting, setSubmitting] = useState<"CONFIRMED" | "CANCELLED" | null>(
    null
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [finalStatus, setFinalStatus] = useState<Status | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/rdv/${params.token}`)
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
  }, [params.token]);

  async function submit(action: "CONFIRMED" | "CANCELLED") {
    setSubmitError(null);
    setSubmitting(action);
    try {
      const res = await fetch(`/api/rdv/${params.token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstname, lastname, birthdate, action }),
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

  return (
    <Box
      sx={{
        backgroundColor: "#F8F8F8",
        minHeight: "100vh",
        py: 6,
        px: 2,
        fontFamily: "Lato, sans-serif",
      }}
    >
      <Box
        sx={{
          maxWidth: 480,
          mx: "auto",
          backgroundColor: "#FFFFFF",
          borderRadius: 3,
          p: 4,
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}
      >
        <Box
          component="img"
          src="/images/logos/neuracorp-ai-icon_fond.png"
          alt=""
          sx={{ width: 64, height: 64, display: "block", mx: "auto", mb: 2 }}
        />

        <Typography
          variant="h5"
          sx={{
            fontWeight: 600,
            color: "#34495E",
            textAlign: "center",
            mb: 1,
          }}
        >
          Confirmation de rendez-vous
        </Typography>

        {info && (
          <Typography
            sx={{
              textAlign: "center",
              color: "#91A3B7",
              fontSize: 13,
              mb: 3,
            }}
          >
            {info.center.name
              ? `Rendez-vous au centre ${centerLabel}`
              : "Veuillez confirmer ou annuler votre rendez-vous."}
            {info.appointmentDate && (
              <>
                <br />
                Date : {new Date(info.appointmentDate).toLocaleString("fr-FR")}
              </>
            )}
          </Typography>
        )}

        {loadError && <Alert severity="error">{loadError}</Alert>}

        {!loadError && !info && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {info && finalStatus === "CONFIRMED" && (
          <Alert severity="success">
            Merci, votre rendez-vous est confirmé.
          </Alert>
        )}
        {info && finalStatus === "CANCELLED" && (
          <Alert severity="info">
            Votre annulation a bien été enregistrée.
          </Alert>
        )}
        {info && finalStatus === "EXPIRED" && (
          <Alert severity="warning">
            Ce lien a expiré. Merci de contacter directement {centerLabel}.
          </Alert>
        )}
        {info && finalStatus === "LOCKED" && (
          <Alert severity="error">
            Trop de tentatives incorrectes. Pour confirmer ou annuler votre
            rendez-vous, merci de contacter directement {centerLabel}.
          </Alert>
        )}

        {info && !finalStatus && (
          <Stack spacing={2}>
            <TextField
              label="Prénom"
              fullWidth
              value={firstname}
              onChange={(e) => setFirstname(e.target.value)}
              disabled={submitting !== null}
              autoComplete="given-name"
            />
            <TextField
              label="Nom"
              fullWidth
              value={lastname}
              onChange={(e) => setLastname(e.target.value)}
              disabled={submitting !== null}
              autoComplete="family-name"
            />
            <TextField
              label="Date de naissance"
              type="date"
              fullWidth
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              disabled={submitting !== null}
              InputLabelProps={{ shrink: true }}
            />

            {submitError && <Alert severity="error">{submitError}</Alert>}

            <Stack direction="row" spacing={1.5}>
              <Button
                fullWidth
                disabled={
                  submitting !== null || !firstname || !lastname || !birthdate
                }
                onClick={() => submit("CONFIRMED")}
                sx={{
                  backgroundColor: "#48C8AF",
                  color: "#FFFFFF",
                  borderRadius: "99px",
                  fontWeight: 700,
                  textTransform: "none",
                  py: 1.2,
                  ":hover": { backgroundColor: "#3AB19B" },
                }}
              >
                {submitting === "CONFIRMED" ? "Envoi…" : "Confirmer"}
              </Button>
              <Button
                fullWidth
                disabled={
                  submitting !== null || !firstname || !lastname || !birthdate
                }
                onClick={() => submit("CANCELLED")}
                sx={{
                  backgroundColor: "#FFFFFF",
                  color: "#E15554",
                  border: "1.5px solid #E15554",
                  borderRadius: "99px",
                  fontWeight: 700,
                  textTransform: "none",
                  py: 1.2,
                  ":hover": { backgroundColor: "#FFF0F0" },
                }}
              >
                {submitting === "CANCELLED" ? "Envoi…" : "Annuler"}
              </Button>
            </Stack>
          </Stack>
        )}

        <Typography
          sx={{
            mt: 4,
            pt: 3,
            borderTop: "1px solid #F0F0F0",
            color: "#91A3B7",
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
