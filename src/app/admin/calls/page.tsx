"use client";

import { useEffect, useMemo, useState } from "react";
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
  Popover,
} from "@mui/material";
import { pink } from "@mui/material/colors";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { subDays, startOfDay } from "date-fns";
import DateRangePicker, { DateRange } from "@/components/DateRangePicker";

/**
 * Page ADMIN : visualisation des appels de tous les centres.
 * - Accès restreint au rôle "ADMIN".
 * - Sélecteur de centre (tous les centres CLIENT disposant d'un produit Talk).
 * - Filtres date / statut / type d'examen / scanners & IRM.
 * - Drawer de conversation.
 */

type Speaker = "Lyrae" | "User";

interface AdminCentre {
  id: number;
  name?: string | null;
  email: string;
  userProductId: number | null;
  userProducts: Array<{
    id: number;
    product: { id: number; name: string };
  }>;
}

interface CallSummary {
  id: number;
  userProductId: number;
  centerId: number;
  steps: any;
  stats: any;
  createdAt: string;
  treated?: boolean;
}

const ITEMS_PER_PAGE = 10;

const states: Record<string, string> = {
  identification_birthdate: "- Etape Identification",
  identification_firstname: "- Etape Identification",
  identification_lastname: "- Etape Identification",
  identification_confirm: "- Etape Identification",
  get_intent: "- Etape Intention",
  confirm_intent: "- Etape Intention",
  get_phone: "- Etape Téléphone",
  confirm_phone: "- Etape Téléphone",
  exam_type: "- Etape Intention Examen",
  confirm_exam: "- Etape Intention Examen",
  exam_questions: "- Etape Questions",
  get_motif: "- Etape motif",
  get_dispo: "- Etape Créneaux",
  slot: "- Etape Créneaux",
  validate_exam: "- Etape validation RDV",
  consultation: "- Etape Consultation",
  cancel_fetch: "- Etape Annulation",
  cancel_confirm: "- Etape Annulation",
  modify_fetch: "- Etape Modification",
  modify_confirm: "- Etape Modification",
};

