"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Divider,
} from "@mui/material";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { IconEye, IconChevronLeft } from "@tabler/icons-react";
import { useCentre } from "@/app/context/CentreContext";

/** Représentation d’un appel tel que renvoyé par l’API. */
interface Call {
  id: number;
  caller: string;
  called: string;
  intent: string;
  firstname: string | null;
  lastname: string | null;
  birthdate: string | null;
  createdAt: string;
  steps: string[];
}

/** Configuration d’un filtre d’intention (libellé/valeur). */
interface IntentConfig {
  value: string;
  label: string;
}

/** Typage des messages de transcription (démo). */
type Speaker = "Patient" | "Secrétaire";
type Message = { speaker: Speaker; text: string };

/* ===================== DEMO figée ===================== */
const DEMO_MODE = true; // passe à false si tu veux repasser en live
const DEMO_ANCHOR_ISO =
  process.env.NEXT_PUBLIC_DEMO_ANCHOR_ISO || "2025-03-01T12:00:00.000Z";
const DEMO_DAYS = 35; // fenêtre de remap (30–45 ok)

const isAbortError = (e: unknown) =>
  !!e && typeof e === "object" && (e as any).name === "AbortError";

// Bornes (00:00–23:59) du "jour démo" (timezone du navigateur)
function getAnchorDayBounds(anchorIso: string) {
  const anchor = new Date(anchorIso);
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  const end = new Date(anchor);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/* ================== Transcriptions démo ================== */
const transcriptRDV: Message[] = [
  { speaker: "Patient",     text: "Bonjour, je souhaiterais prendre rendez-vous pour une IRM." },
  { speaker: "Secrétaire",  text: "Bien sûr. Pour quelle région anatomique précise souhaitez-vous réaliser l’IRM ?" },
  { speaker: "Patient",     text: "Une IRM du poignet, s’il vous plaît." },
  { speaker: "Secrétaire",  text: "Entendu. La date du 7 juillet vous convient-elle ?" },
  { speaker: "Patient",     text: "Oui." },
  { speaker: "Secrétaire",  text: "C’est noté. Venez 10 minutes en avance avec votre carte Vitale et votre ordonnance. Bonne journée !" },
];

const transcriptINFO: Message[] = [
  { speaker: "Patient",     text: "Bonjour, j’aimerais des informations sur vos examens sans rendez-vous." },
  { speaker: "Secrétaire",  text: "Bonjour ! Les radiographies simples sont sans rendez-vous du lundi au vendredi, 8 h à 17 h." },
  { speaker: "Patient",     text: "Faut-il une ordonnance ?" },
  { speaker: "Secrétaire",  text: "Oui, une ordonnance et votre carte Vitale. Pour l’IRM et le scanner, un rendez-vous est nécessaire." },
  { speaker: "Patient",     text: "Très bien, merci." },
  { speaker: "Secrétaire",  text: "Avec plaisir, bonne journée !" },
];

const transcriptURGENCE: Message[] = [
  { speaker: "Patient",     text: "Bonjour, j'aimerais prendre un rendez-vous en urgence." },
  { speaker: "Secrétaire",  text: "Je note que vous demandez un rendez-vous en urgence, je vais vous rediriger vers une secrétaire pour s'occuper de vous." },
];

const transcriptANNULATION: Message[] = [
  { speaker: "Patient",    text: "Bonjour, je dois annuler mon rendez-vous de demain." },
  { speaker: "Secrétaire", text: "Très bien, je vais regarder. Vous souhaitez annuler votre rendez-vous du 12 juin à 10h, c'est bien ça ?" },
  { speaker: "Patient",    text: "Oui s'il vous plait." },
  { speaker: "Secrétaire", text: "C’est noté, votre rendez-vous est annulé. Vous recevrez une confirmation par SMS. Bonne journée !" },
];

const transcriptCONSULTATION: Message[] = [
  { speaker: "Patient",    text: "Bonjour, je souhaite connaître l'heure exact de mon rendez-vous." },
  { speaker: "Secrétaire", text: "Bien sûr. Je vois que vous avez un rendez-vous pour une IRM du poignet le 10 juin à 10h30." },
  { speaker: "Patient",    text: "Très bien, merci." },
];

/* ====================== Helpers ====================== */
function stepsForIntent(intentNorm: string): string[] {
  const v = intentNorm.toLowerCase();
  if (v === "prise de rdv" || v.includes("rdv"))     return ["Identification", "Type d’examen", "Créneaux horaires"];
  if (v === "urgence"      || v.includes("urg"))     return ["Identification"];
  if (v === "annulation"   || v.includes("annul"))   return ["Identification", "Annulation"];
  if (v === "consultation" || v.includes("consult")) return ["Identification", "Consultation"];
  if (v === "info"         || v.includes("info"))    return [];
  return [];
}

function transcriptForIntent(intentNorm: string): Message[] {
  const v = intentNorm.toLowerCase();
  if (v === "prise de rdv" || v.includes("rdv"))       return transcriptRDV;
  if (v === "urgence"      || v.includes("urg"))       return transcriptURGENCE;
  if (v === "info"         || v.includes("info"))      return transcriptINFO;
  if (v === "annulation"   || v.includes("annul"))     return transcriptANNULATION;
  if (v === "consultation" || v.includes("consult"))   return transcriptCONSULTATION;
  return transcriptRDV;
}

function fDate(v?: string | null, withTime = true) {
  if (!v) return "--";
  const d = new Date(v);
  return withTime ? d.toLocaleString() : d.toLocaleDateString();
}

function normalizeIntent(v?: string | null) {
  return (v ?? "").trim().toLowerCase();
}

/* ====================== Page ====================== */
export default function TalkPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { selectedUserId, selectedCentre } = useCentre();

  const intents: IntentConfig[] = [
    { value: "all",          label: "Tous" },
    { value: "prise de rdv", label: "Rendez-vous" },
    { value: "urgence",      label: "Urgences" },
    { value: "info",         label: "Informations" },
    { value: "annulation",   label: "Annulations" },
    { value: "consultation", label: "Consultations" },
  ];

  const [selectedIntent, setSelectedIntent] = useState("all");
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal Détails
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);

  // Redirige si non authentifié
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    }
  }, [status, router]);

  // Fetch des appels — uniquement la "journée" figée autour de l'anchor démo
  useEffect(() => {
    if (status !== "authenticated") return;

    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);

        const params = new URLSearchParams();
        params.set("daysAgo", "1");
        if (DEMO_MODE) {
          params.set("demo", "1");
          params.set("demoDays", String(DEMO_DAYS));
          params.set("anchor", DEMO_ANCHOR_ISO);
          params.set("demoPreserveDow", "1");
        }
        if (selectedUserId) params.set("asUserId", String(selectedUserId));
        if (selectedIntent !== "all") params.set("intent", selectedIntent);

        const res = await fetch(`/api/calls?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
          headers: { "Cache-Control": "no-store" },
        });
        if (!res.ok) throw new Error("Erreur lors du fetch des appels");
        const data: Call[] = await res.json();

        // On garde strictement la "journée" du jour d'anchor (00:00 -> 23:59)
        const { start, end } = getAnchorDayBounds(DEMO_ANCHOR_ISO);
        const todaysCalls = data.filter((c) => {
          const d = new Date(c.createdAt);
          return d >= start && d <= end;
        });

        setCalls(todaysCalls);
      } catch (e) {
        if (!isAbortError(e)) {
          // autre erreur réseau
          setCalls([]);
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [status, selectedUserId, selectedIntent]);

  return (
    <Box sx={{ p: 3, bgcolor: "#F8F8F8", minHeight: "100vh" }}>
      {/* En-tête */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="h4">LYRAE © Talk</Typography>
        <Button
          variant="outlined"
          startIcon={<IconChevronLeft size={18} />}
          onClick={() => router.push("/client/services/talk")}
          sx={{
            borderColor: "#48C8AF",
            color: "#48C8AF",
            whiteSpace: "nowrap",
            "&:hover": {
              borderColor: "#48C8AF",
              backgroundColor: "rgba(72,200,175,0.08)",
            },
          }}
        >
          Retour à Talk
        </Button>
      </Box>

      {/* Carte principale : filtre + liste des appels */}
      <Box sx={{ p: 3, mt: 1, bgcolor: "#fff", borderRadius: 2 }}>
        <Typography variant="h5" gutterBottom>
          Appels Reçus
        </Typography>
        <Typography variant="subtitle2" sx={{ mb: 2, color: "text.secondary" }}>
          {selectedCentre ? "Centre sélectionné" : "Vos données"} — dernières 24h
        </Typography>

        {/* Filtre d’intention */}
        <Box sx={{ mb: 2, maxWidth: 240 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="intent-label">Filtrer par intention</InputLabel>
            <Select
              labelId="intent-label"
              value={selectedIntent}
              label="Filtrer par intention"
              onChange={(e) => setSelectedIntent(e.target.value as string)}
            >
              {intents.map((it) => (
                <MenuItem key={it.value} value={it.value}>
                  {it.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* Liste / états */}
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress sx={{ color: "#48C8AF" }} />
          </Box>
        ) : calls.length === 0 ? (
          <Alert severity="info">Aucun appel trouvé.</Alert>
        ) : (
          <Grid container spacing={2}>
            {calls.map((call) => (
              <Grid item xs={12} sm={6} md={4} key={call.id}>
                <Card variant="outlined">
                  <CardContent sx={{ p: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      <strong>Intention :</strong> {call.intent || "—"}
                    </Typography>
                    <Typography variant="body2">
                      <strong>De :</strong> {call.caller}
                    </Typography>
                    <Typography variant="body2">
                      <strong>À :</strong> {call.called}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Nom :</strong> {call.firstname ?? "--"} {call.lastname ?? ""}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Date de naissance :</strong>{" "}
                      {call.birthdate ? fDate(call.birthdate, false) : "--"}
                    </Typography>
                    <Typography variant="caption" display="block" sx={{ mt: 1, color: "text.secondary" }}>
                      {fDate(call.createdAt)}
                    </Typography>
                    <Box sx={{ textAlign: "right", mt: 1 }}>
                      <Button
                        size="small"
                        startIcon={<IconEye size={16} />}
                        onClick={() => {
                          setSelectedCall(call);
                          setDetailsOpen(true);
                        }}
                        sx={{
                          borderColor: "#48C8AF",
                          color: "#48C8AF",
                          textTransform: "none",
                          "&:hover": {
                            backgroundColor: "rgba(72,200,175,0.08)",
                            borderColor: "#48C8AF",
                          },
                        }}
                        variant="outlined"
                      >
                        Détails
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      {/* Modale de détails */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Détails de l’appel {selectedCall ? `#${selectedCall.id}` : ""}</DialogTitle>
        <DialogContent dividers>
          {selectedCall ? (
            <>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, flexWrap: "wrap" }}>
                <Chip
                  label={selectedCall.intent || "—"}
                  variant="outlined"
                  size="small"
                  sx={{ borderColor: "#48C8AF", color: "#48C8AF", height: 24 }}
                />
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Créé le {fDate(selectedCall.createdAt)}
                </Typography>
              </Box>

              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mb: 2 }}>
                <Typography variant="body2"><strong>De :</strong> {selectedCall.caller}</Typography>
                {/* <Typography variant="body2"><strong>À :</strong> {selectedCall.called}</Typography> */}
                <Typography variant="body2">
                  <strong>Nom :</strong> {selectedCall.firstname ?? "--"} {selectedCall.lastname ?? ""}
                </Typography>
                <Typography variant="body2">
                  <strong>Date de naissance :</strong>{" "}
                  {selectedCall.birthdate ? fDate(selectedCall.birthdate, false) : "--"}
                </Typography>
              </Box>

              {(() => {
                const intentNorm = normalizeIntent(selectedCall.intent);
                const mappedSteps = stepsForIntent(intentNorm);
                if (!mappedSteps.length) return null;
                return (
                  <>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                      Étapes
                    </Typography>
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                      {mappedSteps.map((label, i) => (
                        <Chip key={i} label={`${label}`} size="small" />
                      ))}
                    </Box>
                  </>
                );
              })()}

              <Divider sx={{ my: 2 }} />

              <Typography variant="h6" sx={{ mb: 1 }}>
                Transcription de l&apos;appel
              </Typography>
              <Box sx={{ p: 2, bgcolor: "#fafafa", borderRadius: 1 }}>
                {transcriptForIntent(normalizeIntent(selectedCall.intent)).map((m, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      display: "flex",
                      justifyContent: m.speaker === "Secrétaire" ? "flex-end" : "flex-start",
                      mb: 1,
                    }}
                  >
                    <Box
                      sx={{
                        p: 1.25,
                        borderRadius: 2,
                        bgcolor: m.speaker === "Secrétaire" ? "rgba(72,200,175,0.15)" : "#eee",
                        maxWidth: "75%",
                      }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                        {m.speaker}
                      </Typography>
                      <Typography variant="body2">{m.text}</Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </>
          ) : (
            <Typography>Aucun appel sélectionné.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDetailsOpen(false)}
            sx={{ color: "#48C8AF", "&:hover": { backgroundColor: "rgba(72,200,175,0.08)" } }}
          >
            Fermer
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
