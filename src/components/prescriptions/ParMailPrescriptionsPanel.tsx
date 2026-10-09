"use client";

import Retour from "@/components/shared/Retour";
import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import { Event, MailOutline, Phone } from "@mui/icons-material";
import { IconCheck } from "@tabler/icons-react";
import ExamTypeBadge, { toExamTypeCode } from "@/components/shared/ExamTypeBadge";

/**
 * ParMailPrescriptionsPanel (09/10/2026).
 * -----------------------------------------------------------------------------
 * RDV dont le patient n'avait pas de mobile : le robot lui a dit d'envoyer son
 * ordonnance par mail a l'adresse du centre. Le secretariat verifie la boite
 * mail, puis range la carte.
 *
 * Meme gabarit de carte que « En attente patient » et « Refusées », bordure
 * bleue. Les cartes arrivent triees par le serveur (RDV le plus proche en
 * tete) ; la page les charge pour le compteur de l'onglet.
 *
 * Endpoints : GET /api/prescriptions/par-mail, POST .../[id]/ranger.
 */

const EXAM_LABELS: Record<string, string> = {
  scanner: "Scanner",
  irm: "IRM",
  mammo: "Mammographie",
  radiographie: "Radiographie",
  echographie: "Echographie",
};

export type ParMailItem = {
  id: number;
  examType: string;
  appointmentDate: string;
  firstname: string;
  lastname: string;
  phone: string;
  createdAt: string;
};

function formatFrDateOnly(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatFrTimeOnly(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatFrDateShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPhoneFr(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const national = digits.startsWith("33") && digits.length === 11 ? `0${digits.slice(2)}` : digits;
  if (national.length === 10) return national.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  return raw;
}

export default function ParMailPrescriptionsPanel({
  userProductId,
  items,
  loading,
  onRangee,
}: {
  userProductId: number;
  items: ParMailItem[];
  loading: boolean;
  onRangee: (id: number) => void;
}) {
  const [ranging, setRanging] = useState<Set<number>>(new Set());
  const [snack, setSnack] = useState<{ msg: string; kind: "success" | "error" } | null>(null);

  const ranger = async (id: number) => {
    setRanging((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/prescriptions/par-mail/${id}/ranger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userProductId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onRangee(id);
      setSnack({ msg: "Carte rangée.", kind: "success" });
    } catch (e: any) {
      setSnack({ msg: e?.message ?? "La carte n'a pas été rangée. Réessayez dans un instant.", kind: "error" });
    } finally {
      setRanging((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <Stack alignItems="center" sx={{ py: 6 }}>
        <CircularProgress sx={{ color: "var(--accent)" }} />
      </Stack>
    );
  }

  if (items.length === 0) {
    return (
      <Card sx={{ p: 4, textAlign: "center", bgcolor: "#F0FDF4" }}>
        <IconCheck size={32} color="#16a34a" />
        <Typography sx={{ mt: 1, color: "#15803d", fontWeight: 600 }}>
          Aucune ordonnance à chercher dans votre boîte mail.
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5, color: "#7A8FA6" }}>
          Les patients sans portable apparaîtront ici après leur appel.
        </Typography>
      </Card>
    );
  }

  return (
    <>
      <Alert severity="info" icon={<MailOutline />} sx={{ mb: 2, borderRadius: 2 }}>
        Ces patients n&apos;ont pas de portable : ils n&apos;ont pas reçu le lien de dépôt. Le
        robot leur a demandé d&apos;envoyer l&apos;ordonnance à l&apos;adresse mail de votre
        centre. Vérifiez qu&apos;elle est bien arrivée, puis rangez la carte.
      </Alert>

      <Stack spacing={2}>
        {items.map((it) => {
          const examLabel = EXAM_LABELS[it.examType] ?? it.examType;
          const heure = formatFrTimeOnly(it.appointmentDate);
          return (
            <Card
              key={it.id}
              elevation={1}
              sx={{ borderLeft: "4px solid #3b82f6", p: { xs: 2, sm: 2.5 } }}
            >
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                justifyContent="space-between"
                alignItems={{ xs: "stretch", md: "center" }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1.5}
                    sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 1 }}
                  >
                    <MailOutline sx={{ color: "#3b82f6" }} />
                    <Typography variant="h6" fontWeight={700}>
                      {it.firstname} {it.lastname.toUpperCase()}
                    </Typography>
                  </Stack>

                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 0.5 }}
                  >
                    {toExamTypeCode(it.examType) && (
                      <ExamTypeBadge type={toExamTypeCode(it.examType)!} />
                    )}
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#1F3448" }}>
                      {examLabel}
                    </Typography>
                    <Typography variant="body2" sx={{ color: "#7A8FA6" }}>
                      ·
                    </Typography>
                    <Event sx={{ fontSize: 18, color: "#7A8FA6" }} />
                    <Typography variant="body2" sx={{ fontWeight: 600, color: "#1F3448" }}>
                      {formatFrDateOnly(it.appointmentDate)}
                    </Typography>
                    {heure && (
                      <Chip
                        size="small"
                        label={heure}
                        sx={{
                          bgcolor: "#E6F7F3",
                          color: "var(--accent-deep)",
                          fontWeight: 700,
                          fontFamily: "monospace",
                          height: 22,
                        }}
                      />
                    )}
                  </Stack>

                  {it.phone && (
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                      <Phone sx={{ fontSize: 18, color: "#7A8FA6" }} />
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: "monospace", color: "#1F3448", userSelect: "all" }}
                      >
                        {formatPhoneFr(it.phone)}
                      </Typography>
                    </Stack>
                  )}

                  <Typography variant="caption" color="text.secondary">
                    Appel du {formatFrDateShort(it.createdAt)}
                  </Typography>
                </Box>

                <Box sx={{ flexShrink: 0 }}>
                  <Button
                    variant="contained"
                    disabled={ranging.has(it.id)}
                    onClick={() => ranger(it.id)}
                    disableElevation
                    sx={{
                      bgcolor: "var(--accent)",
                      "&:hover": { bgcolor: "var(--accent-press)" },
                      minWidth: 180,
                      fontWeight: 600,
                    }}
                  >
                    {ranging.has(it.id) ? (
                      <CircularProgress size={20} sx={{ color: "#FFF" }} />
                    ) : (
                      "Ranger"
                    )}
                  </Button>
                </Box>
              </Stack>
            </Card>
          );
        })}
      </Stack>

      <Retour
        ouvert={!!snack}
        message={snack?.msg}
        gravite={snack?.kind ?? "success"}
        onFermer={() => setSnack(null)}
      />
    </>
  );
}
