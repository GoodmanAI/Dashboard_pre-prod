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
import {
  CloudUpload,
  InsertDriveFile,
  CheckCircle,
  FileDownload,
  EditNote,
  InfoOutlined,
} from "@mui/icons-material";
import {
  BLOC_BORDER,
  BRAND_TEAL,
  BRAND_TEAL_DARK,
  BRAND_TEAL_SOFT,
  CARD_BG,
  LIST_BG,
  PAGE_BG_BOTTOM,
  PAGE_BG_TOP,
  SUCCESS,
  TEXT_MAIN,
  TEXT_MUTED,
} from "./charte";
import QuestionnaireEnLigne from "./QuestionnaireEnLigne";

/**
 * Formulaire de depot patient. Servi sur
 * depot-ordonnances.neuracorp.ai/d/[shortCode].
 *
 * Flow patient :
 *   1. Chargement de la page → fetch /api/prescriptions/[token]/status
 *      pour recuperer le libelle patient, la date de RDV et les pieces
 *      attendues avec leurs documents deja envoyes
 *   2. Le code SMS se saisit une fois, en haut ; chaque piece attendue a son
 *      bloc (l'ordonnance, un questionnaire du centre...) avec son propre
 *      choix de fichiers et son bouton d'envoi
 *   3. Un document avec modele (questionnaire IRM du centre...) propose de le
 *      telecharger, de le remplir, puis de le renvoyer dans son bloc. S'il a
 *      ete prepare (`enLigne`, depuis le 20/10/2026), il se remplit sur la
 *      page (QuestionnaireEnLigne) ; le papier reste possible en second choix
 *   4. Soumission → un POST /api/prescriptions/[token]/upload par fichier,
 *      l'un apres l'autre, avec le `pieceId` du bloc (nginx borne le corps a
 *      10 Mo, et chaque fichier a sa propre erreur)
 *   5. Les blocs restent ouverts : le patient peut ajouter un document plus
 *      tard avec le meme lien, jusqu'a 5 par piece et jusqu'a l'heure du RDV
 *
 * Documents demandes depuis le 11/10/2026 : plans/2026-10-documents-demandes.md
 * (workspace).
 *
 * Design cale sur AppointmentConfirmForm (meme charte teal, mobile-first,
 * carte centree). Objectif : le patient reconnait qu'il est bien sur un
 * site du meme fournisseur que le SMS de confirmation RDV.
 */

type Status =
  "PENDING" | "UPLOADED" | "ACKED" | "REJECTED" | "EXPIRED" | "LOCKED";

interface PieceInfo {
  id: number | null;
  piece: "ordonnance" | "document";
  libelle: string;
  avecModele: boolean;
  /** Questionnaire a remplir sur la page (plans/2026-10-questionnaires-en-ligne.md). */
  enLigne?: boolean;
  documents: { uploadedAt: string }[];
}

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
  pieces?: PieceInfo[];
  /** Message du centre (parametrage, « Depot d'ordonnance patient »), en bas de page. */
  messageCentre?: string | null;
}

const EXAM_LABELS: Record<string, string> = {
  scanner: "scanner",
  irm: "IRM",
  mammo: "mammographie",
  radiographie: "radiographie",
  echographie: "échographie",
};


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

/**
 * Les pieces de la page. Une reponse sans `pieces` (serveur d'avant le
 * 11/10/2026) se lit comme une seule piece « ordonnance ».
 */
function piecesDe(info: UploadInfo): PieceInfo[] {
  if (info.pieces && info.pieces.length > 0) return info.pieces;
  return [
    {
      id: null,
      piece: "ordonnance",
      libelle: "Ordonnance",
      avecModele: false,
      documents: info.documents,
    },
  ];
}

