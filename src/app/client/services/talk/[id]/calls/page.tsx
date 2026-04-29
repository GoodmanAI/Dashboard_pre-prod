"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Button,
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip,
  ListItemButton,
  Pagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Drawer,
  Tabs,
  Tab,
  Checkbox,
  Popover,
  TextField,
  InputAdornment,
  IconButton,
} from "@mui/material";
import { IconSearch, IconX, IconDownload } from "@tabler/icons-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTalkBasePath } from "@/utils/talkRoutes";
import ArrowBackIosIcon from "@mui/icons-material/ArrowBackIos";
import { io } from "socket.io-client";
import { subDays, startOfDay, endOfDay, subYears } from "date-fns";
import DateRangePicker, { DateRange } from "@/components/DateRangePicker";
import DateRangePresets from "@/components/DateRangePresets";

type Speaker = "Lyrae" | "User";

const states: any = { identification_birthdate: "- Etape Identification", identification_firstname: "- Etape Identification", identification_lastname: "- Etape Identification", identification_confirm: "- Etape Identification", identification_birthdate_light: "- Etape Identification", identification_firstname_light: "- Etape Identification", identification_lastname_light: "- Etape Identification", identification_confirm_light: "- Etape Identification", get_intent: "- Etape Intention", confirm_intent: "- Etape Intention", get_phone: "- Etape Téléphone", confirm_phone: "- Etape Téléphone", confirm_identity_rdv: "- Etape Identification", exam_type: "- Etape Intention Examen", confirm_exam: "- Etape Intention Examen", exam_questions: "- Etape Questions", define_mammo: "- Etape définir Mammo", irm_injection_flow: "- Etape injection IRM", scanner_injection_flow: "- Etape injection scanner", multi_exam_confirm: "- Etape multi-examens", multi_exam_get_region: "- Etape multi-examens", multi_exam_one_not_accepted: "- Etape multi-examens", multi_exam_validate: "- Etape multi-examens", get_motif: "- Etape motif", get_dispo: "- Etape Créneaux", get_dispo_double: "- Etape Créneaux", get_period: "- Etape période Mammo", get_period_double: "- Etape période Mammo", slot: "- Etape Créneaux", slot_double: "- Etape Créneaux", validate_exam: "- Etape validation RDV", validate_double_exam: "- Etape validation RDV", consultation: "- Etape Consultation", cancel_fetch: "- Etape Annulation", cancel_confirm: "- Etape Annulation", modify_fetch: "- Etape Modification", modify_confirm: "- Etape Modification", no_slot_modify_proposal: "- Etape Créneau" }

const ITEMS_PER_PAGE = 10;

const transferReason: any = {
  exam_type: "- Type d'examen non géré",
  redirect: "- Demande de redirection",
  incident: "- Nécessite intervention humaine",
  emergency: "- Urgence médicale",
  multi_exam_not_accepted: "- Examens multiples non gérés",
  multi_examen_double_us: "- Double échographie non gérée",
  error_logic: "- Erreur incompréhension",
  admin: "- Démarche administrative",
  exam_interv: "- Examen interventionnel",
  patient_not_found: "- Patient non trouvé",
  error_identification: "- Erreur d'identification",
  create_rdv_failed: "- Échec de création de RDV",
};

const transferColor: Record<string, string> = {
  exam_type: "#4899B5",
  redirect: "#4899B5",
  incident: "#4899B5",
  emergency: "#4899B5",
  multi_exam_not_accepted: "#4899B5",
  multi_examen_double_us: "#4899B5",
  error_logic: "#f97316",
  admin: "#4899B5",
  exam_interv: "#4899B5",
  patient_not_found: "#4899B5",
  error_identification: "#4899B5",
  create_rdv_failed: "#4899B5",
};

const call_status: any = {
  no_slot: "Pas de créneaux",
  success: "Rendez-vous",
  not_performed: "Examen non pris en charge",
  canceled: "Annulé",
  rescheduled: "Modifié",
  full_planning_end: "Planning complet",
};

import { pink } from "@mui/material/colors";

