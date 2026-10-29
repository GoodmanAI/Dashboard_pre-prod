"use client";

import SectionHeader from "@/components/admin/SectionHeader";
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
  ListItemButton,
  Chip,
  Drawer,
  IconButton,
  Tooltip,
} from "@mui/material";
import { IconFlagFilled, IconFlag, IconDownload, IconAlertTriangle, IconPhone } from "@tabler/icons-react";
import { io } from "socket.io-client";
import { useRouter } from "next/navigation";
import { useTalkBasePath } from "@/utils/talkRoutes";
import Transcription from "@/components/transcription/Transcription";
import PastilleMineur from "@/components/transcription/PastilleMineur";
import { useSignalement } from "@/components/shared/DialogSignalement";
import { apercuConversation } from "@/lib/entitesTranscription";
import { exporterTranscriptionPdf, formatPhoneFR } from "@/lib/transcriptionPdf";
import { useFiltresRecherche } from "@/lib/recherche/integre";
import { libellePeriode, plageDePeriode } from "@/lib/recherche/periode";


interface FlaggedCall {
  id: number;
  userProductId: number;
  centerId: number;
  steps: any;
  stats: any;
  createdAt: string;
  flagged?: boolean;
  flagComment?: string | null;
  treated?: boolean;
}

interface IncidentsPageProps {
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

export default function IncidentsPage({ params }: IncidentsPageProps) {
  const router = useRouter();
  const userProductId = Number(params.id);
  const basePath = useTalkBasePath(userProductId);

  const [calls, setCalls] = useState<FlaggedCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCall, setSelectedCall] = useState<any | null>(null);
  const [flaggedState, setFlaggedState] = useState<Record<number, boolean>>({});
  const { demanderCommentaire, dialogue: dialogueSignalement } = useSignalement();
  // Période posée par la recherche centrale (« les incidents d'hier »). L'écran n'a pas
  // d'autre filtre : la pastille la montre et se retire d'un clic.
  const periodeRecherche = useFiltresRecherche().periode;
  const [periode, setPeriode] = useState<string | undefined>(() =>
    plageDePeriode(periodeRecherche) ? periodeRecherche : undefined
  );
  const visibles = useMemo(() => {
    const plage = plageDePeriode(periode);
    if (!plage) return calls;
    const debut = plage.from.getTime();
    const fin = plage.to.getTime();
    return calls.filter((c) => {
      const t = new Date(c.createdAt).getTime();
      return t >= debut && t <= fin;
    });
  }, [calls, periode]);

