import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertUserProductOwnership, requireAuth } from "@/lib/auth-helpers";
import {
  ALERT_AFTER_HOURS_MAX,
  ALERT_AFTER_HOURS_MIN,
  DEFAULT_ALERT_AFTER_HOURS,
  normalizeAlertAfterHours,
} from "@/lib/prescriptionConfig";
import { autoResolvePastAppointments } from "@/lib/prescriptionAlerts";

/**
 * GET /api/prescriptions/alerts?userProductId=X[&hoursThreshold=Y]
 *
 * Liste les ordonnances en attente d'upload depuis > Y heures pour un centre.
 * Alimente la page dashboard "Ordonnances manquantes" ou la secretaire voit
 * les patients a rappeler (pas de PDF depose, delai depasse, alerte non
 * traitee).
 *
 * Auth : session NextAuth + ownership check sur userProductId.
 *
 * Parametres :
 *   - userProductId (required) : centre concerne
 *   - hoursThreshold (optional) : borne l'age minimum en heures (borne
 *     applicative ALERT_AFTER_HOURS_MIN..MAX, meme que le champ config).
 *     Si absent, on utilise `alertAfterHours` de PrescriptionConfig du centre
 *     (defaut 48h si aucune config).
 *
 * Filtre metier :
 *   - status = 'PENDING' (le patient n'a rien upload)
 *   - alertResolvedAt IS NULL (secretaire n'a pas encore traite)
 *   - createdAt < NOW() - INTERVAL 'X hours' (X = hoursThreshold effectif)
 *
 * Effet de bord assume : avant la lecture, les alertes dont le RDV est
 * anterieur au jour courant (Europe/Paris) sont marquees traitees
 * automatiquement — elles n'ont plus d'objet une fois l'examen passe. Le
 * nombre de lignes ainsi classees est renvoye dans `autoResolvedCount` pour
 * que l'UI puisse l'annoncer. Voir `src/lib/prescriptionAlerts.ts`.
 *
 * Note : on ne s'appuie PAS sur alertRaisedAt (marker du cron d'envoi email).
 * Le filtre est purement base sur le temps ecoule depuis l'envoi du lien SMS,
 * ce qui permet au client d'ajuster dynamiquement le seuil sans dependre du
 * pas horaire du cron.
 *
 * Retourne les infos necessaires au rappel patient :
 *   - phone (en clair : usage legitime secretaire)
 *   - firstname/lastname
 *   - appointmentDate + examType
 *   - hoursSinceCreated / hoursSinceAlert pour l'urgence visuelle
 *
 * Reponse 200 :
 *   {
 *     userProductId,
 *     thresholdHours,       // le seuil effectivement applique
 *     defaultHours,         // le seuil configure du centre (utile pour init UI)
 *     autoResolvedCount,    // alertes classees auto (RDV passe) sur cet appel
 *     items: [{
 *       id, rdvId, phone, firstname, lastname,
 *       appointmentDate, examType, status,
 *       createdAt, alertRaisedAt,
 *       hoursSinceCreated, hoursSinceAlert
 *     }]
 *   }
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const param = req.nextUrl.searchParams.get("userProductId");
  const userProductId = param ? parseInt(param, 10) : NaN;
  if (!Number.isFinite(userProductId)) {
    return NextResponse.json({ error: "Missing userProductId" }, { status: 400 });
  }

  const ownErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownErr) return ownErr;

  // Config alertAfterHours (defaut si pas de PrescriptionConfig pour ce centre)
  const cfgRes = await db.query<{ alertAfterHours: number }>(
    `SELECT "alertAfterHours"
       FROM "PrescriptionConfig"
      WHERE "userProductId" = $1
      LIMIT 1`,
    [userProductId]
  );
  const defaultHours =
    cfgRes.rows.length > 0
      ? normalizeAlertAfterHours(cfgRes.rows[0].alertAfterHours)
      : DEFAULT_ALERT_AFTER_HOURS;

  // Parse et borne le hoursThreshold si fourni
  const rawThreshold = req.nextUrl.searchParams.get("hoursThreshold");
  let thresholdHours = defaultHours;
  if (rawThreshold !== null) {
    const n = Number.parseInt(rawThreshold, 10);
    if (
      Number.isFinite(n) &&
      n >= ALERT_AFTER_HOURS_MIN &&
      n <= ALERT_AFTER_HOURS_MAX
    ) {
      thresholdHours = n;
    }
    // Sinon on ignore silencieusement et on retombe sur defaultHours
    // (evite de faire echouer l'UI sur un param malforme)
  }

  // Resolution userProductId -> externalCenterCodes
  const codesRes = await db.query<{ externalCenterCode: string }>(
    `SELECT "externalCenterCode"
       FROM "ExternalCenterMapping"
      WHERE "userProductId" = $1`,
    [userProductId]
  );
  const codes = codesRes.rows.map((r) => r.externalCenterCode).filter(Boolean);
  if (codes.length === 0) {
    return NextResponse.json({
      userProductId,
      thresholdHours,
      defaultHours,
      autoResolvedCount: 0,
      items: [],
    });
  }

  // Cloture automatique des alertes dont le RDV est deja passe, AVANT la
  // lecture : la liste retournee est donc deja purgee de ces lignes.
  // Voir prescriptionAlerts.ts pour la justification metier.
  let autoResolvedCount = 0;
  try {
    autoResolvedCount = await autoResolvePastAppointments(codes);
    if (autoResolvedCount > 0) {
      // Reveille les autres onglets/sessions du centre (badge navbar, header)
      const io: any = globalThis.io;
      if (io) io.emit("prescription-alerts-updated", { userProductId });
    }
  } catch (err) {
    // Non bloquant : mieux vaut afficher la liste non purgee que planter la page
    console.error("[prescriptions/alerts] auto-resolve past appointments failed:", err);
  }

  const alertsRes = await db.query<{
    id: number;
    rdvId: string;
    phone: string;
    firstname: string;
    lastname: string;
    appointmentDate: Date | null;
    examType: string | null;
    status: string;
    createdAt: Date;
    alertRaisedAt: Date | null;
    hoursSinceCreated: string;
    hoursSinceAlert: string | null;
  }>(
    `
    SELECT "id", "rdvId", "phone", "firstname", "lastname",
           "appointmentDate", "examType", "status",
           "createdAt", "alertRaisedAt",
           EXTRACT(EPOCH FROM (NOW() - "createdAt")) / 3600 AS "hoursSinceCreated",
           CASE
             WHEN "alertRaisedAt" IS NOT NULL
             THEN EXTRACT(EPOCH FROM (NOW() - "alertRaisedAt")) / 3600
             ELSE NULL
           END AS "hoursSinceAlert"
      FROM "PrescriptionUpload"
     WHERE "externalCenterCode" = ANY($1::text[])
       AND "status" = 'PENDING'
       AND "alertResolvedAt" IS NULL
       AND "createdAt" < NOW() - ($2::int || ' hours')::interval
     ORDER BY "createdAt" ASC
     LIMIT 500
    `,
    [codes, thresholdHours]
  );

  const items = alertsRes.rows.map((r) => ({
    ...r,
    hoursSinceCreated: Math.round(Number(r.hoursSinceCreated) * 10) / 10,
    hoursSinceAlert:
      r.hoursSinceAlert !== null
        ? Math.round(Number(r.hoursSinceAlert) * 10) / 10
        : null,
  }));

  return NextResponse.json({
    userProductId,
    thresholdHours,
    defaultHours,
    autoResolvedCount,
    items,
  });
}
