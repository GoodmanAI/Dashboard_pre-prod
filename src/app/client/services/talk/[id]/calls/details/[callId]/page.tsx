"use client";

import { useEffect, useState } from "react";
import { Box, Typography, CircularProgress, Alert } from "@mui/material";

type Speaker = "Lyrae" | "User";

export default function CallConversationPage({ params }: { params: { id: string; callId: string } }) {
  const [steps, setSteps] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userProductId = Number(params.id);
  const callId = Number(params.callId);

  useEffect(() => {
    if (!userProductId || !callId) return;

    setLoading(true);
    setError(null);

    fetch(`/api/calls?userProductId=${userProductId}&call=${callId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Erreur lors du fetch de l'appel");
        return res.json();
      })
      .then((data: { steps: string[] }[]) => {
        if (data.length > 0) {
          setSteps(data[0].steps ?? []);
        } else {
          setSteps([]);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userProductId, callId]);

  return (
    <Box sx={{ p: 3, bgcolor: "#F8F8F8", minHeight: "100vh" }}>
      <Typography variant="h5" gutterBottom>
        Conversation
      </Typography>

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress sx={{ color: "#48C8AF" }} />
        </Box>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && steps.length === 0 && (
        <Alert severity="info">Aucune conversation trouvée pour cet appel.</Alert>
      )}

      {steps.map((text, idx) => {
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
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, color: "text.secondary", mb: 0.5 }}
              >
                {speaker}
              </Typography>
              <Typography variant="body2">{text}</Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
