"use client";

import { useEffect, useState, useCallback } from "react";
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
import { IconEye } from "@tabler/icons-react";
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

/**
 * Transcriptions « démo » servant de contenu statique
 * pour la présentation, affichées en fonction de l’intention.
 */
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

/** Libellés « métier » pour les étapes affichées dans la modale. */
const STEP_LABELS = ["Identification", "Type d’examen", "Créneaux horaires"] as const;

/**
 * Retourne la liste d’étapes à afficher selon l’intention normalisée.
 * - prise de rdv : 3 étapes
 * - urgence      : 1 étape
 * - info         : 0 étape
 */
function stepsForIntent(intentNorm: string): string[] {
  if (intentNorm === "prise de rdv") return STEP_LABELS.slice(0, 3);
  if (intentNorm === "urgence")      return STEP_LABELS.slice(0, 1);
  return [];
}

/** Sélecteur de transcription statique selon l’intention normalisée. */
function transcriptForIntent(intentNorm: string): Message[] {
  if (intentNorm === "prise de rdv") return transcriptRDV;
  if (intentNorm === "urgence")      return transcriptURGENCE;
  if (intentNorm === "info")         return transcriptINFO;
  return transcriptRDV;
}

/** Utilitaire d’affichage de date (avec/sans heure). */
function fDate(v?: string | null, withTime = true) {
  if (!v) return "--";
  const d = new Date(v);
  return withTime ? d.toLocaleString() : d.toLocaleDateString();
}

/** Normalisation d’une intention en minuscules/trim pour comparaisons. */
function normalizeIntent(v?: string | null) {
  return (v ?? "").trim().toLowerCase();
}

/**
 * Page LYRAE © Talk
 * - Liste les appels avec filtrage par intention
 * - Affiche une modale de détails incluant une transcription démo
 * - Gère le contexte « centre » (asUserId) pour les administrateurs
 */
export default function TalkPage() {
  // Contexte d’authentification et de navigation.
  const { data: session, status } = useSession();
  const router = useRouter();
  const { selectedUserId, selectedCentre } = useCentre();

  // Définition des intentions disponibles pour le filtrage.
  const intents: IntentConfig[] = [
    { value: "all",          label: "Tous" },
    { value: "prise de rdv", label: "Rendez-vous" },
    { value: "urgence",      label: "Urgences" },
    { value: "info",         label: "Informations" },
  ];

  // État local : filtre, données, chargement, et modale de détails.
  const [selectedIntent, setSelectedIntent] = useState("all");
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);

  /**
   * Récupère les appels selon :
   * - l’intention sélectionnée
   * - le centre sélectionné (asUserId) le cas échéant
   */
  const fetchCalls = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("daysAgo", "all");
      if (selectedIntent !== "all") params.set("intent", selectedIntent);
      if (selectedUserId) params.set("asUserId", String(selectedUserId));

      const res = await fetch(`/api/calls?${params.toString()}`);
      if (!res.ok) throw new Error("Erreur lors du fetch des appels");
      const data: Call[] = await res.json();
      setCalls(data);
    } catch (err) {
      console.error(err);
      setCalls([]);
    } finally {
      setLoading(false);
    }
  }, [selectedIntent, selectedUserId]);

  /** Déclenche le chargement des appels à l’authentification. */
  useEffect(() => {
    if (status === "authenticated") {
      fetchCalls();
    }
  }, [status, fetchCalls]);

  /** Redirige les utilisateurs non authentifiés vers la page de connexion. */
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    }
  }, [status, router]);

  return (
    <Box sx={{ p: 3, bgcolor: "#F8F8F8", minHeight: "100vh" }}>
      {/* Titre de la page */}
      <Typography variant="h4" gutterBottom>
        LYRAE © Talk
      </Typography>

      {/* Carte principale : filtre + liste des appels + action "Voir tous" */}
      <Box sx={{ p: 3, mt: 2, bgcolor: "#fff", borderRadius: 2 }}>
        <Typography variant="h5" gutterBottom>
          Appels Reçus
        </Typography>
        <Typography variant="subtitle2" sx={{ mb: 2, color: "text.secondary" }}>
          {selectedCentre ? "Centre sélectionné" : "Vos données"} — toutes périodes
        </Typography>

        {/* Sélecteur d’intention (filtrage côté API) */}
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

        {/* États de la liste : chargement, vide, ou grille des cartes d’appels */}
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
                      <strong>Date de naissance :</strong> {call.birthdate ? fDate(call.birthdate, false) : "--"}
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

        {/* Lien vers la page liste complète */}
        <Box sx={{ mt: 3, textAlign: "right" }}>
          <Button
            variant="outlined"
            startIcon={<IconEye size={18} />}
            onClick={() => router.push("/client/services/talk/calls")}
            sx={{
              borderColor: "#48C8AF",
              color: "#48C8AF",
              "&:hover": { backgroundColor: "rgba(72,200,175,0.08)" },
            }}
          >
            Voir tous
          </Button>
        </Box>
      </Box>

      {/* Modale de détails d’un appel : méta-infos, étapes mappées et transcription démo */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Détails de l’appel {selectedCall ? `#${selectedCall.id}` : ""}</DialogTitle>
        <DialogContent dividers>
          {selectedCall ? (
            <>
              {/* En-tête : intention + date de création */}
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

              {/* Identité / coordonnées de l’appel */}
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mb: 2 }}>
                <Typography variant="body2"><strong>De :</strong> {selectedCall.caller}</Typography>
                <Typography variant="body2"><strong>À :</strong> {selectedCall.called}</Typography>
                <Typography variant="body2">
                  <strong>Nom :</strong> {selectedCall.firstname ?? "--"} {selectedCall.lastname ?? ""}
                </Typography>
                <Typography variant="body2">
                  <strong>Date de naissance :</strong> {selectedCall.birthdate ? fDate(selectedCall.birthdate, false) : "--"}
                </Typography>
              </Box>

              {/* Étapes (mappées fonctionnellement selon l’intention) */}
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

              {/* Transcription statique (démo) selon l’intention */}
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
