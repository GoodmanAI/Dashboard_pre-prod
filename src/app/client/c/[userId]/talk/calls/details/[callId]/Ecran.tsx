"use client";

import { useTalkBasePath } from "@/utils/talkRoutes";
import SectionHeader from "@/components/admin/SectionHeader";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Box, CircularProgress, Alert } from "@mui/material";
import Transcription from "@/components/transcription/Transcription";
import type { EntiteRobot } from "@/lib/entitesTranscription";

export default function CallConversationPage({ params }: { params: { id: string; callId: string } }) {
  // Les étapes telles que stockées, WaitSound compris : les index de `stats.entites` y
  // renvoient. Le composant les écarte à l'affichage.
  const [steps, setSteps] = useState<Array<{ speaker?: string; text?: string }>>([]);
  const [entites, setEntites] = useState<EntiteRobot[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const userProductId = Number(params.id);
  const basePath = useTalkBasePath(userProductId);
  const callId = Number(params.callId);
  const searchParams = useSearchParams();

  const from: any = searchParams?.get("from");

  useEffect(() => {
    if (!userProductId || !callId) return;

    setLoading(true);
    setError(null);

    fetch(`/api/calls?userProductId=${userProductId}&call=${callId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Erreur lors du fetch de l'appel");
        return res.json();
      })
      .then((data: { steps?: Array<{ speaker?: string; text?: string }>; stats?: { entites?: EntiteRobot[] } }[]) => {
        setSteps(data[0]?.steps ?? []);
        setEntites(data[0]?.stats?.entites ?? null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userProductId, callId]);

  return (
    <Box>
      {/* Une conversation se lit mieux en colonne étroite. */}
      <Box sx={{ maxWidth: 800 }}>
        <SectionHeader
          title="Conversation"
          retour={{ libelle: "Retour à la liste", href: from || `${basePath}/calls` }}
        />

        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress sx={{ color: "var(--accent)" }} />
          </Box>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        {!loading && !error && steps.length === 0 && (
          <Alert severity="info">Aucune conversation trouvée pour cet appel.</Alert>
        )}

        {!loading && !error && steps.length > 0 && <Transcription steps={steps} entites={entites} />}
      </Box>
    </Box>

  );
}
