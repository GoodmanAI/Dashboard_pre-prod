"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  IconRefresh,
  IconCircleCheck,
  IconAlertTriangle,
  IconDownload,
  IconReload,
  IconPlugConnectedX,
  IconServerOff,
  IconGitBranch,
} from "@tabler/icons-react";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";

/**
 * État de déploiement des briques Lyrae.
 *
 * Répond d'un coup d'œil à « ce qui tourne en prod est-il ce qui est poussé ? ».
 * Les données viennent des sondes `deploy/deployment-probe.js` (cron 15 min sur
 * chaque VM) via /api/deployments, qui dérive l'état à la lecture.
 *
 * La page est conçue pour être lue en trois secondes : la bande de couleur à
 * gauche de chaque carte porte l'information, le texte ne fait que la préciser.
 * Le cas qui justifie tout ça est `restart_pending` — `git pull` fait, working
 * tree propre, et pourtant l'ancien code tourne encore en mémoire.
 */

type DeploymentState =
  | "stale"
  | "probe_error"
  | "fetch_failed"
  | "behind"
  | "restart_pending"
  | "process_down"
  | "up_to_date";

type Deployment = {
  service: string;
  host: string;
  repoPath: string | null;
  branch: string | null;
  headSha: string | null;
  headSubject: string | null;
  remoteSha: string | null;
  behindCount: number;
  dirty: boolean;
  fetchOk: boolean;
  pm2Name: string | null;
  pm2Status: string | null;
  pm2StartedAt: string | null;
  pm2Restarts: number | null;
  probeError: string | null;
  probeAt: string;
  state: DeploymentState;
  message: string;
};

/** Rafraîchissement auto : les sondes émettent toutes les 15 min, 60 s suffit largement. */
const AUTO_REFRESH_MS = 60_000;

const STATE_META: Record<
  DeploymentState,
  { label: string; color: "success" | "warning" | "error" | "info"; icon: React.ElementType; action: string | null }
> = {
  up_to_date: { label: "À jour", color: "success", icon: IconCircleCheck, action: null },
  behind: { label: "Pull requis", color: "warning", icon: IconDownload, action: "git pull" },
  restart_pending: { label: "Restart requis", color: "warning", icon: IconReload, action: "pm2 restart" },
  process_down: { label: "Process arrêté", color: "error", icon: IconServerOff, action: "pm2 start" },
  stale: { label: "Sonde muette", color: "error", icon: IconPlugConnectedX, action: "vérifier le cron" },
  probe_error: { label: "Sonde en erreur", color: "error", icon: IconAlertTriangle, action: "voir le détail" },
  fetch_failed: { label: "Fetch échoué", color: "info", icon: IconAlertTriangle, action: "vérifier le réseau" },
};

/** "il y a 5 min" — plus parlant qu'un horodatage pour juger de la fraîcheur. */
function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return "à l'instant";
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

function StatTile({
  value,
  label,
  color,
}: {
  value: number | string;
  label: string;
  color: "success" | "warning" | "text";
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
      <Typography
        variant="h3"
        sx={{ color: color === "text" ? "text.primary" : `${color}.main`, lineHeight: 1.1 }}
      >
        {value}
      </Typography>
      <Typography variant="body2" color="textSecondary">
        {label}
      </Typography>
    </Paper>
  );
}

