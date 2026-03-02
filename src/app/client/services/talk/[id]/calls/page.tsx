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
} from "@mui/material";
import { useRouter, useSearchParams } from "next/navigation";
import ArrowBackIosIcon from "@mui/icons-material/ArrowBackIos";
import { Drawer } from "@mui/material";

type Speaker = "Lyrae" | "User";

const call_status: any = {
  no_slot: "pas de créneaux",
  success: "succès",
  not_performed: "pas effectué",
  canceled: "annulé",
  rescheduled: "modifié",
};

interface CallSummary {
  id: number;
  userProductId: number;
  centerId: number;
  steps: Record<Speaker, any>;
  stats: {
    intents: string[];
    rdv_status:
      | "success"
      | "no_slot"
      | "not_performed"
      | "canceled"
      | "rescheduled"
      | null;
    patient_status: "connu" | "nouveau" | "third_party" | null;
    end_reason:
      | "raccroché"
      | "transferré"
      | "erreur logique"
      | "erreur timeout"
      | null;
    questions_completed: boolean;
    exam_code: string | null;
    call_start_time?: number;
    phoneNumber?: string;
    rdv_canceled?: number;
    rdv_modified?: number;
  };
  createdAt: string;
}

interface CallListPageProps {
  params: { id: string };
}

const ITEMS_PER_PAGE = 10;

const formatCallTime = (timestamp?: number) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedCall, setSelectedCall] = useState<CallSummary | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const userProductId = Number(params.id);

  useEffect(() => {
    console.log("selectedCall", selectedCall);
  }, [selectedCall]);

  // Sync URL => state
  useEffect(() => {
    const pageFromUrl = Number(searchParams.get("page"));
    const statusFromUrl = searchParams.get("status");

    if (!isNaN(pageFromUrl) && pageFromUrl > 0) {
      setPage(pageFromUrl);
    }

    if (statusFromUrl) {
      setStatusFilter(statusFromUrl);
    }
  }, []);

  // Sync state => URL
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("status", statusFilter);

    router.replace(
      `/client/services/talk/${userProductId}/calls?${params.toString()}`,
      { scroll: false }
    );
  }, [page, statusFilter]);

  // Fetch data
  useEffect(() => {
    if (!userProductId || isNaN(userProductId)) return;

    setLoading(true);
    setError(null);

    fetch(
      `/api/calls?userProductId=${userProductId}&page=${page}&limit=${ITEMS_PER_PAGE}&status=${statusFilter}`
    )
      .then((res) => {
        if (!res.ok) throw new Error("Erreur lors du fetch des appels");
        return res.json();
      })
      .then(({ data, total }) => {
        setCalls(data);
        setTotal(total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userProductId, page, statusFilter]);

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const filteredSteps = selectedCall?.steps?.filter(
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

      <FormControl sx={{ mb: 2, minWidth: 220, ml: 5 }}>
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

      {!loading && !error && calls.length === 0 && (
        <Alert severity="info">Aucun appel trouvé pour ce filtre.</Alert>
      )}

      {!loading && calls.length > 0 && (
        <>
          <List sx={{ bgcolor: "white", borderRadius: 2 }}>
            {calls.map((call, index) => {
              const stepsArray = Object.values(call.steps || {});
              const firstStep = stepsArray[0];
              const secondStep = stepsArray[2];

              return (
                <Box key={call.id}>
                  <ListItem disablePadding>
                    <ListItemButton
                      onClick={() => setSelectedCall(call)}
                    >
                      <ListItemText
                        primary={
                          <Box display="flex" gap={1} alignItems="center">
                            <Typography fontWeight={600}>
                              Appel du {formatDateFR(call.createdAt)}{" "}
                              {call.stats.call_start_time &&
                                `à ${formatCallTime(call.stats.call_start_time)}`}
                            </Typography>

                            {call.stats.rdv_status && (
                              <Chip
                                size="small"
                                label={
                                  call.stats.rdv_canceled && call.stats.rdv_canceled > 0
                                    ? "annulé"
                                    : call.stats.rdv_modified && call.stats.rdv_modified > 0
                                    ? "modifié"
                                    : call_status[call.stats.rdv_status]
                                }
                                color={
                                  call.stats.rdv_status === "success"
                                    ? "success"
                                    : call.stats.rdv_status === "no_slot"
                                    ? "error"
                                    : "default"
                                }
                              />
                            )}
                          </Box>
                        }
                        secondary={
                          firstStep && (
                            <Typography variant="body2" noWrap>
                              <strong>{firstStep.text}</strong>
                              {secondStep && (
                                <>
                                  {" — "}
                                  <strong>{secondStep.text}</strong>
                                </>
                              )}
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
                onChange={(_, value) => setPage(value)}
                disabled={loading}
              />
            </Box>
          )}

          <Drawer
            anchor="right"
            open={!!selectedCall}
            onClose={() => setSelectedCall(null)}
            PaperProps={{
              sx: {
                width: { xs: "100%", sm: 500 },
                p: 3,
                bgcolor: "#F8F8F8",
              },
            }}
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
                    justifyContent:
                      speaker === "Lyrae" ? "flex-start" : "flex-end",
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
        </>
      )}
    </Box>
  );
}
