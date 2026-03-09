"use client";

import { useEffect, useState } from "react";
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
  Checkbox
} from "@mui/material";
import { useRouter, useSearchParams } from "next/navigation";
import ArrowBackIosIcon from "@mui/icons-material/ArrowBackIos";
import { io } from "socket.io-client";

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
  error_logic: "- Erreur système",
  admin: "- Démarche administrative",
  exam_interv: "- Examen interventionnel",
  patient_not_found: "- Patient non trouvé",
  error_identification: "- Erreur d'identification",
  create_rdv_failed: "- Échec de création de RDV",
};

const call_status: any = {
  no_slot: "Pas de créneaux",
  success: "Succès",
  not_performed: "Pas effectué",
  canceled: "Annulé",
  rescheduled: "Modifié",
  full_planning_end: "Planning complet",
};



function getCallChip(call: any) {
  let label = "";
  let color: "success" | "error" | "warning" | "default" = "default";

  if (call.stats.rdv_canceled > 0) label = "Annulé";
  else if (call.stats.rdv_modified > 0) label = "Modifié";
  else if (call.stats.end_reason === "transfer") {
    label = "Redirection " + (transferReason[call.stats.transferReason] || "");
    color = "warning";
  } else if (
    call.stats.rdv_booked === 0 &&
    call.stats.rdv_canceled === 0 &&
    call.stats.rdv_modified === 0 &&
    call.stats.end_reason !== "transfer"
  ) label = "Raccroché";
  else label = call_status[call.stats.rdv_status];

  if (call.stats.rdv_status === "success") color = "success";
  if (call.stats.rdv_status === "no_slot") color = "error";

  return { label, color };
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
  const [tab, setTab] = useState("all");

  const [selectedCall, setSelectedCall] = useState<any | null>(null);
  const [checkboxState, setCheckboxState] = useState<Record<number, boolean>>({});
  
  // URL → state
  useEffect(() => {
    const pageFromUrl: any = Number(searchParams?.get("page"));
    const statusFromUrl: any = searchParams?.get("status");
    const tabFromUrl: any = searchParams?.get("tab");

    if (!isNaN(pageFromUrl) && pageFromUrl > 0) setPage(pageFromUrl);
    if (statusFromUrl) setStatusFilter(statusFromUrl);
    if (tabFromUrl) setTab(tabFromUrl);
  }, []);

  // state → URL
  useEffect(() => {
    const paramsUrl = new URLSearchParams();

    paramsUrl.set("page", String(page));
    paramsUrl.set("status", statusFilter);
    paramsUrl.set("tab", tab);

    router.replace(`/client/services/talk/${userProductId}/calls?${paramsUrl.toString()}`, { scroll: false });

  }, [page, statusFilter, tab]);

  // FETCH
  useEffect(() => {

    if (!userProductId || isNaN(userProductId)) return;

    const controller = new AbortController();

    const fetchCalls = async () => {

      try {

        setLoading(true);
        setError(null);
        setCalls([]);

        const params = new URLSearchParams({
          userProductId: String(userProductId),
          page: String(page),
          limit: String(ITEMS_PER_PAGE),
          status: statusFilter,
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

  }, [userProductId, page, statusFilter, tab]);

  useEffect(() => {

    fetch("/api/socket");

    const socket = io({path: "/api/socket"});
    socket.on("call-treated", ({ callId, treated }) => {
      setCheckboxState((prev) => ({
        ...prev,
        [callId]: treated
      }));
      setCalls((prev) =>
        prev.map((c) =>
          c.id === callId ? { ...c, treated } : c
        )
      );
    });

    return () => {
      socket.disconnect();
    };
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

      <Tabs
        value={tab}
        onChange={(_, v) => {
          setTab(v);
          setPage(1);
        }}
        sx={{ mb: 3 }}
      >
        <Tab value="all" label="Tous les appels" />
        <Tab value="scanners" label="Scanners" />
      </Tabs>

      <FormControl sx={{ mb: 2, minWidth: 220 }}>
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
          <MenuItem value="success">Succès</MenuItem>
          <MenuItem value="no_slot">Pas de créneaux</MenuItem>
          <MenuItem value="not_performed">Pas effectué</MenuItem>
          <MenuItem value="canceled">Annulé</MenuItem>
          <MenuItem value="rescheduled">Modifié</MenuItem>
        </Select>
      </FormControl>

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
                            {(() => {
                              const chip = getCallChip(call);
                              return (
                                <Chip size="small" label={chip.label} color={chip.color} />
                              );
                            })()}

                            <Typography fontWeight={600}>
                              Appel du {formatDateFR(call.createdAt)}{" "}
                              {call.stats.call_start_time &&
                                `à ${formatCallTime(call.stats.call_start_time)}`}
                            </Typography>

                            <Typography
                              fontSize={14}
                              color="text.secondary"
                              sx={{ fontWeight: "bold", flex: 1 }}
                            >
                              {call.stats.phoneNumber}
                            </Typography>

                            <Typography
                              fontSize={14}
                              sx={{ textDecoration: "underline" }}
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