  useEffect(() => {
    if (!userProductId || isNaN(userProductId)) return;

    const controller = new AbortController();

    const fetchCalls = async () => {
      try {
        setLoading(true);
        setError(null);

        const queryParams = new URLSearchParams({
          userProductId: String(userProductId),
          flagged: "true",
          mode: "all",
          from: new Date("2000-01-01").toISOString(),
          to: new Date().toISOString(),
        });

        console.log(queryParams);
        const res = await fetch(`/api/calls?${queryParams}`, { signal: controller.signal });
        console.log(res);
        if (!res.ok) throw new Error("Erreur lors du fetch des incidents");

        const data = await res.json();
        const list: FlaggedCall[] = Array.isArray(data) ? data : data.data ?? [];

        setCalls(list);
        const initial: Record<number, boolean> = {};
        list.forEach((c) => {
          initial[c.id] = !!c.flagged;
        });
        setFlaggedState(initial);
      } catch (err: any) {
        if (err.name !== "AbortError") setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCalls();
    return () => controller.abort();
  }, [userProductId]);

  useEffect(() => {
    const init = async () => {
      await fetch("/api/socket");
      const socket = io({ path: "/api/socket" });

      socket.on("call-flagged", ({ callId, flagged }) => {
        setFlaggedState((prev) => ({ ...prev, [callId]: flagged }));
        if (!flagged) {
          // Si on retire le flag, on enlève l'appel de la liste
          setCalls((prev) => prev.filter((c) => c.id !== callId));
        }
      });
    };

    init();
  }, []);

  const toggleFlag = async (call: FlaggedCall) => {
    const newValue = !flaggedState[call.id];
    // Même geste que la liste des appels : signaler demande ce qui s'est mal passé.
    let commentaire: string | null = null;
    if (newValue) {
      commentaire = await demanderCommentaire();
      if (commentaire === null) return;
    }
    setFlaggedState((prev) => ({ ...prev, [call.id]: newValue }));

    try {
      const res = await fetch(`/api/calls/${call.id}/flag`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagged: newValue, flagComment: commentaire }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      if (!newValue) {
        setCalls((prev) => prev.filter((c) => c.id !== call.id));
      }
    } catch (e) {
      setFlaggedState((prev) => ({ ...prev, [call.id]: !newValue }));
      console.error("Erreur update flagged", e);
    }
  };

  const filteredSteps = useMemo(
    () =>
      selectedCall?.steps?.filter(
        (line: any) => !String(line?.text ?? "").startsWith("WaitSound:")
      ) ?? [],
    [selectedCall]
  );

  return (
    <Box>
      <SectionHeader
        title="Incidents signalés"
        subtitle={
          loading
            ? "Appels où un problème a été relevé."
            : `${calls.length} appel${calls.length > 1 ? "s" : ""} où un problème a été relevé.`
        }
        retour={{ libelle: "Retour à LyraeTalk", href: basePath }}
        actions={
          <Button variant="outlined" onClick={() => router.push(`${basePath}/calls`)}>
            Liste des appels
          </Button>
        }
      />

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress sx={{ color: "var(--accent)" }} />
        </Box>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {periode && !loading && (
        <Box sx={{ mb: 1.5 }}>
          <Chip
            label={`Période : ${libellePeriode(periode)}`}
            onDelete={() => setPeriode(undefined)}
            size="small"
          />
        </Box>
      )}

      {!loading && !error && calls.length === 0 && (
        <Alert severity="info">Aucun appel signalé pour le moment.</Alert>
      )}

      {!loading && !error && calls.length > 0 && visibles.length === 0 && (
        <Alert severity="info">
          Aucun appel signalé sur cette période. Retirez la pastille pour revoir tous les incidents.
        </Alert>
      )}

      {!loading && visibles.length > 0 && (
        <List sx={{ bgcolor: "white", borderRadius: 2 }}>
          {visibles.map((call, index) => {
            const apercu = apercuConversation(call.steps);

            return (
              <Box key={call.id}>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => setSelectedCall(call)}
                    sx={{ py: 1.25, px: 2 }}
                  >
                    <Box sx={{ width: "100%", display: "flex", flexDirection: "column", gap: 0.75 }}>
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 2,
                          color: "text.secondary",
                        }}
                      >
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          {formatDateFR(call.createdAt)}
                          {call.stats?.call_start_time && (
                            <> · {formatCallTime(call.stats.call_start_time)}</>
                          )}
                        </Typography>
                      </Box>

                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          flexWrap: "wrap",
                        }}
                      >
                        <Box
                          sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 0.5,
                            bgcolor: "rgba(var(--accent-rgb), 0.12)",
                            color: "var(--accent-deep)",
                            px: 1.25,
                            py: 0.25,
                            borderRadius: "999px",
                            fontWeight: 700,
                            fontSize: "0.8rem",
                            fontVariantNumeric: "tabular-nums",
                            letterSpacing: 0.3,
                            lineHeight: 1.6,
                          }}
                        >
                          <IconPhone size={13} aria-hidden />
                          {formatPhoneFR(call.stats?.phoneNumber)}
                        </Box>

                        <PastilleMineur stats={call.stats} />

                        <Chip
                          size="small"
                          icon={<IconFlagFilled size={14} style={{ color: "white" }} />}
                          label="Incident"
                          sx={{
                            backgroundColor: "#ef4444",
                            color: "white",
                            fontWeight: 600,
                          }}
                        />
                      </Box>

                      {apercu.lyrae && (
                        <Typography
                          variant="caption"
                          noWrap
                          sx={{ color: "text.secondary", display: "block" }}
                        >
                          <strong>{apercu.lyrae}</strong>
                          {apercu.patient && <span>, {apercu.patient}</span>}
                        </Typography>
                      )}

                      {call.flagComment && (
                        <Typography
                          variant="caption"
                          sx={{ color: "text.primary", display: "block", mt: 0.25, whiteSpace: "pre-line" }}
                        >
                          <strong>Votre signalement :</strong> {call.flagComment}
                        </Typography>
                      )}
                    </Box>
                  </ListItemButton>

                  <Divider
                    orientation="vertical"
                    flexItem
                    sx={{ mx: 1, my: 1.5, borderColor: "#e5e7eb" }}
                  />

                  <Tooltip title={flaggedState[call.id] ? "Retirer le signalement" : "Signaler comme incident"}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFlag(call);
                      }}
                      sx={{ mr: 1, color: flaggedState[call.id] ? "#ef4444" : "#9ca3af" }}
                      aria-label="Retirer le signalement"
                    >
                      {flaggedState[call.id] ? <IconFlagFilled size={20} /> : <IconFlag size={20} />}
                    </IconButton>
                  </Tooltip>
                </ListItem>

                {index < visibles.length - 1 && <Divider />}
              </Box>
            );
          })}
        </List>
      )}

      <Drawer
        anchor="right"
        open={!!selectedCall}
        onClose={() => setSelectedCall(null)}
        PaperProps={{ sx: { width: { xs: "100%", sm: 500 }, p: 3 } }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="h6">Conversation</Typography>
            <PastilleMineur stats={selectedCall?.stats} />
          </Box>

          <Button
            size="small"
            variant="outlined"
            startIcon={<IconDownload size={16} />}
            disabled={!selectedCall || filteredSteps.length === 0}
            onClick={() => {
              if (selectedCall) exporterTranscriptionPdf(selectedCall, { titre: "Transcription d'appel (incident)", prefixeFichier: "incident" });
            }}
            sx={{
              borderColor: "var(--accent)",
              color: "var(--accent-deep)",
              fontWeight: 600,
              "&:hover": { borderColor: "var(--accent-press)", bgcolor: "rgba(var(--accent-rgb), 0.08)" },
            }}
          >
            Exporter PDF
          </Button>
        </Box>

        <Transcription steps={selectedCall?.steps} entites={selectedCall?.stats?.entites} />
      </Drawer>

      {dialogueSignalement}
    </Box>
  );
}
