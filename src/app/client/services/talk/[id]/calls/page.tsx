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
  ListItemSecondaryAction,
  Chip,
} from "@mui/material";
import { IconEye } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';

type Speaker = "Lyrae" | "User";

const call_status: any = {
  "no_slot": "pas de créneaux",
  "success": "succès",
  "not_performed": "pas effectué",
  "canceled": "annulé",
  "rescheduled": "modifié", 
}

interface CallSummary {
  id: number;
  userProductId: number;
  centerId: number;
  steps: Record<Speaker, any>;
  stats: {
    intents: string[];
    rdv_status: "succès" | "pas de créneaux" | "pas effectué" | "annulé" | "modifié" | null;
    patient_status: "connu" | "nouveau" | "third_party" | null;
    end_reason: "raccroché" | "transferré" | "erreur logique" | "erreur timeout" | null;
    questions_completed: boolean;
    exam_code: string | null;
  };
}

interface CallListPageProps {
  params: { id: string }; // récupéré depuis la route Next.js
}

const formatCallTime = (timestamp: number) => {
  const date = new Date(timestamp);

  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function CallListPage({ params }: CallListPageProps) {
  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Transformer params.id en number
  const userProductId = Number(params.id);

  useEffect(() => {
    // Ne rien faire si userProductId invalide
    if (!userProductId || isNaN(userProductId)) return;

    setLoading(true);
    setError(null);

    fetch(`/api/calls?userProductId=${userProductId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Erreur lors du fetch des appels");
        return res.json();
      })
      .then((data: CallSummary[]) => setCalls(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

  }, [userProductId]); // ne dépend plus de rien d'autre

  return (
    <Box sx={{ p: 3, bgcolor: "#F8F8F8", minHeight: "100vh" }}>
      <Button
        variant="contained"
        startIcon={<ArrowBackIosIcon />}
        onClick={() => router.back()}
        sx={{ backgroundColor: "#48C8AF", marginBottom: 2 }}
      >
        Retour
      </Button>
      {/* <Typography variant="h5" gutterBottom>
        Tous les appels pour UserProduct #{userProductId}
      </Typography>

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress sx={{ color: "#48C8AF" }} />
        </Box>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && calls.length === 0 && (
        <Alert severity="info">Aucun appel trouvé pour ce UserProduct.</Alert>
      )} */}

      <List sx={{ bgcolor: "white", borderRadius: 2 }}>
        {calls.length == 0 && 
          <Typography variant="h6">Pas d&apos;appels à lister pour l&apos;instant</Typography>
        }
        {calls.length != 0 &&
        <>
          {calls.map((call: any, index) => {
            const firstStep = Object.values(call.steps)[0] as any | undefined;
            const secondStep = Object.values(call.steps)[2] as any | undefined;

            return (
              <Box key={call.id}>
                <ListItem alignItems="flex-start">
                  <ListItemText
                    primary={
                      <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                        <Typography variant="subtitle1" fontWeight={600}>
                          Appel #{call.id}
                        </Typography>

                        {call.stats.rdv_status && (
                          <Chip
                            size="small"
                            label={call_status[call.stats.rdv_status]}
                            color={
                              call.stats.rdv_status === "succès"
                                ? "success"
                                : call.stats.rdv_status === "annulé"
                                ? "error"
                                : "default"
                            }
                          />
                        )}
                        {call.stats.call_start_time && 
                          <>
                            <Typography
                              variant="caption"
                              sx={{ color: "text.secondary", whiteSpace: "nowrap" }}
                            >
                              {formatCallTime(call.stats.call_start_time)}
                            </Typography>
                          </>
                        }
                        {call.stats.call_start_time && 
                          <>
                            <Typography
                              variant="caption"
                              sx={{ color: "text.secondary", whiteSpace: "nowrap" }}
                            >
                              {call.stats.phone}
                            </Typography>
                          </>
                        }
                      </Box>
                    }
                    secondary={
                      <Box sx={{ mt: 0.5 }}>
                        {firstStep && (
                          <Typography
                            variant="body2"
                            sx={{ mt: 0.5 }}
                            noWrap
                          >
                            <p><strong>{firstStep.text}</strong></p>
                            {secondStep &&
                              <p><strong>{secondStep.text}</strong></p>
                            }
                          </Typography>
                        )}
                      </Box>
                    }
                  />

                  <ListItemSecondaryAction>
                    <Button
                      size="small"
                      startIcon={<IconEye size={16} />}
                      sx={{
                        borderColor: "#48C8AF",
                        color: "#48C8AF",
                        textTransform: "none",
                        "&:hover": {
                          backgroundColor: "rgba(72,200,175,0.08)",
                        },
                      }}
                      variant="outlined"
                      onClick={() =>
                        router.push(
                          `/client/services/talk/${userProductId}/calls/details/${call.id}`
                        )
                      }
                    >
                      Détails
                    </Button>
                  </ListItemSecondaryAction>
                </ListItem>

                {/* {index < calls.length - 1 && <Divider component="li" />} */}
              </Box>
            );
          })}
        </>
        }
      </List>
    </Box>
  );
}
