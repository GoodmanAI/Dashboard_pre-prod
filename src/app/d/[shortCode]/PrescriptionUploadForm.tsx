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
 *      pour recuperer le libelle patient, la date de RDV et les documents
 *      deja envoyes
 *   2. Affichage du formulaire (code SMS + un ou plusieurs fichiers)
 *   3. Soumission → un POST /api/prescriptions/[token]/upload par fichier,
 *      l'un apres l'autre (nginx borne le corps a 10 Mo, et chaque fichier
 *      a sa propre erreur)
 *   4. Le formulaire reste ouvert : le patient peut ajouter un document plus
 *      tard avec le meme lien, jusqu'a 5 et jusqu'a l'heure du RDV
 *
 * Design cale sur AppointmentConfirmForm (meme charte teal, mobile-first,
 * carte centree). Objectif : le patient reconnait qu'il est bien sur un
 * site du meme fournisseur que le SMS de confirmation RDV.
 */

type Status =
  "PENDING" | "UPLOADED" | "ACKED" | "REJECTED" | "EXPIRED" | "LOCKED";

interface UploadInfo {
  status: Status;
  patientLabel: string;
  appointmentDate: string | null;
  examType: string | null;
  canUpload: boolean;
  expiresAt: string;
  attemptsLeft: number;
  documents: { uploadedAt: string }[];
  maxDocuments: number;
}

const EXAM_LABELS: Record<string, string> = {
  scanner: "scanner",
  irm: "IRM",
  mammo: "mammographie",
  radiographie: "radiographie",
  echographie: "échographie",
};

// Palette brand (mirror de AppointmentConfirmForm pour coherence visuelle)
const BRAND_TEAL = "var(--accent)";
const BRAND_TEAL_DARK = "var(--accent-press)";
const BRAND_TEAL_SOFT = "#E6F7F3";
const SUCCESS = "#22C55E";
const TEXT_MAIN = "#1F3448";
const TEXT_MUTED = "#7A8FA6";
const CARD_BG = "#FFFFFF";
const PAGE_BG_TOP = "#F0F7F5";
const PAGE_BG_BOTTOM = "#FAFCFB";
const LIST_BG = "#F0F7F5";

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

function formatEnvoi(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const jour = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const heure = d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `le ${jour} à ${heure}`;
}

function pluriel(n: number, mot: string): string {
  return `${n} ${mot}${n > 1 ? "s" : ""}`;
}

/** Message d'erreur si le fichier ne peut pas partir, sinon null. */
function verifierFichier(f: File): string | null {
  if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `« ${f.name} » est trop lourd (${MAX_FILE_SIZE_MB} Mo au plus). Réduisez la qualité de la photo ou scannez en noir et blanc.`;
  }
  // Verif basique cote client : extension + MIME. La verif reelle est
  // cote serveur via magic bytes (extension manipulable). On donne un
  // feedback rapide au patient pour eviter un upload inutile de HEIC.
  const nameLower = f.name.toLowerCase();
  const extOk = ACCEPTED_EXTENSIONS.some((ext) => nameLower.endsWith(ext));
  const mimeOk = ACCEPTED_MIMES.includes(f.type);
  if (extOk || mimeOk) return null;
  if (
    nameLower.endsWith(".heic") ||
    nameLower.endsWith(".heif") ||
    f.type === "image/heic"
  ) {
    return "Le format HEIC de l'iPhone n'est pas accepté. Dans Réglages, Appareil photo, Formats, choisissez « Le plus compatible », puis reprenez la photo.";
  }
  if (nameLower.endsWith(".webp") || f.type === "image/webp") {
    return "Le format WebP n'est pas accepté. Convertissez l'image en JPG ou en PNG.";
  }
  return `« ${f.name} » n'est pas dans un format accepté. Envoyez un PDF, un JPG ou un PNG.`;
}

