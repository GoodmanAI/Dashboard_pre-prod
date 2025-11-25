"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TextField,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Chip,
  IconButton,
  Stack,
  Snackbar,
  Alert,
  Divider,
  Radio,
  Switch
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SaveIcon from "@mui/icons-material/Save";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import { useRouter } from "next/navigation";
import { IconChevronLeft } from "@tabler/icons-react";
import { useCentre } from "@/app/context/CentreContext";

type ExamKey = "radiographie" | "irm" | "echographie" | "scanner" | "mammo";
type VoiceKey = "femme" | "homme" | "neutre";

type TalkSettings = {
  voice: VoiceKey;
  botName: string;
  welcomeMsg: string;
  emergencyOutOfHours: string;
  callMode: "decroche" | "debordement";
  fullPlanningNotes: string[];
  examsAccepted: Record<ExamKey, boolean>;
  examQuestions: Record<ExamKey, string[]>;
  specificNotes: string;
  reconnaissance: boolean;
};

const DEFAULTS: TalkSettings = {
  voice: "femme",
  botName: "Lyrae",
  welcomeMsg:
    "Bonjour, je suis Lyrae, l’assistant vocal du centre. Comment puis-je vous aider ?",
  emergencyOutOfHours:
    "En cas d’urgence hors horaires d’ouverture, merci d’appeler le 15 (SAMU) ou de vous rendre aux urgences les plus proches.",
  callMode: "decroche",
  fullPlanningNotes: [
    "Rappeler le lendemain matin",
    "Consulter le site web pour les créneaux mis à jour",
  ],
  examsAccepted: {
    radiographie: true,
    irm: true,
    echographie: true,
    scanner: true,
    mammo: false,
  },
  examQuestions: {
    radiographie: ["Avez‑vous mal à la cheville si vous appuyez dessus ou la faites pivoter ?", "Votre cheville est‑elle souvent enflée, surtout après activité ?", "Êtes‑vous tombé ou avez vous reçu un coup récemment ?"],
    echographie: [
      "Avez-vous senti de petites boules dans le cou ?",
      "Voyez-vous un gonflement du cou ?",
      "Avez-vous mal au cou ?"
    ],
    scanner: ["Avez-vous eu de la fièvre récente avec une douleur au ventre localisée ?", "Avez-vous des vomissements répétés et l’impression que les gaz ou les selles ne passent plus ?", "Avez-vous été opéré de l’abdomen ou eu une endoscopie/intervention récente ?"],
    irm: [
      "Avez-vous mal à l’épaule depuis plusieurs jours ?",
      "Avez-vous du mal à lever le bras ou à le bouger normalement ?",
      "Vous êtes-vous récemment cogné ou blessé à l’épaule ?"
    ],
    mammo: [
      "Avez-vous été opéré du sein?",
      "Êtes-vous une personne à mobilité réduite?"
    ],
  },
  specificNotes:
    "Accès parking limité : privilégier le parking P2 (entrée rue des Fleurs).",
  reconnaissance: false
};

/**
 * Démos de voix (fichiers dans /public/voices/)
 */
const VOICE_DEMOS: Array<{
  key: VoiceKey;
  label: string;
  desc: string;
  src: string;
}> = [
  {
    key: "femme",
    label: "Voix 1",
    desc: "Voix réaliste, idéale pour l’accueil.",
    src: "/voices/voix_1.mp3",
  },
  {
    key: "homme",
    label: "Voix 2",
    desc: "",
    src: "/voices/voix_2.mp3",
  },
  {
    key: "neutre",
    label: "Voix 3",
    desc: "",
    src: "/voices/voix_3.mp3",
  },
];

function useLocalSettingsStorage(selectedUserId?: number | null) {
  const storageKey = useMemo(
    () => `TALK_SETTINGS::${selectedUserId ?? "self"}`,
    [selectedUserId]
  );

  const load = useCallback((): TalkSettings => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return DEFAULTS;
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULTS,
        ...parsed,
        examsAccepted: {
          ...DEFAULTS.examsAccepted,
          ...(parsed?.examsAccepted || {}),
        },
        examQuestions: {
          ...DEFAULTS.examQuestions,
          ...(parsed?.examQuestions || {}),
        },
      } as TalkSettings;
    } catch {
      return DEFAULTS;
    }
  }, [storageKey]);

  const save = useCallback(
    (val: TalkSettings) => {
      localStorage.setItem(storageKey, JSON.stringify(val));
    },
    [storageKey]
  );

  const reset = useCallback(() => {
    localStorage.setItem(storageKey, JSON.stringify(DEFAULTS));
  }, [storageKey]);

  return { storageKey, load, save, reset };
}

