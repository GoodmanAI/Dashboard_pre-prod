"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { IconRefresh } from "@tabler/icons-react";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";

/**
 * État de déploiement des briques Lyrae.
 *
 * Répond à « ce qui tourne en prod est-il ce qui est poussé ? ». Les données viennent
 * de la sonde `deploy/deployment-probe.js` (cron 15 min sur chaque VM) via
 * /api/deployments, qui dérive le statut à la lecture.
 *
 * Le cas qui justifie cette page est `restart_pending` : le `git pull` a été fait, le
 * working tree est propre, et pourtant l'ancien code tourne toujours en mémoire faute
 * de `pm2 restart`. Aucune commande git ne le montre.
 */

type Deployment = {
  service: string;
  host: string;
  branch: string | null;
  headSha: string | null;
  headSubject: string | null;
  remoteSha: string | null;
  behindCount: number;
  dirty: boolean;
  pm2Name: string | null;
  pm2Status: string | null;
  pm2StartedAt: string | null;
  probeAt: string;
  state:
    | "stale"
    | "probe_error"
    | "fetch_failed"
    | "behind"
    | "restart_pending"
    | "process_down"
    | "up_to_date";
  message: string;
};

const STATE_CHIP: Record<
  Deployment["state"],
  { label: string; color: "success" | "warning" | "error" | "info" | "default" }
> = {
  up_to_date: { label: "À jour", color: "success" },
  behind: { label: "Pull requis", color: "warning" },
  restart_pending: { label: "Restart requis", color: "warning" },
  process_down: { label: "Process arrêté", color: "error" },
  stale: { label: "Sonde muette", color: "error" },
  fetch_failed: { label: "Fetch échoué", color: "info" },
  probe_error: { label: "Sonde en erreur", color: "error" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [needsAttention, setNeedsAttention] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/deployments", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDeployments(data.deployments ?? []);
      setNeedsAttention(data.needsAttention ?? 0);
    } catch (e: any) {
      setError(e?.message || "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageContainer title="Déploiements" description="État de déploiement des briques Lyrae">
      {/* Élément racine unique : PageContainer type ses children en JSX.Element,
          or les blocs conditionnels ci-dessous peuvent valoir `false`. */}
      <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
        <Box>
          <Typography variant="h4">Déploiements</Typography>
          <Typography variant="body2" color="textSecondary">
            Ce qui tourne sur chaque VM, comparé à ce qui est poussé sur sa branche.
          </Typography>
        </Box>
        <Button startIcon={<IconRefresh size={18} />} onClick={load} disabled={loading}>
          Rafraîchir
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!loading && !error && deployments.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Aucune sonde n&apos;a encore remonté d&apos;information. Vérifier le cron
          <code> deployment-probe.js</code> sur les VMs.
        </Alert>
      )}

      {!loading && needsAttention > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {needsAttention} brique{needsAttention > 1 ? "s" : ""} nécessite
          {needsAttention > 1 ? "nt" : ""} une action.
        </Alert>
      )}

      {!loading && deployments.length > 0 && needsAttention === 0 && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Toutes les briques sont à jour.
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Brique</TableCell>
                <TableCell>Hôte</TableCell>
                <TableCell>Branche</TableCell>
                <TableCell>Commit déployé</TableCell>
                <TableCell>Dernier restart</TableCell>
                <TableCell>État</TableCell>
                <TableCell>Détail</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {deployments.map((d) => (
                <TableRow key={`${d.service}-${d.host}`} hover>
                  <TableCell>
                    <Typography variant="subtitle2">{d.service}</Typography>
                  </TableCell>
                  <TableCell>{d.host}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <code>{d.branch ?? "—"}</code>
                      {d.dirty && (
                        <Tooltip title="Le working tree de la VM contient des modifications non commitées">
                          <Chip label="modifié" size="small" color="warning" variant="outlined" />
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Tooltip title={d.headSubject ?? ""}>
                      <code>{d.headSha ?? "—"}</code>
                    </Tooltip>
                    {d.behindCount > 0 && d.remoteSha && (
                      <Typography variant="caption" color="warning.main" display="block">
                        origin : {d.remoteSha}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(d.pm2StartedAt)}</TableCell>
                  <TableCell>
                    <Chip
                      label={STATE_CHIP[d.state]?.label ?? d.state}
                      color={STATE_CHIP[d.state]?.color ?? "default"}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{d.message}</Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {deployments.length > 0 && (
        <Typography variant="caption" color="textSecondary" display="block" mt={1}>
          Dernière remontée de sonde : {formatDate(deployments[0]?.probeAt ?? null)} — les sondes
          émettent toutes les 15 min.
        </Typography>
      )}
      </Box>
    </PageContainer>
  );
}