export default function PrescriptionUploadForm({ token }: { token: string }) {
  const [info, setInfo] = useState<UploadInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState("");
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

  /** Un document de plus dans une piece, apres un envoi reussi. */
  function documentEnvoye(index: number) {
    setInfo((prev) => {
      if (!prev) return prev;
      const maintenant = { uploadedAt: new Date().toISOString() };
      const pieces = piecesDe(prev).map((p, i) =>
        i === index ? { ...p, documents: [...p.documents, maintenant] } : p
      );
      return {
        ...prev,
        status: "UPLOADED",
        attemptsLeft: 3,
        documents: [...prev.documents, maintenant],
        pieces,
      };
    });
  }

  function codeRefuse(attemptsLeft: number) {
    setInfo((prev) => (prev ? { ...prev, attemptsLeft } : prev));
  }

  // ------- RENDER STATES -------

  if (finalStatus === "EXPIRED") {
    return (
      <PageShell>
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          Ce lien a expiré : l&apos;heure de votre rendez-vous est passée.
          Apportez vos documents le jour de l&apos;examen, ou contactez votre
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
  const pieces = piecesDe(info);
  const ordonnanceSeule = pieces.length === 1 && pieces[0].piece === "ordonnance";
  const quoi = ordonnanceSeule
    ? "l'ordonnance"
    : pieces.length === 1
      ? `le document « ${pieces[0].libelle} »`
      : "les documents";

  return (
    <PageShell>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h6" sx={{ color: TEXT_MAIN, fontWeight: 700 }}>
            Bonjour {info.patientLabel}
          </Typography>
          <Typography variant="body2" sx={{ color: TEXT_MUTED, mt: 0.5 }}>
            Déposez ici {quoi} de votre rendez-vous
            {examLabel ? ` (${examLabel})` : ""}
            {info.appointmentDate
              ? ` du ${formatFrDate(info.appointmentDate)}`
              : ""}
            .
          </Typography>
          <Typography variant="body2" sx={{ color: TEXT_MUTED, mt: 1 }}>
            Vous pouvez envoyer jusqu&apos;à {info.maxDocuments} fichiers par
            document (plusieurs pages, plusieurs photos), en une ou plusieurs
            fois, avec ce même lien, jusqu&apos;à l&apos;heure du rendez-vous.
          </Typography>
        </Box>

        <TextField
          label="Code reçu par SMS ou par mail (6 chiffres)"
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
          required
          fullWidth
        />

        {info.attemptsLeft < 3 && info.attemptsLeft > 0 && (
          <Alert severity="warning" sx={{ borderRadius: 2, py: 0.5 }}>
            Il vous reste {pluriel(info.attemptsLeft, "essai")} avant que le
            dépôt soit verrouillé.
          </Alert>
        )}

        {pieces.map((p, i) => (
          <BlocPiece
            key={p.id ?? `piece-${i}`}
            token={token}
            piece={p}
            code={code}
            maxDocuments={info.maxDocuments}
            seul={pieces.length === 1}
            onEnvoye={() => documentEnvoye(i)}
            onCodeRefuse={codeRefuse}
            onFin={setFinalStatus}
          />
        ))}

        {info.messageCentre && (
          <Box
            sx={{
              display: "flex",
              gap: 1.25,
              p: 2,
              borderRadius: 2,
              bgcolor: BRAND_TEAL_SOFT,
            }}
          >
            <InfoOutlined sx={{ fontSize: 20, color: BRAND_TEAL_DARK, mt: "1px" }} />
            <Typography
              variant="body2"
              sx={{ color: TEXT_MAIN, whiteSpace: "pre-line", lineHeight: 1.55 }}
            >
              {info.messageCentre}
            </Typography>
          </Box>
        )}
      </Stack>
    </PageShell>
  );
}

/**
 * Un bloc par piece attendue : ce qu'on demande, le modele a telecharger s'il
 * y en a un, les fichiers deja envoyes, le choix de fichiers et l'envoi.
 */
function BlocPiece({
  token,
  piece,
  code,
  maxDocuments,
  seul,
  onEnvoye,
  onCodeRefuse,
  onFin,
}: {
  token: string;
  piece: PieceInfo;
  code: string;
  maxDocuments: number;
  seul: boolean;
  onEnvoye: () => void;
  onCodeRefuse: (attemptsLeft: number) => void;
  onFin: (s: "EXPIRED" | "LOCKED") => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [questionnaireOuvert, setQuestionnaireOuvert] = useState(false);
  // Questionnaire en ligne : le depot d'un fichier (papier rempli a la main)
  // ne s'affiche qu'a la demande, pour ne pas faire hesiter entre deux chemins.
  const [papier, setPapier] = useState(false);

  const restants = Math.max(0, maxDocuments - piece.documents.length);
  const complet = restants === 0;
  const estOrdonnance = piece.piece === "ordonnance";
  const enLigne = !!piece.enLigne && piece.id !== null;

  function ouvrirQuestionnaire() {
    setSubmitError(null);
    setSuccessMessage(null);
    if (!/^\d{4,8}$/.test(code.trim())) {
      setSubmitError(
        "Saisissez d'abord le code à 6 chiffres, en haut de la page. Vous le trouvez dans le SMS ou le mail."
      );
      return;
    }
    setQuestionnaireOuvert(true);
  }

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
        `Vous pouvez encore envoyer ${pluriel(restants, "fichier")} ici. Retirez-en ${
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
    setSubmitError(null);
    setSuccessMessage(null);

    const trimmedCode = code.trim();
    if (!/^\d{4,8}$/.test(trimmedCode)) {
      setSubmitError(
        "Saisissez d'abord le code à 6 chiffres, en haut de la page. Vous le trouvez dans le SMS ou le mail."
      );
      return;
    }
    if (files.length === 0) {
      setSubmitError("Choisissez au moins un fichier.");
      return;
    }
    if (files.length > restants) {
      setSubmitError(
        `Vous pouvez encore envoyer ${pluriel(restants, "fichier")} ici.`
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
        if (piece.id !== null) formData.append("pieceId", String(piece.id));

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
            onFin(data.status);
          } else if (typeof data.attemptsLeft === "number") {
            onCodeRefuse(data.attemptsLeft);
          }
          break;
        }

        envoyes++;
        onEnvoye();
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
          ? `${envoyes} fichiers envoyés. Ils seront transmis au centre.`
          : "Fichier envoyé. Il sera transmis au centre."
      );
    }
  }

  return (
    <Box
      component="section"
      sx={
        seul
          ? undefined
          : { border: `1px solid ${BLOC_BORDER}`, borderRadius: 2, p: 2 }
      }
    >
      <Stack spacing={1.5}>
        {!seul && (
          <Stack direction="row" spacing={1} alignItems="center">
            {piece.documents.length > 0 && (
              <CheckCircle sx={{ fontSize: 20, color: SUCCESS }} />
            )}
            <Typography
              variant="subtitle1"
              component="h2"
              sx={{ color: TEXT_MAIN, fontWeight: 700 }}
            >
              {piece.libelle}
            </Typography>
          </Stack>
        )}

        {enLigne && piece.id !== null && !complet && (
          <Box>
            <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
              {piece.documents.length > 0
                ? "Vous avez déjà envoyé ce questionnaire. Si une réponse a changé, vous pouvez le remplir de nouveau."
                : "Répondez aux questions ici, puis signez. Le document est envoyé au centre, rien à imprimer."}
            </Typography>
            <Button
              variant="contained"
              onClick={ouvrirQuestionnaire}
              startIcon={<EditNote />}
              fullWidth
              sx={{
                mt: 1.5,
                py: 1.5,
                bgcolor: BRAND_TEAL,
                "&:hover": { bgcolor: BRAND_TEAL_DARK },
              }}
            >
              {piece.documents.length > 0 ? "Remplir de nouveau" : "Remplir en ligne"}
            </Button>
            {!papier && (
              <Button
                onClick={() => setPapier(true)}
                sx={{ mt: 0.5, px: 0, color: BRAND_TEAL_DARK, fontWeight: 600 }}
              >
                Je préfère le remplir sur papier
              </Button>
            )}
            <QuestionnaireEnLigne
              token={token}
              pieceId={piece.id}
              code={code}
              ouvert={questionnaireOuvert}
              onFermer={() => setQuestionnaireOuvert(false)}
              onEnvoye={() => {
                setQuestionnaireOuvert(false);
                onEnvoye();
                setSuccessMessage("Questionnaire envoyé. Il sera transmis au centre.");
              }}
              onCodeRefuse={(n) => {
                setQuestionnaireOuvert(false);
                onCodeRefuse(n);
                setSubmitError(
                  "Le code n'est pas le bon. Vérifiez-le en haut de la page, puis réessayez."
                );
              }}
              onFin={(st) => {
                setQuestionnaireOuvert(false);
                onFin(st);
              }}
            />
          </Box>
        )}

        {piece.avecModele && piece.id !== null && (!enLigne || papier) && (
          <Box>
            <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
              Téléchargez le document de votre centre, remplissez-le, puis
              renvoyez-le ici (en PDF, ou en photo de chaque page).
            </Typography>
            <Button
              component="a"
              href={`/api/prescriptions/${token}/modele/${piece.id}`}
              variant="text"
              startIcon={<FileDownload />}
              sx={{ mt: 0.5, px: 0, color: BRAND_TEAL_DARK, fontWeight: 600 }}
            >
              Télécharger « {piece.libelle} »
            </Button>
          </Box>
        )}

        {!piece.avecModele && !estOrdonnance && (
          <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
            Envoyez ce document en PDF, ou en photo de chaque page.
          </Typography>
        )}

        {piece.documents.length > 0 && (
          <Box sx={{ bgcolor: LIST_BG, borderRadius: 2, px: 2, py: 1.5 }}>
            <Typography
              variant="body2"
              sx={{ color: TEXT_MAIN, fontWeight: 600, mb: 0.5 }}
            >
              Déjà envoyés : {piece.documents.length} sur {maxDocuments}
            </Typography>
            <Stack
              component="ul"
              spacing={0.5}
              sx={{ m: 0, p: 0, listStyle: "none" }}
            >
              {piece.documents.map((d, i) => (
                <Stack
                  component="li"
                  key={`${d.uploadedAt}-${i}`}
                  direction="row"
                  spacing={1}
                  alignItems="center"
                >
                  <CheckCircle sx={{ fontSize: 18, color: SUCCESS }} />
                  <Typography variant="body2" sx={{ color: TEXT_MAIN }}>
                    Fichier {i + 1}, envoyé {formatEnvoi(d.uploadedAt)}
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

        {enLigne && !papier && !complet ? (
          submitError && (
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              {submitError}
            </Alert>
          )
        ) : complet ? (
          <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
            Vous avez envoyé {maxDocuments} fichiers ici, c&apos;est le
            maximum. Pour en ajouter un, contactez votre centre.
          </Typography>
        ) : (
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={1.5}>
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
                    ? "Ajouter un autre fichier"
                    : piece.documents.length > 0
                      ? "Choisir un autre fichier (PDF, JPG, PNG)"
                      : "Choisir vos fichiers (PDF, JPG, PNG)"}
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
                  Encore {pluriel(restants, "fichier")} possible
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
                  files.length > restants
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
                  `Envoyer les ${files.length} fichiers`
                ) : seul ? (
                  "Envoyer le fichier"
                ) : (
                  `Envoyer « ${piece.libelle} »`
                )}
              </Button>
            </Stack>
          </Box>
        )}
      </Stack>
    </Box>
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
