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
import { useRouter } from "next/navigation";
import ArrowBackIosIcon from "@mui/icons-material/ArrowBackIos";

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
      | "succès"
      | "pas de créneaux"
      | "pas effectué"
      | "annulé"
      | "modifié"
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
  };
}

interface CallListPageProps {
  params: { id: string };
}

const formatCallTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

function formatDateFR(isoDate: any) {
  const date = new Date(isoDate);
  let formatted = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);

  // Majuscule au mois
  return formatted.replace(/\b([a-zà-ÿ])/i, (m) => m.toUpperCase());
}

const ITEMS_PER_PAGE = 10;

export default function CallListPage({ params }: CallListPageProps) {
  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const router = useRouter();
  const userProductId = Number(params.id);

  useEffect(() => {
    if (!userProductId || isNaN(userProductId)) return;

    setLoading(true);
    setError(null);

    fetch(`/api/calls?userProductId=${userProductId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Erreur lors du fetch des appels");
        return res.json();
      })
      .then((data: CallSummary[]) => {
        setCalls(data);
        setPage(1);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userProductId]);

  const filteredCalls =
    statusFilter === "all"
      ? calls
      : calls.filter(
          (call) => call.stats.rdv_status === statusFilter
        );

  const totalPages = Math.ceil(filteredCalls.length / ITEMS_PER_PAGE);

  const paginatedCalls = filteredCalls.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  return (
    <Box sx={{ p: 3, bgcolor: "#F8F8F8", minHeight: "100vh"}}>
      <Button
        variant="contained"
        startIcon={<ArrowBackIosIcon />}
        onClick={() => router.back()}
        sx={{ backgroundColor: "#48C8AF", mb: 2 }}
      >
        Retour
      </Button>

      <FormControl sx={{ mb: 2, minWidth: 220, ml: 5, overflow: "hidden" }}>
        <InputLabel id="status-filter-label">
          Filtrer par statut
        </InputLabel>
        <Select
          labelId="status-filter-label"
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

      {!loading && !error && filteredCalls.length === 0 && (
        <Alert severity="info">
          Aucun appel trouvé pour ce filtre.
        </Alert>
      )}

      {!loading && paginatedCalls.length > 0 && (
        <>
          <List
            sx={{
              bgcolor: "white",
              borderRadius: 2,
              overflowX: "hidden",
              maxWidth: "calc(100vw-1200px)" 
            }}
          >

            {paginatedCalls.map((call: any, index) => {
              const firstStep = Object.values(call.steps)[0] as any | undefined;
              const secondStep = Object.values(call.steps)[2] as any | undefined;

              return (
                <Box key={call.id} sx={{maxWidth: "calc(100vw - 350px)"}}>
                  <ListItem disablePadding sx={{ overflow: "hidden", maxWidth: "100%"}}>
                    <ListItemButton
                      onClick={() =>
                        router.push(
                          `/client/services/talk/${userProductId}/calls/details/${call.id}`
                        )
                      }
                      alignItems="flex-start"
                      sx={{
                        overflow: "hidden",
                        minWidth: 0,
                        "&:hover": {
                          backgroundColor: "rgba(72,200,175,0.08)",
                        },
                      }}
                    >
                      <ListItemText
                      sx={{
                        maxWidth: "100%",
                        overflow: "hidden",
                        minWidth: 0,
                      }}
                        primary={
                          <Box
                            sx={{
                              display: "flex",
                              gap: 1,
                              alignItems: "center",
                              flexWrap: "nowrap",
                              overflow: "hidden",
                              minWidth: 0,
                            }}
                          >
                            <Typography variant="subtitle1" fontWeight={600}>
                              
                              Appel du {formatDateFR(call.createdAt)} à {formatCallTime(call.stats.call_start_time) }
                            </Typography>

                            {call.stats.rdv_status && (
                              <Chip
                                size="small"
                                label={call_status[call.stats.rdv_status]}
                                sx={{
                                  backgroundColor:
                                    call.stats.rdv_status === "success"
                                      ? "success.main"
                                      : call.stats.rdv_status ===
                                        "no_slot"
                                      ? "error.main"
                                      : "grey.400",
                                  color: "white",
                                }}
                              />
                            )}

                            {call.stats.phoneNumber && (
                              <Typography
                                variant="caption"
                                sx={{
                                  color: "text.secondary",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {call.stats.phoneNumber}
                              </Typography>
                            )}
                          </Box>
                        }
                        secondary={
                          <Box sx={{ mt: 0.5, overflow: "hidden" }}>
                            {firstStep && (
                              <Typography
                                variant="body2"
                                sx={{
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                <strong>{firstStep.text}</strong>
                                {secondStep && (
                                  <>
                                    {" — "}
                                    <strong>{secondStep.text}</strong>
                                  </>
                                )}
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                    </ListItemButton>
                  </ListItem>

                  {index < paginatedCalls.length - 1 && <Divider />}
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
                color="primary"
              />
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
