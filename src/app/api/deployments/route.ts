import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey, requireAuthOrApiKey, requireAdmin } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * Suivi de la dérive de déploiement des briques Lyrae.
 *
 * POST — appelé par `deploy/deployment-probe.js`, en cron toutes les 15 min sur
 *        chaque VM (lyraetalk, ai2xplore, dashboard). Auth : x-api-key
 *        (DEPLOY_PROBE_API_KEY), clé dédiée plutôt qu'ADMIN_API_KEY : la sonde
 *        n'a besoin que d'écrire son propre état.
 *
 * GET  — lu par la page /admin/deployments (session admin) et par daily-report
 *        (API key) pour la section « déploiement » du mail quotidien.
 *
 * Table alimentée : "DeploymentStatus" (SQL manuel, hors schema.prisma — voir
 * prisma/migrations/manual/2026_08_10_deployment_status.sql). Accès via le pool
 * `pg`, comme toutes les tables hors Prisma de ce repo.
 */

/** Sans nouvelle du cron pendant 1 h (4 cycles manqués), la ligne n'est plus fiable. */
const STALE_MS = 60 * 60 * 1000;

type ProbeRepo = {
  service?: unknown;
  repoPath?: unknown;
  branch?: unknown;
  headSha?: unknown;
  headSubject?: unknown;
  headCommittedAt?: unknown;
  headUpdatedAt?: unknown;
  remoteSha?: unknown;
  behindCount?: unknown;
  dirty?: unknown;
  fetchOk?: unknown;
  error?: unknown;
  pm2?: { name?: unknown; status?: unknown; startedAt?: unknown; restarts?: unknown } | null;
};

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;
const int = (v: unknown): number | null => (Number.isFinite(Number(v)) ? Number(v) : null);