function QuestionsEditor({
  label,
  value,
  onChange,
  max = 3,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  const canAdd = value.length < max;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle2">{label}</Typography>
        <Chip label={`${value.length}/${max}`} size="small" />
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => canAdd && onChange([...value, ""])}
          disabled={!canAdd}
          sx={{ textTransform: "none" }}
        >
          Ajouter une question
        </Button>
      </Stack>

      <Stack spacing={1}>
        {value.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Aucune question — vous pouvez en ajouter (1 à {max}).
          </Typography>
        )}
        {value.map((q, idx) => (
          <Stack key={idx} direction="row" spacing={1}>
            <TextField
              size="small"
              fullWidth
              value={q}
              onChange={(e) => {
                const next = [...value];
                next[idx] = e.target.value;
                onChange(next);
              }}
              placeholder={`Question ${idx + 1}`}
            />
            <IconButton
              aria-label="remove"
              onClick={() => onChange(value.filter((_, i) => i !== idx))}
            >
              <DeleteIcon />
            </IconButton>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

interface TalkPageProps {
    params: {
        id: string; // captured from the URL
    };
}

export default function ParametrageTalkPage({ params }: TalkPageProps) {
  const router = useRouter();
  const { selectedUserId, selectedCentre } = useCentre();
  const userProductId = Number(params.id);
  
  const { load, save, reset, storageKey } = useLocalSettingsStorage(selectedUserId);

  const [settings, setSettings] = useState<TalkSettings>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState<{
    open: boolean;
    msg: string;
    sev: "success" | "error";
  }>({ open: false, msg: "", sev: "success" });

  // Audio preview state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingKey, setPlayingKey] = useState<VoiceKey | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {

    async function fetchSettings() {
      try {
        setLoading(true);
        const res = await fetch(`/api/configuration?userProductId=${userProductId}`);
        if (!res.ok) {
          console.error("Failed to load settings:", res.statusText);
          setLoading(false);
          return;
        }

        const data = await res.json();
        // setSettings((prev) => ({
        //   ...prev,
        //   ...data, // Merge fetched settings into state
        // }));
      } catch (error) {
        console.error("Error fetching settings:", error);
      } finally {
        console.log("settings after fetch", settings);
        setLoading(false);
      }
    }
    
    fetchSettings();
  }, [userProductId, settings]);

  useEffect(() => {
    setSettings(load());
  }, [load, storageKey]);

  useEffect(() => {
    return () => {
      // cleanup audio on unmount
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current.onended = null;
      }
    };
  }, []);

  const update = <K extends keyof TalkSettings>(key: K, val: TalkSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: val }));

  const updateExamAccepted = (k: ExamKey, checked: boolean) =>
    setSettings((s) => ({ ...s, examsAccepted: { ...s.examsAccepted, [k]: checked } }));

  const updateExamQuestions = (k: ExamKey, list: string[]) =>
    setSettings((s) => ({ ...s, examQuestions: { ...s.examQuestions, [k]: list.slice(0, 3) } }));

  const handleSwitchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSettings(prev => ({
      ...prev,
      reconnaissance: event.target.checked,
    }));
  };
  
  const removePlanningNote = (idx: number) =>
    update(
      "fullPlanningNotes",
      settings.fullPlanningNotes.filter((_, i) => i !== idx)
    );

  const addPlanningNote = () =>
    update("fullPlanningNotes", [...settings.fullPlanningNotes, ""]);

  const handleSave = async () => {
    if (!settings.botName.trim()) {
      setSnack({ open: true, msg: "Le nom du chatbot est requis.", sev: "error" });
      return;
    }
    setSaving(true);
    try {
      try {
        await fetch("/api/configuration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userProductId,
            ...settings
          }),
        });
      } catch (error) {
        console.error("Error updating setting:", error);
      }
      save(settings);
      setSnack({
        open: true,
        msg: "Paramètres enregistrés",
        sev: "success",
      });
    } catch {
      setSnack({ open: true, msg: "Échec de l’enregistrement.", sev: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    reset();
    setSettings(load());
    setSnack({ open: true, msg: "Paramètres réinitialisés.", sev: "success" });
  };

  const togglePlay = async (voice: VoiceKey) => {
    try {
      if (!audioRef.current) audioRef.current = new Audio();
      const a = audioRef.current;

      if (playingKey === voice) {
        a.pause();
        setPlayingKey(null);
        return;
      }

      const src = VOICE_DEMOS.find((v) => v.key === voice)?.src;
      if (!src) return;

      a.pause();
      a.src = src;
      a.currentTime = 0;
      a.onended = () => setPlayingKey(null);
      await a.play();
      setPlayingKey(voice);
    } catch {
      setPlayingKey(null);
    }
  };

  return (
    <Box sx={{ p: 3, bgcolor: "#F8F8F8", minHeight: "100vh" }}>
      {/* En-tête */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="h4">Paramétrage Talk</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<IconChevronLeft size={18} />}
            onClick={() => router.push("/client/services/talk")}
            sx={{
              borderColor: "#48C8AF",
              color: "#48C8AF",
              "&:hover": { backgroundColor: "rgba(72,200,175,0.08)" },
            }}
          >
            Retour à Talk
          </Button>
          <Button
            variant="outlined"
            startIcon={<RestartAltIcon />}
            onClick={handleReset}
            sx={{
              borderColor: "#EF5350",
              color: "#EF5350",
              "&:hover": { backgroundColor: "rgba(239,83,80,0.08)" },
            }}
          >
            Réinitialiser
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={saving}
            sx={{
              backgroundColor: "#48C8AF",
              "&:hover": { backgroundColor: "#3bb49d" },
            }}
          >
            Enregistrer
          </Button>
        </Box>
      </Box>

      {/* Info centre */}
      <Card sx={{ borderRadius: 2, border: "1px solid #e0e0e0", mb: 2 }}>
        <CardContent sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="body2" color="text.secondary">
            Paramètres pour le {" "}
            <strong>{selectedCentre?.name ?? "compte"}</strong>.
          </Typography>
        </CardContent>
      </Card>

      {/* Préférences générales */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Préférences générales</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            {/* Sélecteur de voix avec pré-écoute */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Choix de la voix
              </Typography>

              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                useFlexGap
                flexWrap="wrap"
              >
                {VOICE_DEMOS.map((v) => {
                  const checked = settings.voice === v.key;
                  const playing = playingKey === v.key;
                  return (
                    <Card
                      key={v.key}
                      variant={checked ? "elevation" : "outlined"}
                      sx={{
                        flex: "1 1 280px",
                        borderRadius: 2,
                        borderColor: checked ? "#48C8AF" : "#e0e0e0",
                        outline: checked ? "2px solid #48C8AF" : "none",
                        transition: "outline-color .2s",
                      }}
                    >
                      <CardContent sx={{ display: "grid", gap: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <VolumeUpIcon fontSize="small" />
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            {v.label}
                          </Typography>
                          <Box sx={{ flex: 1 }} />
                          <Radio
                            checked={checked}
                            onChange={() => update("voice", v.key)}
                            value={v.key}
                          />
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          {v.desc}
                        </Typography>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={playing ? <PauseIcon /> : <PlayArrowIcon />}
                            onClick={() => togglePlay(v.key)}
                            sx={{
                              borderColor: "#48C8AF",
                              color: "#48C8AF",
                              textTransform: "none",
                              "&:hover": { backgroundColor: "rgba(72,200,175,0.08)" },
                            }}
                          >
                            {playing ? "Pause" : "Écouter l’aperçu"}
                          </Button>
                          {checked && (
                            <Chip label="Sélectionnée" size="small" color="success" />
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>
            </Box>

            <TextField
              fullWidth
              label="Nom du chatbot"
              value={settings.botName}
              onChange={(e) => update("botName", e.target.value)}
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              label="Message d’accueil personnalisé"
              value={settings.welcomeMsg}
              onChange={(e) => update("welcomeMsg", e.target.value)}
              fullWidth
              multiline
              minRows={2}
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              label="Consigne si URGENCE détectée hors horaires"
              value={settings.emergencyOutOfHours}
              onChange={(e) => update("emergencyOutOfHours", e.target.value)}
              fullWidth
              multiline
              minRows={2}
              helperText="Affichée / énoncée lorsque l’IA détecte une urgence en dehors des heures d’ouverture."
              InputLabelProps={{ shrink: true }}
            />

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Mode d’appel
              </Typography>
              <Stack direction="row" spacing={2}>
                {settings.callMode &&
                  <>
                    <FormControlLabel
                      value="decroche"
                      control={
                        <Radio
                          checked={settings.callMode === "decroche"}
                          onChange={() => update("callMode", "decroche")}
                        />
                      }
                      label="Décroché"
                    />
                    <FormControlLabel
                      value="debordement"
                      control={
                        <Radio
                          checked={settings.callMode === "debordement"}
                          onChange={() => update("callMode", "debordement")}
                        />
                      }
                      label="Débordement"
                    />
                  </>
                }
              </Stack>
            </Box>
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Planning rempli */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Planning rempli — consignes</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Ajoutez des consignes (ex : “rappeler tel jour”, “consulter le site web”…).
          </Typography>
          <Stack spacing={1}>
            {settings.fullPlanningNotes.map((note, idx) => (
              <Stack key={idx} direction="row" spacing={1}>
                <TextField
                  fullWidth
                  size="small"
                  value={note}
                  placeholder={`Consigne ${idx + 1}`}
                  onChange={(e) => {
                    const next = [...settings.fullPlanningNotes];
                    next[idx] = e.target.value;
                    update("fullPlanningNotes", next);
                  }}
                />
                <IconButton onClick={() => removePlanningNote(idx)} aria-label="remove">
                  <DeleteIcon />
                </IconButton>
              </Stack>
            ))}
            <Button
              onClick={addPlanningNote}
              startIcon={<AddIcon />}
              sx={{ alignSelf: "flex-start", textTransform: "none" }}
            >
              Ajouter une consigne
            </Button>
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Examens acceptés */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Examens acceptés</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <FormGroup row>
            {(
              [
                ["radiographie", "Radiographie"],
                ["irm", "IRM"],
                ["echographie", "Échographie"],
                ["scanner", "Scanner"],
                ["mammo", "Mammographie"],
              ] as [ExamKey, string][]
            ).map(([k, label]) => (
              <FormControlLabel
                key={k}
                control={
                  <Checkbox
                    checked={!!settings.examsAccepted[k]}
                    onChange={(e) => updateExamAccepted(k, e.target.checked)}
                  />
                }
                label={label}
              />
            ))}
          </FormGroup>
          <Typography variant="caption" color="text.secondary">
            Le chatbot n’acceptera que les motifs cochés.
          </Typography>
        </AccordionDetails>
      </Accordion>

      {/* Consignes spécifiques */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Consignes spécifiques</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Consignes (ex : accès au parking, ascenseur, travaux, etc.)"
            value={settings.specificNotes}
            onChange={(e) => update("specificNotes", e.target.value)}
          />
        </AccordionDetails>
      </Accordion>

      {/* Reconnaissance du numéro de téléphone */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Reconnaissance Automatique</Typography>
        </AccordionSummary>
        {!loading &&
          <AccordionDetails>
            OFF
            <Switch
              checked={settings.reconnaissance}
              onChange={handleSwitchChange}
            />
            ON
          </AccordionDetails>
        }
      </Accordion>

      {/* Reconnaissance du numéro de téléphone */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Correspondance des examens</Typography>
        </AccordionSummary>
        {!loading &&
          <AccordionDetails>
            <Button
              variant="outlined"
              onClick={() => router.push(`/client/services/talk/${userProductId}/parametrage/mapping_exam`)}
              sx={{
                borderColor: "#48C8AF",
                color: "#48C8AF",
                "&:hover": { backgroundColor: "rgba(72,200,175,0.08)" },
              }}
            >
              Paramétrer les examens
            </Button>
          </AccordionDetails>
        }
      </Accordion>

      {/* Barre d’action */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{
          position: "sticky",
          bottom: 0,
          bgcolor: "rgba(248,248,248,0.9)",
          backdropFilter: "blur(6px)",
          py: 1.5,
          px: 2,
          mt: 2,
          borderTop: "1px solid #eee",
          justifyContent: "flex-end",
        }}
      >
        <Button
          variant="outlined"
          startIcon={<RestartAltIcon />}
          onClick={handleReset}
          sx={{
            borderColor: "#EF5350",
            color: "#EF5350",
            "&:hover": { backgroundColor: "rgba(239,83,80,0.08)" },
          }}
        >
          Réinitialiser
        </Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={saving}
          sx={{
            backgroundColor: "#48C8AF",
            "&:hover": { backgroundColor: "#3bb49d" },
          }}
        >
          Enregistrer
        </Button>
      </Stack>

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
    </Box>
  );
}