function getCallChips(call: any, examLabelMap: Record<string, string> = {}) {
  const stats = call.stats;

  const chips: {
    label: string;
    muiColor?: "success" | "error" | "warning" | "default";
    customColor?: string;
    textColor?: string;
    variant?: "filled" | "outlined";
  }[] = [];

  // Urgences
  if (stats.transferReason === "emergency") {
    chips.push({
      label: "Appel d'urgence",
      customColor: "#d264ee",
    });
  }

  // Module info
  if (stats.intents.includes("renseignements")) {
    chips.push({
      label: "Renseignements",
      customColor: "#4a8560",
    });
  }

  if (stats.rdv_canceled > 0) {
    chips.push({
      label: "Annulé",
      customColor: pink[500],
    });
  }

  if (stats.rdv_modified > 0) {
    chips.push({
      label: "Modifié",
    });
  }

  if (stats.end_reason === "transfer") {
    const color = transferColor[stats.transferReason] ?? "#fdba74";
    chips.push({
      label: `Redirection ${transferReason[stats.transferReason] || ""}`.trim(),
      customColor: color,
    });
  }

  if (
    stats.rdv_booked === 0 &&
    stats.rdv_canceled === 0 &&
    stats.rdv_modified === 0 &&
    stats.end_reason !== "transfer"
  ) {
    chips.push({
      label: "Raccroché",
    });
  }

  if (stats.rdv_status) {
    const label = call_status[stats.rdv_status] || "Inconnu";
    if (stats.rdv_status === "success") {
      chips.push({ label, customColor: "#4ade80" });
      const rawExamId = stats.exam_type_id;
      const examId = Array.isArray(rawExamId) ? rawExamId[0] : rawExamId;
      if (examId) {
        chips.push({
          label: examLabelMap[examId] || String(examId),
          customColor: "#059669",
          variant: "outlined",
        });
      }
    } else if (stats.rdv_status === "full_planning_end") {
      chips.push({ label, customColor: "#D4BFC7", textColor: "#1f2937" });
    } else if (stats.rdv_status === "no_slot") {
      chips.push({ label, muiColor: "error" });
    } else {
      chips.push({ label, muiColor: "default" });
    }
  }

  return chips;
}
interface CallSummary {
  id: number;
  userProductId: number;
  centerId: number;
  steps: any;
  stats: any;
  createdAt: string;
  treated?: boolean; // 👈 ajouté
}

interface CallListPageProps {
  params: { id: string };
}

/**
 * Génère et télécharge un PDF de la transcription d'un appel.
 * Utilise jsPDF (déjà dans les dépendances).
 */
async function exportCallToPdf(call: any, steps: any[]) {
  // Import dynamique : évite d'embarquer jsPDF dans le bundle initial
  const { default: jsPDF } = await import("jspdf");

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - 2 * margin;

  let y = margin;

  // ── Titre
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor("#1f2937");
  doc.text("Transcription d'appel", margin, y);
  y += 28;

  // ── Métadonnées
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#374151");

  const date = new Date(call.createdAt);
  const dateStr = date.toLocaleDateString("fr-FR");
  const timeStr = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const phone = formatPhoneFR(call.stats?.phoneNumber);

  const metas: string[] = [
    `Date : ${dateStr} à ${timeStr}`,
    `Numéro appelant : ${phone}`,
  ];
  if (call.stats?.rdv_status) metas.push(`Statut RDV : ${call.stats.rdv_status}`);
  if (call.stats?.transferReason) metas.push(`Motif transfert : ${call.stats.transferReason}`);
  if (call.stats?.duration) metas.push(`Durée : ${call.stats.duration}s`);

  metas.forEach((line) => {
    doc.text(line, margin, y);
    y += 14;
  });

  // ── Séparateur
  y += 8;
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // ── Conversation
  doc.setFontSize(11);
  for (let i = 0; i < steps.length; i++) {
    const speaker = i % 2 === 0 ? "Lyrae" : "Patient";
    const text = String(steps[i]?.text ?? "");
    if (!text) continue;

    const wrapped = doc.splitTextToSize(text, contentWidth - 12);
    const blockHeight = 16 + wrapped.length * 14 + 6;

    // Saut de page si plus de place
    if (y + blockHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }

    // Locuteur
    doc.setFont("helvetica", "bold");
    doc.setTextColor(speaker === "Lyrae" ? "#2a6f64" : "#374151");
    doc.text(speaker + " :", margin, y);
    y += 14;

    // Texte
    doc.setFont("helvetica", "normal");
    doc.setTextColor("#1f2937");
    doc.text(wrapped, margin + 12, y);
    y += wrapped.length * 14 + 10;
  }

  // ── Pied de page sur chaque page : numéro de page + horodatage
  const pageCount = (doc as any).internal.getNumberOfPages?.() ?? 1;
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor("#9ca3af");
    doc.text(
      `Page ${p}/${pageCount}`,
      pageWidth - margin,
      pageHeight - 20,
      { align: "right" }
    );
    doc.text(
      `Exporté le ${new Date().toLocaleString("fr-FR")}`,
      margin,
      pageHeight - 20
    );
  }

  const fileDate = date.toISOString().slice(0, 10);
  doc.save(`appel-${call.id}-${fileDate}.pdf`);
}

