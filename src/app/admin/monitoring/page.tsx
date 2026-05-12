"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Box,
  Card,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import {
  IconActivity,
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconCpu,
} from "@tabler/icons-react";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";

type ServiceStatus = {
  app: string;
  lastSeen: string;
  secondsAgo: number;
  status: "alive" | "down";
  pid: number;
  uptime: number;
};

const POLL_INTERVAL_MS = 10000;

/** Formate un uptime (en secondes) en `Xj Hh Mm Ss` ou `Hh Mm Ss`. */
function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const days = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days}j ${pad(h)}h ${pad(m)}m ${pad(sec)}s`;
  return `${pad(h)}h ${pad(m)}m ${pad(sec)}s`;
}

/** Formate "vu il y a Xs/Xmin/Xh/Xj" à partir d'un delta en secondes. */
function formatLastSeen(secondsAgo: number): string {
  if (secondsAgo < 1) return "à l'instant";
  if (secondsAgo < 60) return `il y a ${secondsAgo}s`;
  const m = Math.floor(secondsAgo / 60);
  if (m < 60) return `il y a ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}

const MonitoringPage = () => {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [services, setServices] = useState<ServiceStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.replace("/authentication/signin");
    } else if (session && session.user.role !== "ADMIN") {
      router.replace("/client");
    }
  }, [session, authStatus, router]);

  // Polling toutes les 2s sur /api/heartbeat/status.
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch("/api/heartbeat/status", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ServiceStatus[] = await res.json();
        if (cancelled) return;
        setServices(data);
        setError(null);
      } catch {
        if (cancelled) return;
        setError("Impossible de joindre /api/heartbeat/status");
      }
    };

    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [authStatus]);

  // Tri : down d'abord, puis par nom alphabétique pour stabilité visuelle.
  const sorted = useMemo(() => {
    if (!services) return null;
    return [...services].sort((a, b) => {
      if (a.status !== b.status) return a.status === "down" ? -1 : 1;
      return a.app.localeCompare(b.app);
    });
  }, [services]);

  const summary = useMemo(() => {
    if (!sorted) return { total: 0, alive: 0, down: 0 };
    const alive = sorted.filter((s) => s.status === "alive").length;
    return { total: sorted.length, alive, down: sorted.length - alive };
  }, [sorted]);

  if (authStatus === "loading") {
    return (
      <Box sx={{ display: "grid", placeItems: "center", minHeight: "50vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <PageContainer
      title="Monitoring"
      description="Statut temps réel des services backend"
    >
      <Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            mb: 3,
            flexWrap: "wrap",
          }}
        >
          <Box sx={{ width: 4, height: 36, borderRadius: 2, bgcolor: "#48C8AF" }} />
          <Box sx={{ flex: 1, minWidth: 240 }}>
            <Typography variant="h5" fontWeight={800} lineHeight={1.1}>
              Monitoring
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Statut temps réel des services · seuil DOWN à 5min · refresh 10s
            </Typography>
          </Box>
          {sorted && sorted.length > 0 && (
            <Stack direction="row" spacing={1}>
              <Chip
                size="small"
                icon={<IconCheck size={14} />}
                label={`${summary.alive} alive`}
                sx={{
                  bgcolor: "rgba(34,197,94,0.15)",
                  color: "#15803d",
                  fontWeight: 700,
                  "& .MuiChip-icon": { color: "#15803d" },
                }}
              />
              <Chip
                size="small"
                icon={<IconAlertTriangle size={14} />}
                label={`${summary.down} down`}
                sx={{
                  bgcolor:
                    summary.down > 0 ? "rgba(239,68,68,0.15)" : "rgba(0,0,0,0.06)",
                  color: summary.down > 0 ? "#b91c1c" : "text.secondary",
                  fontWeight: 700,
                  "& .MuiChip-icon": {
                    color: summary.down > 0 ? "#b91c1c" : "inherit",
                  },
                }}
              />
            </Stack>
          )}
        </Box>

        {error && (
          <Card
            elevation={0}
            sx={{
              p: 2,
              mb: 2,
              bgcolor: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
            }}
          >
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          </Card>
        )}

        {!sorted ? (
          <Grid container spacing={2}>
            {[0, 1, 2].map((i) => (
              <Grid item xs={12} sm={6} md={4} key={i}>
                <Skeleton variant="rounded" height={180} />
              </Grid>
            ))}
          </Grid>
        ) : sorted.length === 0 ? (
          <Card sx={{ p: 4 }}>
            <Typography variant="body1" color="text.secondary">
              Aucun service n&apos;a encore envoyé de heartbeat.
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 1 }}
            >
              Les services apparaîtront ici dès leur premier POST sur
              {" "}
              <code>/api/heartbeat/&lt;appName&gt;</code>.
            </Typography>
          </Card>
        ) : (
          <Grid container spacing={2}>
            {sorted.map((s) => (
              <Grid item xs={12} sm={6} md={4} key={s.app}>
                <ServiceCard service={s} />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </PageContainer>
  );
};

function ServiceCard({ service }: { service: ServiceStatus }) {
  const isAlive = service.status === "alive";
  const accent = isAlive ? "#22c55e" : "#ef4444";
  const accentBg = isAlive ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)";
  const accentText = isAlive ? "#15803d" : "#b91c1c";

  return (
    <Card
      elevation={1}
      sx={{
        p: 2.5,
        height: "100%",
        borderLeft: `4px solid ${accent}`,
        transition: "box-shadow 180ms ease, transform 180ms ease",
        "&:hover": { boxShadow: "0 6px 18px rgba(0,0,0,0.08)" },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1.5,
          gap: 1,
        }}
      >
        <Typography
          variant="subtitle1"
          fontWeight={700}
          noWrap
          sx={{ minWidth: 0 }}
        >
          {service.app}
        </Typography>
        <Chip
          size="small"
          icon={
            isAlive ? <IconCheck size={12} /> : <IconAlertTriangle size={12} />
          }
          label={isAlive ? "ALIVE" : "DOWN"}
          sx={{
            bgcolor: accentBg,
            color: accentText,
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: 0.5,
            height: 22,
            "& .MuiChip-icon": { color: accentText, ml: "4px" },
          }}
        />
      </Box>

      <Divider sx={{ mb: 1.5 }} />

      <Stack spacing={1}>
        <Row
          icon={<IconActivity size={16} />}
          label="Vu"
          value={formatLastSeen(service.secondsAgo)}
          highlight={!isAlive}
        />
        <Row
          icon={<IconClock size={16} />}
          label="Uptime"
          value={formatUptime(service.uptime)}
        />
        <Row
          icon={<IconCpu size={16} />}
          label="PID"
          value={String(service.pid)}
        />
      </Stack>
    </Card>
  );
}

function Row({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Box
        sx={{
          color: "text.secondary",
          display: "flex",
          alignItems: "center",
        }}
      >
        {icon}
      </Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="body2"
        fontWeight={600}
        sx={{
          ml: "auto",
          color: highlight ? "#b91c1c" : undefined,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

export default MonitoringPage;