export async function POST(req: NextRequest) {
  const keyErr = requireApiKey(req, "DEPLOY_PROBE_API_KEY");
  if (keyErr) return keyErr;

  let body: { host?: unknown; probedAt?: unknown; repos?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const host = str(body.host);
  if (!host) return NextResponse.json({ error: "host requis" }, { status: 400 });
  if (!Array.isArray(body.repos)) {
    return NextResponse.json({ error: "repos[] requis" }, { status: 400 });
  }

  // probedAt vient de la VM : une horloge décalée fausserait le calcul de fraîcheur.
  // On garde la valeur envoyée seulement si elle est parsable, sinon l'heure serveur.
  const probedAtRaw = str(body.probedAt);
  const probedAt =
    probedAtRaw && !Number.isNaN(Date.parse(probedAtRaw))
      ? new Date(probedAtRaw).toISOString()
      : new Date().toISOString();

  let written = 0;
  for (const raw of body.repos as ProbeRepo[]) {
    const service = str(raw?.service);
    if (!service) continue; // ligne inexploitable : on ignore plutôt que d'échouer tout le lot

    await db.query(
      `INSERT INTO "DeploymentStatus" (
         "service", "host", "repoPath", "branch", "headSha", "headSubject",
         "headCommittedAt", "headUpdatedAt", "remoteSha", "behindCount", "dirty",
         "fetchOk", "pm2Name", "pm2Status", "pm2StartedAt", "pm2Restarts",
         "probeError", "probeAt"
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT ("service", "host") DO UPDATE SET
         "repoPath"        = EXCLUDED."repoPath",
         "branch"          = EXCLUDED."branch",
         "headSha"         = EXCLUDED."headSha",
         "headSubject"     = EXCLUDED."headSubject",
         "headCommittedAt" = EXCLUDED."headCommittedAt",
         "headUpdatedAt"   = EXCLUDED."headUpdatedAt",
         "remoteSha"       = EXCLUDED."remoteSha",
         "behindCount"     = EXCLUDED."behindCount",
         "dirty"           = EXCLUDED."dirty",
         "fetchOk"         = EXCLUDED."fetchOk",
         "pm2Name"         = EXCLUDED."pm2Name",
         "pm2Status"       = EXCLUDED."pm2Status",
         "pm2StartedAt"    = EXCLUDED."pm2StartedAt",
         "pm2Restarts"     = EXCLUDED."pm2Restarts",
         "probeError"      = EXCLUDED."probeError",
         "probeAt"         = EXCLUDED."probeAt"`,
      [
        service,
        host,
        str(raw?.repoPath),
        str(raw?.branch),
        str(raw?.headSha),
        str(raw?.headSubject),
        str(raw?.headCommittedAt),
        str(raw?.headUpdatedAt),
        str(raw?.remoteSha),
        int(raw?.behindCount) ?? 0,
        raw?.dirty === true,
        raw?.fetchOk !== false,
        str(raw?.pm2?.name),
        str(raw?.pm2?.status),
        str(raw?.pm2?.startedAt),
        int(raw?.pm2?.restarts),
        str(raw?.error),
        probedAt,
      ]
    );
    written++;
  }

  return NextResponse.json({ ok: true, written });
}

type Row = {
  service: string;
  host: string;
  repoPath: string | null;
  branch: string | null;
  headSha: string | null;
  headSubject: string | null;
  headCommittedAt: Date | null;
  headUpdatedAt: Date | null;
  remoteSha: string | null;
  behindCount: number;
  dirty: boolean;
  fetchOk: boolean;
  pm2Name: string | null;
  pm2Status: string | null;
  pm2StartedAt: Date | null;
  pm2Restarts: number | null;
  probeError: string | null;
  probeAt: Date;
};

export type DeploymentState =
  | "stale"
  | "probe_error"
  | "fetch_failed"
  | "behind"
  | "restart_pending"
  | "process_down"
  | "up_to_date";

/**
 * Le statut est dérivé à la lecture, jamais stocké : il dépend de l'heure qu'il est.
 * Une sonde muette depuis deux heures devient « stale » sans qu'aucune écriture n'ait
 * eu lieu — le stocker obligerait à le recalculer en permanence.
 *
 * L'ordre des tests va du plus bloquant au plus fin : inutile d'annoncer un retard de
 * commits si la donnée elle-même est périmée ou si le fetch n'a pas abouti.
 */
function deriveState(row: Row, now: number): DeploymentState {
  if (now - new Date(row.probeAt).getTime() > STALE_MS) return "stale";
  if (row.probeError) return "probe_error";
  if (!row.fetchOk) return "fetch_failed";
  if (row.behindCount > 0) return "behind";
  if (row.pm2Name && row.pm2Status && row.pm2Status !== "online") return "process_down";

  // Le disque est à jour : reste à savoir si le process a été relancé DEPUIS.
  // On compare au reflog (date réelle du pull) et non à la date du commit — sinon
  // déployer un commit ancien passerait pour « déjà à jour ». Repli sur la date du
  // commit quand le reflog est absent.
  const diskChangedAt = row.headUpdatedAt ?? row.headCommittedAt;
  if (row.pm2StartedAt && diskChangedAt) {
    if (new Date(row.pm2StartedAt).getTime() < new Date(diskChangedAt).getTime()) {
      return "restart_pending";
    }
  }
  return "up_to_date";
}

/** Phrase prête à afficher — même texte dans la page et dans le mail quotidien. */
function describe(row: Row, state: DeploymentState): string {
  switch (state) {
    case "stale":
      return `Aucune nouvelle de la sonde depuis ${new Date(row.probeAt).toLocaleString("fr-FR")} — VM éteinte, cron cassé ou réseau coupé.`;
    case "probe_error":
      return `Sonde en erreur : ${row.probeError}.`;
    case "fetch_failed":
      return "Le git fetch a échoué sur la VM : le retard affiché n'est pas fiable.";
    case "behind":
      return `${row.behindCount} commit${row.behindCount > 1 ? "s" : ""} de retard sur ${row.branch} — pensez à pull + restart sur la prod.`;
    case "process_down":
      return `Process PM2 « ${row.pm2Name} » en état ${row.pm2Status}.`;
    case "restart_pending":
      return "Code à jour sur le disque mais process jamais relancé depuis — pm2 restart requis.";
    case "up_to_date":
      return "À jour.";
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, "DEPLOY_PROBE_API_KEY");
  if (auth.error) return auth.error;
  if (!auth.bot) {
    const adminErr = requireAdmin(auth.session);
    if (adminErr) return adminErr;
  }

  const { rows } = await db.query<Row>(
    `SELECT "service", "host", "repoPath", "branch", "headSha", "headSubject",
            "headCommittedAt", "headUpdatedAt", "remoteSha", "behindCount", "dirty",
            "fetchOk", "pm2Name", "pm2Status", "pm2StartedAt", "pm2Restarts",
            "probeError", "probeAt"
       FROM "DeploymentStatus"
      ORDER BY "service", "host"`
  );

  const now = Date.now();
  const deployments = rows.map((row) => {
    const state = deriveState(row, now);
    return {
      ...row,
      headSha: row.headSha ? row.headSha.slice(0, 7) : null,
      remoteSha: row.remoteSha ? row.remoteSha.slice(0, 7) : null,
      state,
      message: describe(row, state),
    };
  });

  return NextResponse.json({
    deployments,
    // Compté ici plutôt que côté page : le mail quotidien a besoin du même verdict.
    needsAttention: deployments.filter((d) => d.state !== "up_to_date").length,
    checkedAt: new Date(now).toISOString(),
  });
}
