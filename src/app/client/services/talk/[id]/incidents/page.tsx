"use client";

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
import { IconFlagFilled, IconFlag, IconDownload, IconAlertTriangle } from "@tabler/icons-react";
import { io } from "socket.io-client";
import { useRouter } from "next/navigation";
import { useTalkBasePath } from "@/utils/talkRoutes";
import ArrowBackIosIcon from "@mui/icons-material/ArrowBackIos";

type Speaker = "Lyrae" | "User";

interface FlaggedCall {
  id: number;
  userProductId: number;
  centerId: number;
  steps: any;
  stats: any;
  createdAt: string;
  flagged?: boolean;
  treated?: boolean;
}

interface IncidentsPageProps {
  params: { id: string };
}

function formatPhoneFR(p?: string | null): string {
  if (!p) return "—";
  const digits = p.replace(/\s/g, "");
  if (digits.startsWith("+33") && digits.length === 12) {
    return `+33 ${digits[3]} ${digits.slice(4, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`;
  }
  return p;
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

async function exportCallToPdf(call: any, steps: any[]) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - 2 * margin;
  let y = margin;

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor("#1f2937");
  doc.text("Transcription d'appel (incident)", margin, y);
  y += 28;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#374151");

  const date = new Date(call.createdAt);
  const dateStr = date.toLocaleDateString("fr-FR");
  const timeStr = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const phone = formatPhoneFR(call.stats?.phoneNumber);

  const metas: string[] = [
    `Date : ${dateStr} à ${timeStr}`,
    `Numéro appelant : ${phone}`,
  ];
  if (call.stats?.rdv_status) metas.push(`Statut RDV : ${call.stats.rdv_status}`);
  if (call.stats?.transferReason) metas.push(`Motif transfert : ${call.stats.transferReason}`);
  if (call.stats?.duration) metas.push(`Durée : ${call.stats.duration}s`);

  metas.forEach((line) => {
    doc.text(line, margin, y);
    y += 14;
  });

  y += 8;
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  doc.setFontSize(11);
  for (let i = 0; i < steps.length; i++) {
    const speaker = i % 2 === 0 ? "Lyrae" : "Patient";
    const text = String(steps[i]?.text ?? "");
    if (!text) continue;

    const wrapped = doc.splitTextToSize(text, contentWidth - 12);
    const blockHeight = 16 + wrapped.length * 14 + 6;

    if (y + blockHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }

    doc.setFont("helvetica", "bold");
    doc.setTextColor(speaker === "Lyrae" ? "#2a6f64" : "#374151");
    doc.text(speaker + " :", margin, y);
    y += 14;

    doc.setFont("helvetica", "normal");
    doc.setTextColor("#1f2937");
    doc.text(wrapped, margin + 12, y);
    y += wrapped.length * 14 + 10;
  }

  const fileDate = date.toISOString().slice(0, 10);
  doc.save(`incident-${call.id}-${fileDate}.pdf`);
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
    setFlaggedState((prev) => ({ ...prev, [call.id]: newValue }));

    try {
      await fetch(`/api/calls/${call.id}/flag`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagged: newValue }),
      });

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
        (line: any) => !line.text.includes("WaitSound")
      ) ?? [],
    [selectedCall]
  );

  return (
    <Box sx={{ p: 3, bgcolor: "#F8F8F8", minHeight: "100vh" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<ArrowBackIosIcon />}
          onClick={() => router.back()}
          sx={{ backgroundColor: "#48C8AF" }}
        >
          Retour
        </Button>

        <Button
          variant="outlined"
          onClick={() => router.push(`${basePath}/calls`)}
          sx={{
            borderColor: "#48C8AF",
            color: "#2a6f64",
            textTransform: "none",
            fontWeight: 600,
          }}
        >
          Liste des appels
        </Button>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
        <IconAlertTriangle size={28} color="#ef4444" />
        <Typography variant="h5" fontWeight={700}>
          Incidents signalés
        </Typography>
        {!loading && (
          <Chip
            size="small"
            label={`${calls.length} appel${calls.length > 1 ? "s" : ""}`}
            sx={{ bgcolor: "rgba(239,68,68,0.12)", color: "#ef4444", fontWeight: 600 }}
          />
        )}
      </Box>

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress sx={{ color: "#48C8AF" }} />
        </Box>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && calls.length === 0 && (
        <Alert severity="info">Aucun appel signalé pour le moment.</Alert>
      )}

      {!loading && calls.length > 0 && (
        <List sx={{ bgcolor: "white", borderRadius: 2 }}>
          {calls.map((call, index) => {
            const stepsArray = Object.values(call.steps || {});
            const firstStep: any = stepsArray[0];
            const secondStep: any = stepsArray[2];

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
                            bgcolor: "rgba(72,200,175,0.12)",
                            color: "#2a6f64",
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
                          <span aria-hidden style={{ fontSize: 12 }}>📞</span>
                          {formatPhoneFR(call.stats?.phoneNumber)}
                        </Box>

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

                      {firstStep && (
                        <Typography
                          variant="caption"
                          noWrap
                          sx={{ color: "text.secondary", display: "block" }}
                        >
                          <strong>{firstStep.text}</strong>
                          {secondStep && <span> — {secondStep.text}</span>}
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

                {index < calls.length - 1 && <Divider />}
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
          <Typography variant="h6">Conversation</Typography>

          <Button
            size="small"
            variant="outlined"
            startIcon={<IconDownload size={16} />}
            disabled={!selectedCall || filteredSteps.length === 0}
            onClick={() => {
              if (selectedCall) exportCallToPdf(selectedCall, filteredSteps);
            }}
            sx={{
              borderColor: "#48C8AF",
              color: "#2a6f64",
              fontWeight: 600,
              textTransform: "none",
              "&:hover": { borderColor: "#3BA992", bgcolor: "rgba(72,200,175,0.08)" },
            }}
          >
            Exporter PDF
          </Button>
        </Box>

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
                <Typography variant="body2">{text.text}</Typography>
              </Box>
            </Box>
          );
        })}
      </Drawer>
    </Box>
  );
}
