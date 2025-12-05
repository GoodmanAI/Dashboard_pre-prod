"use client";

import { useEffect, useState } from "react";
import { Box, Typography, Card, CardContent, CircularProgress, Grid, Alert, Button, Divider } from "@mui/material";
import { IconEye } from "@tabler/icons-react";
import { useRouter } from "next/navigation";

type Speaker = "Lyrae" | "User";

interface CallSummary {
  id: number;
  userProductId: number;
  centerId: number;
  steps: Record<Speaker, string>;
  stats: {
    intents: string[];
    rdv_status: "success" | "no_slot" | "not_performed" | "cancelled" | "modified" | null;
    patient_status: "known" | "new" | "third_party" | null;
    end_reason: "hangup" | "transfer" | "error_logic" | "error_timeout" | null;
    questions_completed: boolean;
    exam_code: string | null;
  };
}

interface CallListPageProps {
  params: { id: string }; // récupéré depuis la route Next.js
}

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
      <Typography variant="h5" gutterBottom>
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
      )}

      <Grid container spacing={2}>
        {calls.map((call) => (
          <Grid item xs={12} sm={6} md={4} key={call.id}>
            <Card variant="outlined">
              <CardContent sx={{ p: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  <strong>Call ID:</strong> {call.id}
                </Typography>
                <Typography variant="body2">
                  <strong>Center ID:</strong> {call.centerId}
                </Typography>
                <Typography variant="body2">
                  <strong>RDV Status:</strong> {call.stats.rdv_status ?? "—"}
                </Typography>
                <Divider sx={{ my: 1 }} />
                <Typography variant="subtitle2" gutterBottom>
                  Transcription (extrait)
                </Typography>
                {Object.entries(call.steps).map(([speaker, text], idx) => (
                  <Typography key={idx} variant="body2">
                    <strong>{speaker}:</strong> {text}
                  </Typography>
                ))}
                <Box sx={{ textAlign: "right", mt: 1 }}>
                  <Button
                    size="small"
                    startIcon={<IconEye size={16} />}
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
                    onClick={() => router.push(`/client/services/talk/${userProductId}/calls/details/${call.id}`)}
                  >
                    Détails
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
