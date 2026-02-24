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

type DayHours = {
  enabled: boolean;
  ranges: { start: string; end: string }[];
};

const emptyDay: DayHours = { enabled: false, ranges: [] };

type PlanningAction = {
  type: "fin_appel" | "redirection";
  message?: string;
  phone?: string;
};


type TalkSettings = {
  voice: VoiceKey;
  botName: string;
  welcomeMsg: string;
  emergencyOutOfHours: string;
  callMode: "decroche" | "debordement";
  fullPlanningNotes: Record<ExamKey, PlanningAction>;
  examsAccepted: Record<ExamKey, boolean>;
  examQuestions: Record<ExamKey, string[]>;
  specificNotes: string;
  reconnaissance: boolean;
  weeklyHours: {
    monday: DayHours;
    tuesday: DayHours;
    wednesday: DayHours;
    thursday: DayHours;
    friday: DayHours;
    saturday: DayHours;
    sunday: DayHours;
  };
  centerName?: string;
  address?: string;
  address2?: string;

  // 🆕 NOUVEAUX CHAMPS
  centerPhone?: string;
  centerWebsite?: string;
  centerMail?: string;
  options: {
    motif: boolean;
    questions: boolean;
    menstruations: boolean;
  };
};

const DEFAULTS: TalkSettings = {
  voice: "femme",
  botName: "Lyrae",
  welcomeMsg:
    "Bonjour, je suis Lyrae, l’assistant vocal du centre. Comment puis-je vous aider ?",
  emergencyOutOfHours:
    "En cas d’urgence hors horaires d’ouverture, merci d’appeler le 15 (SAMU) ou de vous rendre aux urgences les plus proches.",
  callMode: "decroche",

  fullPlanningNotes: {
    radiographie: { type: "fin_appel", message: "" },
    irm: { type: "fin_appel", message: "" },
    echographie: { type: "fin_appel", message: "" },
    scanner: { type: "fin_appel", message: "" },
    mammo: { type: "fin_appel", message: "" },
  },

  examsAccepted: {
    radiographie: true,
    irm: true,
    echographie: true,
    scanner: true,
    mammo: false,
  },

  examQuestions: {
    radiographie: [],
    irm: [],
    echographie: [],
    scanner: [],
    mammo: [],
  },

  weeklyHours: {
    monday: { ...emptyDay },
    tuesday: { ...emptyDay },
    wednesday: { ...emptyDay },
    thursday: { ...emptyDay },
    friday: { ...emptyDay },
    saturday: { ...emptyDay },
    sunday: { ...emptyDay },
  },

  specificNotes:
    "Accès parking limité : privilégier le parking P2 (entrée rue des Fleurs).",
  reconnaissance: false,

  centerName: "Imagerie",
  address: "",
  address2: "",

  centerPhone: "",
  centerWebsite: "",
  centerMail: "",
  options: {
    motif: true,
    questions: true,
    menstruations: false,
  },
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

// function QuestionsEditor({
//   label,
//   value,
//   onChange,
//   max = 3,
// }: {
//   label: string;
//   value: string[];
//   onChange: (next: string[]) => void;
//   max?: number;
// }) {
//   const canAdd = value.length < max;

//   return (
//     <Box>
//       <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
//         <Typography variant="subtitle2">{label}</Typography>
//         <Chip label={`${value.length}/${max}`} size="small" />
//         <Box sx={{ flex: 1 }} />
//         <Button
//           size="small"
//           startIcon={<AddIcon />}
//           onClick={() => canAdd && onChange([...value, ""])}
//           disabled={!canAdd}
//           sx={{ textTransform: "none" }}
//         >
//           Ajouter une question
//         </Button>
//       </Stack>

//       <Stack spacing={1}>
//         {value.length === 0 && (
//           <Typography variant="body2" color="text.secondary">
//             Aucune question — vous pouvez en ajouter (1 à {max}).
//           </Typography>
//         )}
//         {value.map((q, idx) => (
//           <Stack key={idx} direction="row" spacing={1}>
//             <TextField
//               size="small"
//               fullWidth
//               value={q}
//               onChange={(e) => {
//                 const next = [...value];
//                 next[idx] = e.target.value;
//                 onChange(next);
//               }}
//               placeholder={`Question ${idx + 1}`}
//             />
//             <IconButton
//               aria-label="remove"
//               onClick={() => onChange(value.filter((_, i) => i !== idx))}
//             >
//               <DeleteIcon />
//             </IconButton>
//           </Stack>
//         ))}
//       </Stack>
//     </Box>
//   );
// }

interface TalkPageProps {
    params: {
        id: string; // captured from the URL
    };
}

function DayHoursField({
  day,
  data,
  onChange,
}: {
  day: string;
  data: DayHours;
  onChange: (update: DayHours) => void;
}) {
  return (
    <Box sx={{ border: "1px solid #ddd", p: 2, borderRadius: 1 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle1" sx={{ textTransform: "capitalize" }}>
          {day}
        </Typography>

        <Button
          variant="outlined"
          size="small"
          onClick={() =>
            onChange({ ...data, enabled: !data.enabled })
          }
        >
          {data.enabled ? "Ouvert" : "Fermé"}
        </Button>
      </Stack>

      {data.enabled && (
        <Stack spacing={1} mt={2}>
          {data.ranges.map((r, idx) => (
            <Stack direction="row" spacing={2} key={idx}>
              <TextField
                label="Début"
                type="time"
                value={r.start}
                onChange={(e) => {
                  const newRanges = [...data.ranges];
                  newRanges[idx].start = e.target.value;
                  onChange({ ...data, ranges: newRanges });
                }}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Fin"
                type="time"
                value={r.end}
                onChange={(e) => {
                  const newRanges = [...data.ranges];
                  newRanges[idx].end = e.target.value;
                  onChange({ ...data, ranges: newRanges });
                }}
                InputLabelProps={{ shrink: true }}
              />

              <Button
                color="error"
                onClick={() => {
                  const newRanges = data.ranges.filter((_, i) => i !== idx);
                  onChange({ ...data, ranges: newRanges });
                }}
              >
                Supprimer
              </Button>
            </Stack>
          ))}

          <Button
            variant="contained"
            size="small"
            onClick={() =>
              onChange({
                ...data,
                ranges: [...data.ranges, { start: "", end: "" }],
              })
            }
          >
            Ajouter une plage horaire
          </Button>
        </Stack>
      )}
    </Box>
  );
}

export default function ParametrageTalkPage({ params }: TalkPageProps) {
  const router = useRouter();
  const { selectedUserId, selectedCentre } = useCentre();
  const userProductId = Number(params.id);
  
  const [settings, setSettings] = useState<TalkSettings>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState<{
    open: boolean;
    msg: string;
    sev: "success" | "error";
  }>({ open: false, msg: "", sev: "success" });
  const [zipCode, setZipCode] = useState("");
  const [city, setCity] = useState("");

  // Audio preview state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingKey, setPlayingKey] = useState<VoiceKey | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loaded, setLoaded] = useState<boolean>(false);

  useEffect(() => {
    
    async function fetchSettings() {
      setLoaded(true);
      try {
        setLoading(true);
        const res = await fetch(`/api/configuration?userProductId=${userProductId}`);
        if (!res.ok) {
          console.error("Failed to load settings:", res.statusText);
          setLoading(false);
          return;
        }

        const data = await res.json();
        setSettings((prev) => ({
          ...prev,
          ...data, // ⬅️ injecte TOUTES les données récupérées
          fullPlanningNotes: Object.fromEntries(
            Object.entries(data.fullPlanningNotes || {}).map(([key, value]) => {
              if (typeof value === "string") {
                return [
                  key,
                  { type: "fin_appel", message: value }
                ];
              }
              return [key, value];
            })
          ) as Record<ExamKey, PlanningAction>,
        }));

      } catch (error) {
        console.error("Error fetching settings:", error);
      } finally {
        setLoading(false);
      }
    }
    
    if (loaded == false) {
      fetchSettings();
    }
  }, [userProductId]);

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

  useEffect(() => {
    async function loadWeeklyHours() {
      const res = await fetch(
        `/api/configuration/informationnel/horaires?userProductId=${userProductId}`
      );
      const json = await res.json();

      if (json.success && json.data.weeklyHours) {
        setSettings((prev) => ({
          ...prev,
          weeklyHours: {
            ...prev.weeklyHours,
            ...json.data.weeklyHours,
          },
        }));
      }
    }

    loadWeeklyHours();
  }, [userProductId]);

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
  
  const handleSave = async () => {
    console.log(settings);
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

      try {
        await fetch(
          `/api/configuration/informationnel/horaires?userProductId=${userProductId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userProductId,
              weeklyHours: settings.weeklyHours,
            }),
          }
        );
      } catch (error) {
        console.error("Error updating setting:", error);
      }

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
          {userProductId && 
            <Button
              variant="outlined"
              startIcon={<IconChevronLeft size={18} />}
              onClick={() => router.push(`/client/services/talk/${userProductId}`)}
              sx={{
                borderColor: "#48C8AF",
                color: "#48C8AF",
                "&:hover": { backgroundColor: "rgba(72,200,175,0.08)" },
              }}
            >
              Retour à Talk
            </Button>
          }
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

            {/* <TextField
              fullWidth
              label="Nom du chatbot"
              value={settings.botName}
              onChange={(e) => update("botName", e.target.value)}
              InputLabelProps={{ shrink: true }}
            /> */}

            <TextField
              label="Message d’accueil personnalisé"
              value={settings.welcomeMsg}
              onChange={(e) => update("welcomeMsg", e.target.value)}
              fullWidth
              multiline
              minRows={2}
              InputLabelProps={{ shrink: true }}
            />

            {/* <TextField
              label="Consigne à donner au patient si urgence détectée en heure non ouvrable. "
              value={settings.emergencyOutOfHours}
              onChange={(e) => update("emergencyOutOfHours", e.target.value)}
              fullWidth
              multiline
              minRows={2}
              helperText="Affichée / énoncée lorsque l’IA détecte une urgence en dehors des heures d’ouverture."
              InputLabelProps={{ shrink: true }}
            /> */}

            <TextField
              fullWidth
              label="Nom du centre"
              value={settings.centerName}
              onChange={(e) => update("centerName", e.target.value)}
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              fullWidth
              label="Adresse"
              value={settings.address}
              onChange={(e) => update("address", e.target.value)}
              InputLabelProps={{ shrink: true }}
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Code postal"
                value={zipCode}
                onChange={(e) => {
                  const val = e.target.value;
                  setZipCode(val);
                  update("address2", `${val} ${city}`.trim());
                }}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />

              <TextField
                label="Ville"
                value={city}
                onChange={(e) => {
                  const val = e.target.value;
                  setCity(val);
                  update("address2", `${zipCode} ${val}`.trim());
                }}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Stack>

            <TextField
              fullWidth
              label="Téléphone du centre"
              value={settings.centerPhone}
              onChange={(e) => update("centerPhone", e.target.value)}
              placeholder="01 23 45 67 89"
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              fullWidth
              label="Site web du centre"
              value={settings.centerWebsite}
              onChange={(e) => update("centerWebsite", e.target.value)}
              placeholder="https://www.centre-imagerie.fr"
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              fullWidth
              label="Email du centre"
              value={settings.centerMail}
              onChange={(e) => update("centerMail", e.target.value)}
              placeholder="contact@centre.fr"
              InputLabelProps={{ shrink: true }}
            />


            {/* <Box>
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
            </Box> */}
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Horaires & disponibilité</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 2,
            }}
          >
            {Object.entries(settings.weeklyHours).map(([day, data]) => {
              const mapping: any = {
                monday: "lundi",
                tuesday: "mardi",
                wednesday: "mercredi",
                thursday: "jeudi",
                friday: "vendredi",
                saturday: "samedi",
                sunday: "dimanche",
              };

              return (
                <DayHoursField
                  key={day}
                  day={mapping[day]}
                  data={data}
                  onChange={(updated) =>
                    setSettings((prev) => ({
                      ...prev,
                      weeklyHours: {
                        ...prev.weeklyHours,
                        [day]: updated,
                      },
                    }))
                  }
                />
              );
            })}
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Planning rempli */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Planning rempli — consignes</Typography>
        </AccordionSummary>

        <AccordionDetails>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Définissez une consigne par examen lorsque le planning est complet.
          </Typography>

          <Stack spacing={3}>
  {([
    ["radiographie", "Radiographie"],
    ["irm", "IRM"],
    ["echographie", "Échographie"],
    ["scanner", "Scanner"],
    ["mammo", "Mammographie"],
  ] as [ExamKey, string][]).map(([key, label]) => {

    const current = settings.fullPlanningNotes[key];

    return (
      <Box key={key}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          {label}
        </Typography>

        {/* Choix du comportement */}
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <FormControlLabel
            control={
              <Radio
                checked={current.type === "fin_appel"}
                onChange={() =>
                  update("fullPlanningNotes", {
                    ...settings.fullPlanningNotes,
                    [key]: { type: "fin_appel", message: "" },
                  })
                }
              />
            }
            label="Fin d’appel"
          />

          <FormControlLabel
            control={
              <Radio
                checked={current.type === "redirection"}
                onChange={() =>
                  update("fullPlanningNotes", {
                    ...settings.fullPlanningNotes,
                    [key]: { type: "redirection", phone: "" },
                  })
                }
              />
            }
            label="Redirection"
          />
        </Stack>

        {/* Champ conditionnel */}
        {current.type === "fin_appel" && (
          <TextField
            fullWidth
            size="small"
            multiline
            minRows={2}
            label="Message de fin d’appel"
            value={current.message || ""}
            onChange={(e) =>
              update("fullPlanningNotes", {
                ...settings.fullPlanningNotes,
                [key]: {
                  ...current,
                  message: e.target.value,
                },
              })
            }
          />
        )}

        {current.type === "redirection" && (
          <TextField
            fullWidth
            size="small"
            label="Numéro de redirection"
            placeholder="01 23 45 67 89"
            value={current.phone || ""}
            onChange={(e) =>
              update("fullPlanningNotes", {
                ...settings.fullPlanningNotes,
                [key]: {
                  ...current,
                  phone: e.target.value,
                },
              })
            }
          />
        )}
      </Box>
    );
  })}
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

      {/* Options */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Options</Typography>
        </AccordionSummary>

        <AccordionDetails>
          <Stack spacing={3}>

            {/* MOTIF */}
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="subtitle1">Motif</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Demande le motif écrit sur l’ordonnance. 
                    Il sera noté dans le champ commentaire Xplore.
                  </Typography>
                </Box>

                <Switch
                  checked={settings.options.motif}
                  onChange={(e) =>
                    update("options", {
                      ...settings.options,
                      motif: e.target.checked,
                    })
                  }
                />
              </Stack>
            </Box>

            <Divider />

            {/* QUESTIONS */}
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="subtitle1">Questions</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Pose les questions en fin de prise de rendez-vous 
                    pour aider à la préparation de l’examen.
                    Les réponses seront inscrites dans le champ commentaire Xplore.
                  </Typography>
                </Box>

                <Switch
                  checked={settings.options.questions}
                  onChange={(e) =>
                    update("options", {
                      ...settings.options,
                      questions: e.target.checked,
                    })
                  }
                />
              </Stack>
            </Box>

            <Divider />

            {/* MENSTRUATIONS */}
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="subtitle1">Menstruations (Mammographie)</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Lors des mammographies, demande les dernières menstruations 
                    afin d’adapter le créneau d’examen à une période moins douloureuse.
                  </Typography>
                </Box>

                <Switch
                  checked={settings.options.menstruations}
                  onChange={(e) =>
                    update("options", {
                      ...settings.options,
                      menstruations: e.target.checked,
                    })
                  }
                />
              </Stack>
            </Box>

          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Consignes spécifiques */}
      {/* <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Consignes d’accessibilité et de logistique</Typography>
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
      </Accordion> */}

      {/* Reconnaissance du numéro de téléphone */}
      {/* <Accordion>
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
      </Accordion> */}

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

      {/* Questionnaire */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Paramétrer le questionnaire par examen</Typography>
        </AccordionSummary>
        {!loading &&
          <AccordionDetails>
            <Button
              variant="outlined"
              onClick={() => router.push(`/client/services/talk/${userProductId}/parametrage/questions_exam`)}
              sx={{
                borderColor: "#48C8AF",
                color: "#48C8AF",
                "&:hover": { backgroundColor: "rgba(72,200,175,0.08)" },
              }}
            >
              Paramétrer les questions
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