function DeploymentCard({ d }: { d: Deployment }) {
  const meta = STATE_META[d.state] ?? STATE_META.probe_error;
  const Icon = meta.icon;

  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        // La bande de couleur porte l'état : c'est elle qu'on lit en premier.
        borderLeft: 6,
        borderLeftColor: `${meta.color}.main`,
      }}
    >
      <CardContent>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" noWrap>
              {d.service}
            </Typography>
            <Typography variant="caption" color="textSecondary" noWrap display="block">
              {d.host}
            </Typography>
          </Box>
          <Chip
            size="small"
            color={meta.color}
            icon={<Icon size={15} />}
            label={meta.label}
            sx={{ flexShrink: 0 }}
          />
        </Stack>

        {/* Le retard de commits est l'information la plus actionnable : on la sort du texte. */}
        {d.behindCount > 0 && (
          <Box sx={{ mt: 1.5, mb: 0.5 }}>
            <Typography variant="h4" color="warning.main" component="span">
              {d.behindCount}
            </Typography>
            <Typography variant="body2" color="warning.main" component="span" sx={{ ml: 0.75 }}>
              commit{d.behindCount > 1 ? "s" : ""} non déployé{d.behindCount > 1 ? "s" : ""}
            </Typography>
          </Box>
        )}

        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 1.5 }}>
          <IconGitBranch size={15} />
          <Typography variant="body2" component="code">
            {d.branch ?? "—"}
          </Typography>
          <Tooltip title={d.headSubject ?? ""}>
            <Typography variant="body2" component="code" color="textSecondary">
              {d.headSha ?? "—"}
            </Typography>
          </Tooltip>
          {d.dirty && (
            <Tooltip title="Des modifications non commitées existent sur la VM. Elles peuvent faire échouer le prochain git pull.">
              <Chip label="modifié" size="small" variant="outlined" color="warning" />
            </Tooltip>
          )}
        </Stack>

        <Divider sx={{ my: 1.5 }} />

        <Typography variant="body2" sx={{ mb: 1.5 }}>
          {d.message}
        </Typography>

        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          <Tooltip title={d.pm2Name ? `Process PM2 « ${d.pm2Name} »` : "Aucun process PM2 sur cette VM"}>
            <Typography variant="caption" color="textSecondary">
              Restart : <strong>{d.pm2Name ? timeAgo(d.pm2StartedAt) : "sans objet"}</strong>
            </Typography>
          </Tooltip>
          <Typography variant="caption" color="textSecondary">
            Sonde : <strong>{timeAgo(d.probeAt)}</strong>
          </Typography>
          {meta.action && (
            <Typography variant="caption" color={`${meta.color}.main`}>
              → <code>{meta.action}</code>
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [needsAttention, setNeedsAttention] = useState(0);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/deployments", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDeployments(data.deployments ?? []);
      setNeedsAttention(data.needsAttention ?? 0);
      setCheckedAt(data.checkedAt ?? null);
    } catch (e: any) {
      setError(e?.message || "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Silencieux : ne pas faire clignoter la page toutes les minutes.
    const t = setInterval(() => load(true), AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  // Les briques qui demandent une action passent devant.
  const sorted = [...deployments].sort((a, b) => {
    const rank = (d: Deployment) => (d.state === "up_to_date" ? 1 : 0);
    return rank(a) - rank(b) || a.service.localeCompare(b.service);
  });
  const okCount = deployments.length - needsAttention;

  return (
    <PageContainer title="Déploiements" description="État de déploiement des briques Lyrae">
      {/* Élément racine unique : PageContainer type ses children en JSX.Element. */}
      <Box>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" mb={3} spacing={2}>
          <Box>
            <Typography variant="h4">Déploiements</Typography>
            <Typography variant="body2" color="textSecondary">
              Ce qui tourne sur chaque VM, comparé à ce qui est poussé sur sa branche.
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<IconRefresh size={18} />}
            onClick={() => load()}
            disabled={loading}
            sx={{ flexShrink: 0 }}
          >
            Rafraîchir
          </Button>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {loading && deployments.length === 0 ? (
          <Box display="flex" justifyContent="center" py={8}>
            <CircularProgress />
          </Box>
        ) : deployments.length === 0 ? (
          <Alert severity="info">
            Aucune sonde n&apos;a encore remonté d&apos;information. Vérifier le cron{" "}
            <code>deployment-probe.js</code> sur les VMs.
          </Alert>
        ) : (
          <Box>
            <Grid container spacing={2} mb={3}>
              <Grid item xs={6} md={3}>
                <StatTile value={okCount} label="brique(s) à jour" color="success" />
              </Grid>
              <Grid item xs={6} md={3}>
                <StatTile
                  value={needsAttention}
                  label="à traiter"
                  color={needsAttention > 0 ? "warning" : "success"}
                />
              </Grid>
              <Grid item xs={6} md={3}>
                <StatTile
                  value={deployments.reduce((n, d) => n + (d.behindCount || 0), 0)}
                  label="commit(s) non déployé(s)"
                  color="text"
                />
              </Grid>
              <Grid item xs={6} md={3}>
                <StatTile value={deployments.length} label="brique(s) sondée(s)" color="text" />
              </Grid>
            </Grid>

            {needsAttention === 0 && (
              <Alert severity="success" icon={<IconCircleCheck size={20} />} sx={{ mb: 3 }}>
                Toutes les briques tournent bien le code poussé sur leur branche.
              </Alert>
            )}

            <Grid container spacing={2}>
              {sorted.map((d) => (
                <Grid item xs={12} md={6} lg={4} key={`${d.service}-${d.host}`}>
                  <DeploymentCard d={d} />
                </Grid>
              ))}
            </Grid>

            <Typography variant="caption" color="textSecondary" display="block" mt={3}>
              Les sondes émettent toutes les 15 min ; cette page se rafraîchit chaque minute.
              Dernière lecture {timeAgo(checkedAt)}. Une brique absente de cette liste n&apos;est pas
              « à jour » — c&apos;est que sa sonde n&apos;a jamais émis.
            </Typography>
          </Box>
        )}
      </Box>
    </PageContainer>
  );
}
