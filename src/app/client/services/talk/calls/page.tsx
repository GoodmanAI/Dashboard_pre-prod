"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Card,
  CardContent,
  CircularProgress,
} from "@mui/material";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { IconEye } from "@tabler/icons-react";

interface Call {
  id: number;
  caller: string;
  called: string;
  intent: string;
  firstname: string;
  lastname: string;
  birthdate: Date;
  createdAt: Date;
  steps: string[];
}

interface IntentConfig {
  value: string;
  sing_label: string;
  label: string;
}

const TalkPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();

  const intents: IntentConfig[] = [
    {
      value: "all",
      sing_label: "Appel reçu",
      label: "Appels reçus",
    },
    {
      value: "prise de rdv",
      sing_label: "Rendez-vous",
      label: "Rendez-vous",
    },
    {
      value: "urgence",
      sing_label: "Urgence",
      label: "Urgences",
    },
  ];
  const [calls, setCalls] = useState<number[]>([]);
  const [loadingCalls, setLoadingCalls] = useState<boolean>(true);

  useEffect(() => {
    async function fetchCalls() {
      try {
        const response = await fetch("/api/calls?daysAgo=1");
        if (!response.ok) {
          console.error("Erreur lors de la récupération des données client.");
          return;
        }
        const data = await response.json();
        setCalls(data);
      } catch (error) {
        console.error("Error fetching calls:", error);
      } finally {
        setLoadingCalls(false);
      }
    }
    if (session) {
      fetchCalls();
    }
  }, [session]);

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
        <Typography variant="subtitle1" gutterBottom>
          Visualisez et consultez les appels pris en charge par LyraeTalk.
        </Typography>
        <Box sx={{ display: "flex", gap: 10, flexWrap: "wrap", mt: 2 }}>
          <Card
            sx={{
              flex: "1 1 250px",
              minHeight: "300px",
              borderRadius: 2,
              border: "1px solid #e0e0e0",
              p: 2,
            }}
          >
            <CardContent
              sx={{ display: "flex", flexDirection: "column", height: "100%" }}
            >
              <Typography variant="h4">Appels</Typography>
              <Typography variant="subtitle1" gutterBottom>
                sur les dernières 24h
              </Typography>
              <Box
                sx={{
                  mt: "auto",
                  pt: 2,
                  display: "flex",
                  flexDirection: "row",
                  flexWrap: "wrap",
                }}
              >
                {loadingCalls ? (
                  <CircularProgress />
                ) : (
                  calls.map((call, index) => (
                    <Box
                      key={index}
                      sx={{
                        pt: 2,
                        m: 1,
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        flexDirection: "column",
                        flexWrap: "wrap",
                        width: "150px",
                      }}
                    >
                      <Typography variant="h5" sx={{ mb: 0 }}></Typography>
                      <Typography
                        variant="subtitle1"
                        sx={{ mb: 4 }}
                      ></Typography>
                    </Box>
                  ))
                )}
              </Box>
              <Box sx={{ mt: "auto", pt: 2 }}>
                <Button
                  variant="outlined"
                  startIcon={<IconEye size={18} />}
                  onClick={() => router.push("/client/services/talk/calls")}
                  sx={{
                    borderColor: "#48C8AF",
                    color: "#48C8AF",
                    "&:hover": {
                      borderColor: "#48C8AF",
                      backgroundColor: "rgba(72,200,175,0.08)",
                    },
                  }}
                >
                  Voir
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
};

export default TalkPage;
