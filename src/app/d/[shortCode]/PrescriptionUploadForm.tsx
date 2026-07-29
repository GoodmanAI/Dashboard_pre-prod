"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Chip,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { CloudUpload, InsertDriveFile, CheckCircle } from "@mui/icons-material";

/**
 * Formulaire d'upload d'ordonnance patient. Servi sur
 * depot-ordonnances.neuracorp.ai/d/[shortCode].
 *
 * Flow patient :
 *   1. Chargement de la page → fetch /api/prescriptions/[token]/status
 *      pour recuperer le libelle patient + date de RDV + statut
 *   2. Affichage du formulaire (code SMS + upload PDF)
 *   3. Soumission → POST /api/prescriptions/[token]/upload en multipart
 *   4. Feedback immediate ("depot reussi" / erreur avec message clair)
 *
 * Design cale sur AppointmentConfirmForm (meme charte teal, mobile-first,
 * carte centree). Objectif : le patient reconnait qu'il est bien sur un
 * site du meme fournisseur que le SMS de confirmation RDV.
 */

type Status = "PENDING" | "UPLOADED" | "ACKED" | "EXPIRED" | "LOCKED";

interface UploadInfo {
  status: Status;
  patientLabel: string;
  appointmentDate: string | null;
  examType: string | null;
  canUpload: boolean;
  expiresAt: string;
  attemptsLeft: number;
}

const EXAM_LABELS: Record<string, string> = {
  scanner: "Scanner",
  irm: "IRM",
  mammo: "Mammographie",
  radiographie: "Radiographie",
  echographie: "Echographie",
};

// Palette brand (mirror de AppointmentConfirmForm pour coherence visuelle)
const BRAND_TEAL = "#48C8AF";
const BRAND_TEAL_DARK = "#3AB19B";
const BRAND_TEAL_SOFT = "#E6F7F3";
const DANGER = "#E15554";
const DANGER_SOFT = "#FBECEB";
const SUCCESS = "#22C55E";
const TEXT_MAIN = "#1F3448";
const TEXT_MUTED = "#7A8FA6";
const CARD_BG = "#FFFFFF";
const PAGE_BG_TOP = "#F0F7F5";
const PAGE_BG_BOTTOM = "#FAFCFB";

// Cap fichier fixe a 8 MB : contrainte Xplore (refuse tout base64 > 12 MB,
// soit ~9 MB de fichier reel). 8 MB * 1.33 = 10.7 MB base64, sous les 12 MB
// avec marge. Aligne avec MAX_FILE_SIZE cote serveur (upload/route.ts).
const MAX_FILE_SIZE_MB = 8;

const ACCEPTED_MIMES = ["application/pdf", "image/jpeg", "image/png"];
const ACCEPTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

function formatFrDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PrescriptionUploadForm({ token }: { token: string }) {
  const [info, setInfo] = useState<UploadInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [finalStatus, setFinalStatus] = useState<Status | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/prescriptions/${token}/status`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Lien invalide");
        }
        return res.json();
      })
      .then((data: UploadInfo) => {
        if (!alive) return;
        setInfo(data);
        if (!data.canUpload) setFinalStatus(data.status);
      })
      .catch((err: Error) => {
        if (!alive) return;
        setLoadError(err.message || "Impossible de charger le lien");
      });
    return () => {
      alive = false;
    };
  }, [token]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setSubmitError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setSubmitError(
        `Fichier trop lourd, max ${MAX_FILE_SIZE_MB} Mo — reduisez la qualite de la photo ou scannez en noir & blanc.`
      );
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    // Verif basique cote client : extension + MIME. La verif reelle est
    // cote serveur via magic bytes (extension manipulable). On donne un
    // feedback rapide au patient pour eviter un upload inutile de HEIC.
    const nameLower = f.name.toLowerCase();
    const extOk = ACCEPTED_EXTENSIONS.some((ext) => nameLower.endsWith(ext));
    const mimeOk = ACCEPTED_MIMES.includes(f.type);
    if (!extOk && !mimeOk) {
      // Detection HEIC/WebP courants pour message d'aide dedie
      if (nameLower.endsWith(".heic") || nameLower.endsWith(".heif") || f.type === "image/heic") {
        setSubmitError(
          "Format HEIC iPhone non supporte. Reglages iOS > Appareil photo > Formats > Le plus compatible, puis reprenez la photo."
        );
      } else if (nameLower.endsWith(".webp") || f.type === "image/webp") {
        setSubmitError(
          "Format WebP non supporte. Convertissez en JPG ou PNG."
        );
      } else {
        setSubmitError(
          "Format non accepte. Formats acceptes : PDF, JPG, PNG."
        );
      }
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const trimmedCode = code.trim();
    if (!/^\d{4,8}$/.test(trimmedCode)) {
      setSubmitError("Le code doit contenir 6 chiffres.");
      return;
    }
    if (!file) {
      setSubmitError("Veuillez selectionner votre ordonnance en PDF.");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("code", trimmedCode);
      formData.append("file", file);

      const res = await fetch(`/api/prescriptions/${token}/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setSuccessMessage(
          data.message ??
            "Votre ordonnance a bien ete deposee. Elle sera transmise au centre."
        );
        setFinalStatus("UPLOADED");
        setInfo((prev) => (prev ? { ...prev, status: "UPLOADED", canUpload: false } : prev));
      } else {
        // Cas fonctionnel (mauvais code, verrouillage, fichier rejete) :
        // affiche l'erreur, potentiellement update le statut si LOCKED.
        setSubmitError(data.error ?? `Erreur (${res.status})`);
        if (data.status === "LOCKED" || data.status === "EXPIRED") {
          setFinalStatus(data.status);
          setInfo((prev) => (prev ? { ...prev, status: data.status, canUpload: false } : prev));
        } else if (typeof data.attemptsLeft === "number") {
          setInfo((prev) => (prev ? { ...prev, attemptsLeft: data.attemptsLeft } : prev));
        }
      }
    } catch (err) {
      console.error(err);
      setSubmitError("Erreur reseau, reessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  // ------- RENDER STATES -------

  if (loadError) {
    return (
      <PageShell>
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          {loadError}
        </Alert>
      </PageShell>
    );
  }

  if (!info) {
    return (
      <PageShell>
        <Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
          <CircularProgress sx={{ color: BRAND_TEAL }} />
          <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
            Chargement…
          </Typography>
        </Stack>
      </PageShell>
    );
  }

  // Statut final : soit succes (UPLOADED apres submit), soit deja fini
  if (finalStatus === "UPLOADED" || finalStatus === "ACKED") {
    return (
      <PageShell>
        <Stack alignItems="center" spacing={2} sx={{ py: 2 }}>
          <CheckCircle sx={{ fontSize: 64, color: SUCCESS }} />
          <Typography variant="h6" sx={{ color: TEXT_MAIN, fontWeight: 700, textAlign: "center" }}>
            Ordonnance deposee
          </Typography>
          <Typography variant="body2" sx={{ color: TEXT_MUTED, textAlign: "center", maxWidth: 380 }}>
            {successMessage ??
              (finalStatus === "ACKED"
                ? "Votre ordonnance a deja ete recuperee par le centre."
                : "Votre ordonnance a bien ete transmise. Vous pouvez fermer cette page.")}
          </Typography>
        </Stack>
      </PageShell>
    );
  }

  if (finalStatus === "EXPIRED") {
    return (
      <PageShell>
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          Ce lien a expire. Contactez votre centre d&apos;imagerie pour deposer votre ordonnance
          autrement.
        </Alert>
      </PageShell>
    );
  }

  if (finalStatus === "LOCKED") {
    return (
      <PageShell>
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          Trop de tentatives incorrectes. Le depot est verrouille pour ce rendez-vous. Merci de
          contacter votre centre.
        </Alert>
      </PageShell>
    );
  }

  const examLabel = info.examType ? EXAM_LABELS[info.examType] ?? info.examType : "";

  return (
    <PageShell>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6" sx={{ color: TEXT_MAIN, fontWeight: 700 }}>
            Bonjour {info.patientLabel}
          </Typography>
          <Typography variant="body2" sx={{ color: TEXT_MUTED, mt: 0.5 }}>
            Merci de deposer l&apos;ordonnance pour votre rendez-vous
            {examLabel ? ` (${examLabel})` : ""}
            {info.appointmentDate ? ` du ${formatFrDate(info.appointmentDate)}` : ""}.
          </Typography>
        </Box>

        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <TextField
              label="Code d'acces (6 chiffres)"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
              inputProps={{
                inputMode: "numeric",
                autoComplete: "one-time-code",
                pattern: "\\d{4,8}",
                style: {
                  fontSize: "1.4rem",
                  letterSpacing: "0.4rem",
                  textAlign: "center",
                  fontFamily: "monospace",
                },
              }}
              disabled={submitting}
              required
              fullWidth
            />

            <Box>
              <Button
                variant="outlined"
                component="label"
                startIcon={<CloudUpload />}
                disabled={submitting}
                fullWidth
                sx={{
                  borderColor: BRAND_TEAL,
                  color: BRAND_TEAL_DARK,
                  py: 1.5,
                  "&:hover": { borderColor: BRAND_TEAL_DARK, bgcolor: BRAND_TEAL_SOFT },
                }}
              >
                {file ? "Changer le fichier" : "Selectionner votre ordonnance (PDF, JPG, PNG)"}
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                />
              </Button>
              {file && (
                <Chip
                  icon={<InsertDriveFile />}
                  label={`${file.name} (${(file.size / 1024).toFixed(0)} KB)`}
                  onDelete={() => {
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  sx={{ mt: 1, maxWidth: "100%" }}
                />
              )}
            </Box>

            {info.attemptsLeft < 3 && info.attemptsLeft > 0 && (
              <Alert severity="warning" sx={{ borderRadius: 2, py: 0.5 }}>
                Il vous reste {info.attemptsLeft} tentative{info.attemptsLeft > 1 ? "s" : ""}{" "}
                avant verrouillage du depot.
              </Alert>
            )}

            {submitError && (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {submitError}
              </Alert>
            )}

            <Button
              type="submit"
              variant="contained"
              disabled={submitting || !file || code.length < 4}
              fullWidth
              sx={{
                py: 1.5,
                bgcolor: BRAND_TEAL,
                "&:hover": { bgcolor: BRAND_TEAL_DARK },
                "&.Mui-disabled": { bgcolor: "#CFE9E1", color: "#FFF" },
              }}
            >
              {submitting ? (
                <>
                  <CircularProgress size={20} sx={{ color: "#FFF", mr: 1 }} />
                  Envoi en cours…
                </>
              ) : (
                "Deposer l'ordonnance"
              )}
            </Button>
          </Stack>
        </Box>
      </Stack>
    </PageShell>
  );
}

/** Wrapper de mise en page — carte blanche centree sur fond doux teal. */
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: `linear-gradient(180deg, ${PAGE_BG_TOP} 0%, ${PAGE_BG_BOTTOM} 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: { xs: 2, sm: 3 },
        py: { xs: 3, sm: 4 },
      }}
    >
      <Box
        sx={{
          bgcolor: CARD_BG,
          borderRadius: { xs: 3, sm: 4 },
          boxShadow: "0 4px 24px rgba(31, 52, 72, 0.08)",
          p: { xs: 3, sm: 4 },
          width: "100%",
          maxWidth: 480,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