const transferReason: Record<string, string> = {
  exam_type: "- Type d'examen non géré",
  redirect: "- Demande de redirection",
  incident: "- Nécessite intervention humaine",
  emergency: "- Urgence médicale",
  multi_exam_not_accepted: "- Examens multiples non gérés",
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

const call_status: Record<string, string> = {
  no_slot: "Pas de créneaux",
  success: "Rendez-vous",
  not_performed: "Examen non pris en charge",
  canceled: "Annulé",
  rescheduled: "Modifié",
  full_planning_end: "Planning complet",
};

function getCallChips(call: any, examLabelMap: Record<string, string> = {}) {
  const stats = call.stats || {};
  const chips: {
    label: string;
    muiColor?: "success" | "error" | "warning" | "default";
    customColor?: string;
    textColor?: string;
    variant?: "filled" | "outlined";
  }[] = [];

  if (stats.transferReason === "emergency") {
    chips.push({ label: "Appel d'urgence", customColor: "#d264ee" });
  }
  if (Array.isArray(stats.intents) && stats.intents.includes("renseignements")) {
    chips.push({ label: "Renseignements", customColor: "#4a8560" });
  }
  if (stats.rdv_canceled > 0) {
    chips.push({ label: "Annulé", customColor: pink[500] });
  }
  if (stats.rdv_modified > 0) {
    chips.push({ label: "Modifié" });
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
    chips.push({ label: "Raccroché" });
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

function formatCallTime(timestamp?: number) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateFR(dateValue: string) {
  const date = new Date(dateValue);
  const formatted = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
  return formatted.replace(/\b([a-zà-ÿ])/i, (m) => m.toUpperCase());
}

export default function AdminCallsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  // -------- Accès restreint ADMIN
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    } else if (session && session.user.role !== "ADMIN") {
      router.push("/client");
    }
  }, [session, status, router]);

  // -------- Centres
  const [centres, setCentres] = useState<AdminCentre[]>([]);
  const [centresLoading, setCentresLoading] = useState(true);
  const [selectedUserProductId, setSelectedUserProductId] = useState<number | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || session?.user?.role !== "ADMIN") return;
    (async () => {
      try {
        const res = await fetch("/api/admin/centres", { cache: "no-store" });
        if (!res.ok) throw new Error("Erreur fetch centres");
        const data: AdminCentre[] = await res.json();
        setCentres(data);
        const first = data.find((c) => c.userProductId);
        if (first?.userProductId) setSelectedUserProductId(first.userProductId);
      } catch (e) {
        console.error(e);
      } finally {
        setCentresLoading(false);
      }
    })();
  }, [status, session?.user?.role]);

  // -------- Filtres et pagination
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [examTypeFilter, setExamTypeFilter] = useState("all");
  const [tab, setTab] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const today = startOfDay(new Date());
    return { from: subDays(today, 6), to: today };
  });
  const [dateRangeDraft, setDateRangeDraft] = useState<DateRange>(dateRange);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  // -------- Appels
  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCall, setSelectedCall] = useState<any | null>(null);

  // -------- Mapping types d'examen (spécifique au centre sélectionné)
  const [mapping, setMapping] = useState<any[]>([]);
  const examLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (Array.isArray(mapping)) {
      for (const e of mapping) if (e.diminutif) map[e.diminutif] = e.fr;
    }
    return map;
  }, [mapping]);

  useEffect(() => {
    if (!selectedUserProductId) return;
    (async () => {
      try {
        const res = await fetch(
          `/api/configuration/mapping/type_exam?userProductId=${selectedUserProductId}`
        );
        const data = await res.json();
        setMapping(data);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [selectedUserProductId]);

  // -------- Fetch appels quand les filtres ou le centre changent
  useEffect(() => {
    if (!selectedUserProductId) return;

    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError(null);
        setCalls([]);

        const toDate = new Date(dateRange.to);
        toDate.setHours(23, 59, 59, 999);

        const params = new URLSearchParams({
          userProductId: String(selectedUserProductId),
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
      } catch (err: any) {
        if (err.name !== "AbortError") setError(err.message);
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [selectedUserProductId, page, statusFilter, examTypeFilter, tab, dateRange]);

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const filteredSteps =
    selectedCall?.steps?.filter((line: any) => !line.text.includes("WaitSound")) ?? [];

  // -------- Rendu conditionnel (chargement / accès)
  if (status === "loading" || (status === "authenticated" && centresLoading)) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", minHeight: "50vh" }}>
        <CircularProgress />
      </Box>
    );
  }
  if (session?.user?.role !== "ADMIN") return null;

  return (
    <Box sx={{ p: 3, bgcolor: "#F8F8F8", minHeight: "100vh" }}>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>
        Appels — vue administrateur
      </Typography>

      {/* Sélecteur de centre */}
      <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
        <FormControl sx={{ minWidth: 280 }}>
          <InputLabel>Centre</InputLabel>
          <Select
            value={selectedUserProductId ? String(selectedUserProductId) : ""}
            label="Centre"
            onChange={(e) => {
              setSelectedUserProductId(Number(e.target.value));
              setPage(1);
            }}
          >
            {centres
              .filter((c) => c.userProductId)
              .map((c) => (
                <MenuItem key={c.id} value={String(c.userProductId)}>
                  {c.name ?? c.email}
                </MenuItem>
              ))}
          </Select>
        </FormControl>

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

      {!loading && !error && calls.length === 0 && (
        <Alert severity="info">Aucun appel trouvé pour ce centre et ces filtres.</Alert>
      )}

      {!loading && calls.length > 0 && (
        <>
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
                      transition: "opacity 0.2s",
                    }}
                  >
                    <ListItemButton onClick={() => setSelectedCall(call)}>
                      <ListItemText
                        primary={
                          <Box display="flex" gap={1} alignItems="center" sx={{ width: "100%" }}>
                            <Typography fontWeight={600}>
                              Appel du {formatDateFR(call.createdAt)}{" "}
                              {call.stats?.call_start_time &&
                                `à ${formatCallTime(call.stats.call_start_time)}`}
                            </Typography>
                            <Typography
                              fontSize={14}
                              color="text.secondary"
                              sx={{ fontWeight: "bold" }}
                            >
                              {call.stats?.phoneNumber}
                            </Typography>
                            {getCallChips(call, examLabelMap).map((chip, i) => (
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
                            ))}
                            <Typography
                              fontSize={14}
                              sx={{ textDecoration: "underline", marginLeft: "auto" }}
                            >
                              Dernier état: {states[call.stats?.last_state] || "N/A"}
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
                  bgcolor: speaker === "Lyrae" ? "rgba(72,200,175,0.15)" : "#eee",
                  maxWidth: "75%",
                }}
              >
                <Typography variant="body2">{text.text}</Typography>
              </Box>
            </Box>
          );
        })}
      </Drawer>
    </Box>
  );
}