export default function PrescriptionUploadForm({ token }: { token: string }) {
  const [info, setInfo] = useState<UploadInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [finalStatus, setFinalStatus] = useState<"EXPIRED" | "LOCKED" | null>(
    null
  );

  useEffect(() => {
    let alive = true;
    fetch(`/api/prescriptions/${token}/status`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? "Ce lien n'est plus valable. L'heure de votre rendez-vous est peut-être passée."
              : "Impossible d'ouvrir le lien. Rechargez la page."
          );
        }
        return res.json();
      })
      .then((data: UploadInfo) => {
        if (!alive) return;
        if (data.status === "LOCKED") {
          setFinalStatus("LOCKED");
          return;
        }
        setInfo({ ...data, documents: data.documents ?? [] });
      })
      .catch((err: Error) => {
        if (!alive) return;
        setLoadError(err.message);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const restants = info
    ? Math.max(0, info.maxDocuments - info.documents.length)
    : 0;

  function resetInput() {
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const choisis = Array.from(e.target.files ?? []);
    resetInput();
    setSubmitError(null);
    setSuccessMessage(null);
    if (choisis.length === 0) return;

    for (const f of choisis) {
      const erreur = verifierFichier(f);
      if (erreur) {
        setSubmitError(erreur);
        return;
      }
    }
    // Ajout a la selection en cours (le patient peut choisir en plusieurs fois)
    const selection = [...files, ...choisis];
    if (selection.length > restants) {
      setSubmitError(
        `Vous pouvez encore envoyer ${pluriel(restants, "document")}. Retirez-en ${
          selection.length - restants
        } de la liste.`
      );
    }
    setFiles(selection);
  }

  function retirer(index: number) {
    const selection = files.filter((_, i) => i !== index);
    setFiles(selection);
    if (selection.length <= restants) setSubmitError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!info) return;
    setSubmitError(null);
    setSuccessMessage(null);

    const trimmedCode = code.trim();
    if (!/^\d{4,8}$/.test(trimmedCode)) {
      setSubmitError(
        "Le code contient 6 chiffres. Vous le trouvez dans le SMS."
      );
      return;
    }
    if (files.length === 0) {
      setSubmitError("Choisissez au moins un document.");
      return;
    }
    if (files.length > restants) {
      setSubmitError(
        `Vous pouvez encore envoyer ${pluriel(restants, "document")}.`
      );
      return;
    }

    setSubmitting(true);
    let envoyes = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        setProgress({ current: i + 1, total: files.length });
        const formData = new FormData();
        formData.append("code", trimmedCode);
        formData.append("file", files[i]);

        const res = await fetch(`/api/prescriptions/${token}/upload`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const prefixe =
            files.length > 1 ? `« ${files[i].name} » n'a pas été envoyé. ` : "";
          setSubmitError(
            prefixe +
              (data.error ??
                `L'envoi a échoué (erreur ${res.status}). Réessayez.`)
          );
          if (data.status === "LOCKED" || data.status === "EXPIRED") {
            setFinalStatus(data.status);
          } else if (typeof data.attemptsLeft === "number") {
            setInfo((prev) =>
              prev ? { ...prev, attemptsLeft: data.attemptsLeft } : prev
            );
          }
          break;
        }

        envoyes++;
        setInfo((prev) =>
          prev
            ? {
                ...prev,
                status: "UPLOADED",
                attemptsLeft: 3,
                documents: [
                  ...prev.documents,
                  { uploadedAt: new Date().toISOString() },
                ],
              }
            : prev
        );
      }
    } catch (err) {
      console.error(err);
      setSubmitError(
        "La connexion a été coupée. Vérifiez votre réseau et réessayez."
      );
    } finally {
      // Les fichiers envoyes sortent de la selection, les autres restent
      // pour un nouvel essai.
      setFiles((prev) => prev.slice(envoyes));
      setSubmitting(false);
      setProgress(null);
    }

    if (envoyes > 0) {
      setSuccessMessage(
        envoyes > 1
          ? `${envoyes} documents envoyés. Ils seront transmis au centre.`
          : "Document envoyé. Il sera transmis au centre."
      );
    }
  }

  // ------- RENDER STATES -------

  if (finalStatus === "EXPIRED") {
    return (
      <PageShell>
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          Ce lien a expiré : l&apos;heure de votre rendez-vous est passée.
          Apportez votre ordonnance le jour de l&apos;examen, ou contactez votre
          centre.
        </Alert>
      </PageShell>
    );
  }

  if (finalStatus === "LOCKED") {
    return (
      <PageShell>
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          Le code a été saisi trop de fois sans succès, et le dépôt est
          verrouillé pour ce rendez-vous. Contactez votre centre.
        </Alert>
      </PageShell>
    );
  }

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

  const examLabel = info.examType
    ? (EXAM_LABELS[info.examType] ?? info.examType)
    : "";
  const complet = restants === 0;

  return (
    <PageShell>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6" sx={{ color: TEXT_MAIN, fontWeight: 700 }}>
            Bonjour {info.patientLabel}
          </Typography>
          <Typography variant="body2" sx={{ color: TEXT_MUTED, mt: 0.5 }}>
            Déposez ici l&apos;ordonnance de votre rendez-vous
            {examLabel ? ` (${examLabel})` : ""}
            {info.appointmentDate
              ? ` du ${formatFrDate(info.appointmentDate)}`
              : ""}
            .
          </Typography>
          <Typography variant="body2" sx={{ color: TEXT_MUTED, mt: 1 }}>
            Vous pouvez envoyer jusqu&apos;à {info.maxDocuments} documents (une
            ordonnance de plusieurs pages, un courrier de votre médecin), en une
            ou plusieurs fois, avec ce même lien, jusqu&apos;à l&apos;heure du
            rendez-vous.
          </Typography>
        </Box>

        {info.documents.length > 0 && (
          <Box sx={{ bgcolor: LIST_BG, borderRadius: 2, px: 2, py: 1.5 }}>
            <Typography
              variant="body2"
              sx={{ color: TEXT_MAIN, fontWeight: 600, mb: 0.5 }}
            >
              Déjà envoyés : {info.documents.length} sur {info.maxDocuments}
            </Typography>
            <Stack
              component="ul"
              spacing={0.5}
              sx={{ m: 0, p: 0, listStyle: "none" }}
            >
              {info.documents.map((d, i) => (
                <Stack
                  component="li"
                  key={`${d.uploadedAt}-${i}`}
                  direction="row"
                  spacing={1}
                  alignItems="center"
                >
                  <CheckCircle sx={{ fontSize: 18, color: SUCCESS }} />
                  <Typography variant="body2" sx={{ color: TEXT_MAIN }}>
                    Document {i + 1}, envoyé {formatEnvoi(d.uploadedAt)}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        )}

        {successMessage && (
          <Alert severity="success" sx={{ borderRadius: 2 }}>
            {successMessage}
          </Alert>
        )}

        {complet ? (
          <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
            Vous avez envoyé {info.maxDocuments} documents, c&apos;est le
            maximum. Pour en ajouter un, contactez votre centre. Vous pouvez
            fermer cette page.
          </Typography>
        ) : (
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <TextField
                label="Code reçu par SMS (6 chiffres)"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 8))
                }
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
                  disabled={submitting || files.length >= restants}
                  fullWidth
                  sx={{
                    borderColor: BRAND_TEAL,
                    color: BRAND_TEAL_DARK,
                    py: 1.5,
                    "&:hover": {
                      borderColor: BRAND_TEAL_DARK,
                      bgcolor: BRAND_TEAL_SOFT,
                    },
                  }}
                >
                  {files.length > 0
                    ? "Ajouter un autre document"
                    : info.documents.length > 0
                      ? "Choisir un autre document (PDF, JPG, PNG)"
                      : "Choisir vos documents (PDF, JPG, PNG)"}
                  <input
                    ref={fileInputRef}
                    type="file"
                    hidden
                    multiple
                    accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                    onChange={handleFileChange}
                  />
                </Button>
                <Typography
                  variant="caption"
                  sx={{ color: TEXT_MUTED, display: "block", mt: 0.5 }}
                >
                  Encore {pluriel(restants, "document")} possible
                  {restants > 1 ? "s" : ""}, {MAX_FILE_SIZE_MB} Mo au plus
                  chacun.
                </Typography>
                {files.length > 0 && (
                  <Stack
                    direction="row"
                    flexWrap="wrap"
                    useFlexGap
                    spacing={1}
                    sx={{ mt: 1 }}
                  >
                    {files.map((f, i) => (
                      <Chip
                        key={`${f.name}-${f.size}-${i}`}
                        icon={<InsertDriveFile />}
                        label={`${f.name} (${(f.size / 1024).toFixed(0)} Ko)`}
                        onDelete={submitting ? undefined : () => retirer(i)}
                        sx={{ maxWidth: "100%" }}
                      />
                    ))}
                  </Stack>
                )}
              </Box>

              {info.attemptsLeft < 3 && info.attemptsLeft > 0 && (
                <Alert severity="warning" sx={{ borderRadius: 2, py: 0.5 }}>
                  Il vous reste {pluriel(info.attemptsLeft, "essai")} avant que
                  le dépôt soit verrouillé.
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
                disabled={
                  submitting ||
                  files.length === 0 ||
                  files.length > restants ||
                  code.length < 4
                }
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
                    {progress && progress.total > 1
                      ? `Envoi ${progress.current} sur ${progress.total}…`
                      : "Envoi en cours…"}
                  </>
                ) : files.length > 1 ? (
                  `Envoyer les ${files.length} documents`
                ) : (
                  "Envoyer le document"
                )}
              </Button>
            </Stack>
          </Box>
        )}
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
