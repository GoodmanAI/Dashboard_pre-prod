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
  Popover
} from "@mui/material";
import { useRouter, useSearchParams } from "next/navigation";
import ArrowBackIosIcon from "@mui/icons-material/ArrowBackIos";
import { io } from "socket.io-client";
import { subDays, startOfDay } from "date-fns";
import DateRangePicker, { DateRange } from "@/components/DateRangePicker";

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
    const today = startOfDay(new Date());
    return {
      from: subDays(today, 6),
      to: today,
    };
  });

  const [dateRangeDraft, setDateRangeDraft] = useState<DateRange>(dateRange);

  // URL → state
  useEffect(() => {
    const pageFromUrl: any = Number(searchParams?.get("page"));
    const statusFromUrl: any = searchParams?.get("status");
    const examTypeFromUrl: any = searchParams?.get("examType");
    const tabFromUrl: any = searchParams?.get("tab");

    if (!isNaN(pageFromUrl) && pageFromUrl > 0) setPage(pageFromUrl);
    if (statusFromUrl) setStatusFilter(statusFromUrl);
    if (examTypeFromUrl) setExamTypeFilter(examTypeFromUrl);
    if (tabFromUrl) setTab(tabFromUrl);
  }, []);

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

    router.replace(`/client/services/talk/${userProductId}/calls?${paramsUrl.toString()}`, { scroll: false });

  }, [page, statusFilter, examTypeFilter, tab]);

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

  }, [userProductId, page, statusFilter, examTypeFilter, tab, dateRange]);

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

      <Box sx={{ display: "flex", gap: 2, mb: 2 }}>

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
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        >
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Sélectionner une période
            </Typography>

            <DateRangePicker
              value={dateRangeDraft}
              onChange={(range) => setDateRangeDraft(range)}
            />
          </Box>

          <Box sx={{ mt: 2, mb: 2, mr: 2, display: "flex", justifyContent: "flex-end" }}>
            <Button
              variant="contained"
              onClick={() => {
                setDateRange(dateRangeDraft);
                setAnchorEl(null);
                setPage(1);
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

      <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
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
            <MenuItem value="full_planning_end">Planning complet</MenuItem>
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

                    <ListItemButton onClick={() => setSelectedCall(call)}>

                      <ListItemText
                        primary={
                          <Box display="flex" gap={1} alignItems="center" sx={{ width: "100%" }}>
                            <Typography fontWeight={600}>
                              Appel du {formatDateFR(call.createdAt)}{" "}
                              {call.stats.call_start_time &&
                                `à ${formatCallTime(call.stats.call_start_time)}`}
                            </Typography>

                            <Typography
                              fontSize={14}
                              color="text.secondary"
                              sx={{ fontWeight: "bold" }}
                            >
                              {call.stats.phoneNumber}
                            </Typography>

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

                            <Typography
                              fontSize={14}
                              sx={{ textDecoration: "underline", marginLeft: "auto" }}
                            >
                              Dernier état: {states[call.stats.last_state] || "N/A"}
                            </Typography>

                          </Box>
                        }

                        secondary={
                          firstStep && (
                            <Typography variant="body2" noWrap>
                              <strong>{firstStep.text}</strong>
                              {secondStep && <span> — {secondStep.text}</span>}
                            </Typography>
                          )
                        }
                      />

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

        <Typography variant="h6" gutterBottom>
          Conversation
        </Typography>

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