/** Formate un numéro français pour affichage : `+33 6 12 34 56 78` ou `06 12 34 56 78`. */
function formatPhoneFR(p?: string | null): string {
  if (!p) return "—";
  const digits = p.replace(/\s/g, "");
  if (digits.startsWith("+33") && digits.length === 12) {
    return `+33 ${digits[3]} ${digits.slice(4, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`;
  }
  return p;
}

const formatCallTime = (timestamp?: number) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};

function formatDateFR(dateValue: string) {
  const date = new Date(dateValue);
  let formatted = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);

  return formatted.replace(/\b([a-zà-ÿ])/i, (m) => m.toUpperCase());
}

export default function CallListPage({ params }: CallListPageProps) {

  const router = useRouter();
  const searchParams = useSearchParams();
  const userProductId = Number(params.id);
  const basePath = useTalkBasePath(userProductId);

  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [examTypeFilter, setExamTypeFilter] = useState("all");
  const [tab, setTab] = useState("all");

  const [selectedCall, setSelectedCall] = useState<any | null>(null);
  const [checkboxState, setCheckboxState] = useState<Record<number, boolean>>({});
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const [mapping, setMapping] = useState<any[]>([]);

  const examLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (Array.isArray(mapping)) {
      for (const e of mapping) {
        if (e.diminutif) map[e.diminutif] = e.fr;
      }
    }
    return map;
  }, [mapping]);

  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const today = new Date();
    return {
      from: startOfDay(subDays(today, 6)),
      to: endOfDay(today),
    };
  });

  const [dateRangeDraft, setDateRangeDraft] = useState<DateRange>(dateRange);

  // Recherche par numéro — input vs query (debouncé)
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneSearch, setPhoneSearch] = useState("");
  const phoneSearchActive = phoneSearch.trim().length > 0;

  // URL → state
  useEffect(() => {
    const pageFromUrl: any = Number(searchParams?.get("page"));
    const statusFromUrl: any = searchParams?.get("status");
    const examTypeFromUrl: any = searchParams?.get("examType");
    const tabFromUrl: any = searchParams?.get("tab");
    const phoneFromUrl: any = searchParams?.get("phone");

    if (!isNaN(pageFromUrl) && pageFromUrl > 0) setPage(pageFromUrl);
    if (statusFromUrl) setStatusFilter(statusFromUrl);
    if (examTypeFromUrl) setExamTypeFilter(examTypeFromUrl);
    if (tabFromUrl) setTab(tabFromUrl);
    if (phoneFromUrl) {
      setPhoneInput(phoneFromUrl);
      setPhoneSearch(phoneFromUrl);
    }
  }, []);

  // Debounce de la recherche numéro (300ms) — évite de spammer l'API à chaque touche
  useEffect(() => {
    const t = setTimeout(() => {
      setPhoneSearch(phoneInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [phoneInput]);

  // Reset des autres filtres quand on démarre une nouvelle recherche numéro.
  // Les filtres restent ENSUITE modifiables pour affiner la recherche.
  const phoneWasActiveRef = useRef(false);
  useEffect(() => {
    const isActive = phoneSearch.trim().length > 0;
    if (isActive && !phoneWasActiveRef.current) {
      // Transition inactive → active : reset une fois
      setStatusFilter("all");
      setExamTypeFilter("all");
      setTab("all");
      const today = new Date();
      setDateRange({
        from: startOfDay(subYears(today, 5)),
        to: today,
      });
    }
    phoneWasActiveRef.current = isActive;
  }, [phoneSearch]);

  // Fetch mapping types d'examen
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/configuration/mapping/type_exam?userProductId=${userProductId}`);
        const data = await res.json();
        setMapping(data);
      } catch (err) {
        console.error("Erreur fetch mapping type_exam:", err);
      }
    })();
  }, [userProductId]);

  // state → URL
  useEffect(() => {
    const paramsUrl = new URLSearchParams();

    paramsUrl.set("page", String(page));
    paramsUrl.set("status", statusFilter);
    paramsUrl.set("examType", examTypeFilter);
    paramsUrl.set("tab", tab);
    if (phoneSearchActive) paramsUrl.set("phone", phoneSearch);

    router.replace(`${basePath}/calls?${paramsUrl.toString()}`, { scroll: false });

  }, [page, statusFilter, examTypeFilter, tab, phoneSearch]);

  // FETCH
  useEffect(() => {

    if (!userProductId || isNaN(userProductId)) return;

    const controller = new AbortController();

    const fetchCalls = async () => {

      try {

        setLoading(true);
        setError(null);
        setCalls([]);

        console.log("dateRange", dateRange.from, dateRange.to)
        const toDate = new Date(dateRange.to);
        toDate.setHours(23, 59, 59, 999);

        const params = new URLSearchParams({
          userProductId: String(userProductId),
          page: String(page),
          limit: String(ITEMS_PER_PAGE),
          status: statusFilter,
          examTypeId: examTypeFilter,
          from: dateRange.from.toISOString(),
          to: toDate.toISOString(),
        });

        if (tab === "scanners") params.append("examType", "scanner");
        if (phoneSearchActive) params.append("phone", phoneSearch);

        const res = await fetch(`/api/calls?${params}`, { signal: controller.signal });

        if (!res.ok) throw new Error("Erreur lors du fetch des appels");

        const { data, total } = await res.json();

        setCalls(data);
        setTotal(total);
        const initialCheckbox: Record<number, boolean> = {};

        data.forEach((call: CallSummary) => {
          initialCheckbox[call.id] = !!call.treated;
        });

        setCheckboxState(initialCheckbox);

      } catch (err: any) {

        if (err.name !== "AbortError") setError(err.message);

      } finally {

        setLoading(false);

      }
    };

    fetchCalls();

    return () => controller.abort();

  }, [userProductId, page, statusFilter, examTypeFilter, tab, dateRange, phoneSearch]);

  useEffect(() => {
    const init = async () => {
      await fetch("/api/socket"); // initialise le serveur

      const socket = io({
        path: "/api/socket",
      });

      socket.on("connect", () => {
        console.log("socket connecté", socket.id);
      });

      socket.on("call-treated", ({ callId, treated }) => {
        setCheckboxState((prev) => ({
          ...prev,
          [callId]: treated,
        }));

        setCalls((prev) =>
          prev.map((c) =>
            c.id === callId ? { ...c, treated } : c
          )
        );
      });
    };

    init();
  }, []);

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const toggleCall = async (call: CallSummary) => {

    const newValue = !checkboxState[call.id];

    // UI immédiate
    setCheckboxState((prev) => ({
      ...prev,
      [call.id]: newValue
    }));

    try {

      await fetch(`/api/calls/${call.id}/treated`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ treated: newValue }),
      });

      // applique la transparence seulement après succès
      setCalls((prev) =>
        prev.map((c) =>
          c.id === call.id ? { ...c, treated: newValue } : c
        )
      );

    } catch (e) {

      // rollback UI si erreur
      setCheckboxState((prev) => ({
        ...prev,
        [call.id]: !newValue
      }));

      console.error("Erreur update treated", e);

    }
  };

  const filteredSteps =
    selectedCall?.steps?.filter(
      (line: any) => !line.text.includes("WaitSound")
    ) ?? [];

  return (
    <Box sx={{ p: 3, bgcolor: "#F8F8F8", minHeight: "100vh" }}>

      <Button
        variant="contained"
        startIcon={<ArrowBackIosIcon />}
        onClick={() => router.back()}
        sx={{ backgroundColor: "#48C8AF", mb: 2 }}
      >
        Retour
      </Button>

      <Box sx={{ display: "flex", gap: 2, mb: 2, alignItems: "center", flexWrap: "wrap" }}>

        <TextField
          placeholder="Rechercher par numéro (ex. 0612... ou +336...)"
          variant="outlined"
          size="small"
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          sx={{ width: 340, bgcolor: "white" }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <IconSearch size={18} />
              </InputAdornment>
            ),
            endAdornment: phoneInput ? (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={() => {
                    setPhoneInput("");
                  }}
                  aria-label="Effacer la recherche"
                >
                  <IconX size={16} />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
        />

        <DateRangePresets
          range={dateRange}
          onChange={(r) => {
            setDateRange(r);
            setPage(1);
          }}
        />

        <Button
          variant="outlined"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            borderColor: "#48C8AF",
            color: "#48C8AF",
            textTransform: "none",
            fontWeight: 600,
          }}
        >
          Du {dateRange.from.toLocaleDateString()} au {dateRange.to.toLocaleDateString()}
        </Button>

        <Popover
          open={open}
          anchorEl={anchorEl}
          onClose={() => setAnchorEl(null)}
          PaperProps={{
            sx: {
              borderRadius: 2,
              boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
              border: "1px solid rgba(72,200,175,0.15)",
            },
          }}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        >
          <Box sx={{ p: 2.5, pb: 1 }}>
            <Typography
              variant="overline"
              sx={{
                color: "#2a6f64",
                fontWeight: 700,
                letterSpacing: 1,
                display: "block",
                mb: 1.5,
              }}
            >
              Sélectionner une période
            </Typography>

            <DateRangePicker
              value={dateRangeDraft}
              onChange={(range) => setDateRangeDraft(range)}
            />
          </Box>

          <Box
            sx={{
              px: 2.5,
              py: 1.5,
              display: "flex",
              justifyContent: "flex-end",
              gap: 1,
              borderTop: "1px solid #f0f0f0",
            }}
          >
            <Button
              variant="text"
              onClick={() => setAnchorEl(null)}
              sx={{ color: "text.secondary", textTransform: "none" }}
            >
              Annuler
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                setDateRange(dateRangeDraft);
                setAnchorEl(null);
                setPage(1);
              }}
              sx={{
                bgcolor: "#48C8AF",
                fontWeight: 600,
                textTransform: "none",
                "&:hover": { bgcolor: "#3BA992" },
              }}
            >
              Appliquer
            </Button>
          </Box>
        </Popover>

      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => {
          setTab(v);
          setPage(1);
        }}
        sx={{ mb: 3 }}
      >
        <Tab value="all" label="Tous les appels" />
        <Tab value="scanners" label="Scanners & IRM" />
      </Tabs>

      <Box sx={{ display: "flex", gap: 2, mb: 2, alignItems: "center", flexWrap: "wrap" }}>
        <FormControl sx={{ minWidth: 220 }}>
          <InputLabel>Filtrer par statut</InputLabel>
          <Select
            value={statusFilter}
            label="Filtrer par statut"
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <MenuItem value="all">Tous</MenuItem>
            <MenuItem value="success">Rendez-vous</MenuItem>
            <MenuItem value="canceled">Annulé</MenuItem>
            <MenuItem value="rescheduled">Modifié</MenuItem>
            <MenuItem value="no_slot_api_retrieve">Planning complet</MenuItem>
            <MenuItem value="not_performed">Examen non pris en charge</MenuItem>
            <MenuItem value="hung_up">Raccroché</MenuItem>
            <MenuItem value="transfer:all">Toutes les redirections</MenuItem>
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 220 }}>
          <InputLabel>Filtrer par type d&#39;examen</InputLabel>
          <Select
            value={examTypeFilter}
            label="Filtrer par type d&#39;examen"
            onChange={(e) => {
              setExamTypeFilter(e.target.value);
              setPage(1);
            }}
          >
            <MenuItem value="all">Tous</MenuItem>
            {Object.entries(examLabelMap).map(([code, label]) => (
              <MenuItem key={code} value={code}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {phoneSearchActive && (
          <Chip
            size="small"
            label={`Recherche numéro : ${phoneInput}`}
            sx={{
              bgcolor: "rgba(72,200,175,0.15)",
              color: "#2a6f64",
              fontWeight: 600,
            }}
          />
        )}
      </Box>

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress sx={{ color: "#48C8AF" }} />
        </Box>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {!loading && calls.length === 0 && (
        <Alert severity="info">Aucun appel trouvé.</Alert>
      )}

      {!loading && calls.length > 0 && (
        <>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              mb: 1,
              ml: 1
            }}
          >
            <Typography
              fontSize={12}
              fontWeight={600}
              color="text.secondary"
              sx={{ width: 42 }}
            >
              Traité
            </Typography>
          </Box>
          <List sx={{ bgcolor: "white", borderRadius: 2 }}>

            {calls.map((call, index) => {
              const stepsArray = Object.values(call.steps || {});
              const firstStep: any = stepsArray[0];
              const secondStep: any = stepsArray[2];

              return (

                <Box key={call.id}>

                  <ListItem
                    disablePadding
                    sx={{
                      opacity: call.treated ? 0.45 : 1,
                      transition: "opacity 0.2s"
                    }}
                  >

                    <Checkbox
                      checked={!!checkboxState[call.id]}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleCall(call)}
                      sx={{ ml: 1 }}
                    />

                    <ListItemButton
                      onClick={() => setSelectedCall(call)}
                      sx={{ py: 1.25, px: 2 }}
                    >
                      <Box sx={{ width: "100%", display: "flex", flexDirection: "column", gap: 0.75 }}>
                        {/* Ligne 1 : date · dernier état (si dispo) */}
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 2,
                            color: "text.secondary",
                          }}
                        >
                          <Typography variant="caption" sx={{ fontWeight: 600 }}>
                            {formatDateFR(call.createdAt)}
                            {call.stats.call_start_time && (
                              <> · {formatCallTime(call.stats.call_start_time)}</>
                            )}
                          </Typography>
                          {states[call.stats.last_state] && (
                            <Typography variant="caption">
                              Dernier état : {states[call.stats.last_state]}
                            </Typography>
                          )}
                        </Box>

                        {/* Ligne 2 : numéro mis en avant + chips */}
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            flexWrap: "wrap",
                          }}
                        >
                          <Box
                            sx={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 0.5,
                              bgcolor: "rgba(72,200,175,0.12)",
                              color: "#2a6f64",
                              px: 1.25,
                              py: 0.25,
                              borderRadius: "999px",
                              fontWeight: 700,
                              fontSize: "0.8rem",
                              fontVariantNumeric: "tabular-nums",
                              letterSpacing: 0.3,
                              lineHeight: 1.6,
                            }}
                          >
                            <span aria-hidden style={{ fontSize: 12 }}>📞</span>
                            {formatPhoneFR(call.stats.phoneNumber)}
                          </Box>

                          {(() => {
                            const chips = getCallChips(call, examLabelMap);
                            return chips.map((chip, i) => (
                              <Chip
                                key={i}
                                size="small"
                                variant={chip.variant ?? "filled"}
                                label={chip.label}
                                color={chip.customColor ? undefined : chip.muiColor}
                                sx={
                                  chip.customColor
                                    ? chip.variant === "outlined"
                                      ? {
                                          borderColor: chip.customColor,
                                          color: chip.customColor,
                                          backgroundColor: "transparent",
                                          fontWeight: 600,
                                        }
                                      : {
                                          backgroundColor: chip.customColor,
                                          color: chip.textColor ?? "white",
                                          fontWeight: 600,
                                        }
                                    : undefined
                                }
                              />
                            ));
                          })()}
                        </Box>

                        {/* Ligne 3 : aperçu de la conversation */}
                        {firstStep && (
                          <Typography
                            variant="caption"
                            noWrap
                            sx={{ color: "text.secondary", display: "block" }}
                          >
                            <strong>{firstStep.text}</strong>
                            {secondStep && <span> — {secondStep.text}</span>}
                          </Typography>
                        )}
                      </Box>
                    </ListItemButton>

                  </ListItem>

                  {index < calls.length - 1 && <Divider />}

                </Box>

              );

            })}

          </List>

          {totalPages > 1 && (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, v) => setPage(v)}
              />
            </Box>
          )}
        </>
      )}

      <Drawer
        anchor="right"
        open={!!selectedCall}
        onClose={() => setSelectedCall(null)}
        PaperProps={{ sx: { width: { xs: "100%", sm: 500 }, p: 3 } }}
      >

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}
        >
          <Typography variant="h6">Conversation</Typography>

          <Button
            size="small"
            variant="outlined"
            startIcon={<IconDownload size={16} />}
            disabled={!selectedCall || filteredSteps.length === 0}
            onClick={() => {
              if (selectedCall) exportCallToPdf(selectedCall, filteredSteps);
            }}
            sx={{
              borderColor: "#48C8AF",
              color: "#2a6f64",
              fontWeight: 600,
              textTransform: "none",
              "&:hover": { borderColor: "#3BA992", bgcolor: "rgba(72,200,175,0.08)" },
            }}
          >
            Exporter PDF
          </Button>
        </Box>

        {filteredSteps.map((text: any, idx: number) => {

          const speaker: Speaker = idx % 2 === 0 ? "Lyrae" : "User";

          return (
            <Box
              key={idx}
              sx={{
                display: "flex",
                justifyContent: speaker === "Lyrae" ? "flex-start" : "flex-end",
                mb: 1,
              }}
            >
              <Box
                sx={{
                  p: 1.25,
                  borderRadius: 2,
                  bgcolor:
                    speaker === "Lyrae"
                      ? "rgba(72,200,175,0.15)"
                      : "#eee",
                  maxWidth: "75%",
                }}
              >
                <Typography variant="body2">
                  {text.text}
                </Typography>
              </Box>
            </Box>
          );
        })}

      </Drawer>

    </Box>
  );
}