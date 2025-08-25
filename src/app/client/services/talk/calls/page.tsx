"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Box,
  Typography,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Alert
} from "@mui/material";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { IconEye } from "@tabler/icons-react";
import { useCentre } from "@/app/context/CentreContext";

interface Call {
  id: number;
  caller: string;
  called: string;
  intent: string;
  firstname: string | null;
  lastname: string | null;
  birthdate: string | null;
  createdAt: string;
  steps: string[];
}

interface IntentConfig {
  value: string;
  label: string;
}

export default function TalkPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { selectedUserId, selectedCentre } = useCentre(); // 👈

  const intents: IntentConfig[] = [
    { value: "all", label: "Tous" },
    { value: "prise de rdv", label: "Rendez-vous" },
    { value: "urgence", label: "Urgences" },
  ];

  const [selectedIntent, setSelectedIntent] = useState("all");
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("daysAgo", "all");
      if (selectedIntent !== "all") params.set("intent", selectedIntent);
      if (selectedUserId) params.set("asUserId", String(selectedUserId)); // 👈

      const res = await fetch(`/api/calls?${params.toString()}`);
      if (!res.ok) throw new Error("Erreur lors du fetch des appels");
      const data: Call[] = await res.json();
      setCalls(data);
    } catch (err) {
      console.error(err);
      setCalls([]);
    } finally {
      setLoading(false);
    }
  }, [selectedIntent, selectedUserId]); // 👈 refetch si changement de centre

  useEffect(() => {
    if (status === "authenticated") {
      fetchCalls();
    }
  }, [status, fetchCalls]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    }
  }, [status, router]);

  return (
    <Box sx={{ p: 3, bgcolor: "#F8F8F8", minHeight: "100vh" }}>
      <Typography variant="h4" gutterBottom>
        LYRAE © Talk
      </Typography>

      <Box sx={{ p: 3, mt: 2, bgcolor: "#fff", borderRadius: 2 }}>
        <Typography variant="h5" gutterBottom>
          Appels Reçus
        </Typography>
        <Typography variant="subtitle2" sx={{ mb: 2, color: "text.secondary" }}>
          {selectedCentre ? "Centre sélectionné" : "Vos données"} — toutes périodes
        </Typography>

        <Box sx={{ mb: 2, maxWidth: 240 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="intent-label">Filtrer par intent</InputLabel>
            <Select
              labelId="intent-label"
              value={selectedIntent}
              label="Filtrer par intent"
              onChange={(e) => setSelectedIntent(e.target.value as string)}
            >
              {intents.map((it) => (
                <MenuItem key={it.value} value={it.value}>
                  {it.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress sx={{ color: "#48C8AF" }} />
          </Box>
        ) : calls.length === 0 ? (
          <Alert severity="info">Aucun appel trouvé.</Alert>
        ) : (
          <Grid container spacing={2}>
            {calls.map((call) => (
              <Grid item xs={12} sm={6} md={4} key={call.id}>
                <Card variant="outlined">
                  <CardContent sx={{ p: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      <strong>Intent :</strong> {call.intent}
                    </Typography>
                    <Typography variant="body2">
                      <strong>De :</strong> {call.caller}
                    </Typography>
                    <Typography variant="body2">
                      <strong>À :</strong> {call.called}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Nom :</strong> {call.firstname ?? "--"} {call.lastname ?? ""}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Date de naissance :</strong>{" "}
                      {call.birthdate ? new Date(call.birthdate).toLocaleDateString() : "--"}
                    </Typography>
                    <Typography variant="caption" display="block" sx={{ mt: 1, color: "text.secondary" }}>
                      {new Date(call.createdAt).toLocaleString()}
                    </Typography>
                    <Box sx={{ textAlign: "right", mt: 1 }}>
                      <Button
                        size="small"
                        startIcon={<IconEye size={16} />}
                        onClick={() => router.push(`/client/services/talk/calls/${call.id}`)}
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
                      >
                        Détails
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}

        <Box sx={{ mt: 3, textAlign: "right" }}>
          <Button
            variant="outlined"
            startIcon={<IconEye size={18} />}
            onClick={() => router.push("/client/services/talk/calls")}
            sx={{
              borderColor: "#48C8AF",
              color: "#48C8AF",
              "&:hover": { backgroundColor: "rgba(72,200,175,0.08)" },
            }}
          >
            Voir tous
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
