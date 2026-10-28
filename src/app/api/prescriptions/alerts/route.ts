import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertUserProductOwnership, requireAuth } from "@/lib/auth-helpers";
import {
  ALERT_AFTER_HOURS_MAX,
  ALERT_AFTER_HOURS_MIN,
  canalDuParametre,
  delaiDuCanal,
} from "@/lib/prescriptionConfig";
import { autoResolvePastAppointments } from "@/lib/prescriptionAlerts";
import { sortieDeSection } from "@/lib/piecesAttendues";
import { requirePagePermission, requireAnyPagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";

/**
 * GET /api/prescriptions/alerts?userProductId=X[&hoursThreshold=Y][&section=documents][&canal=konnect]
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
 * Depuis le 11/10/2026 (documents demandes, plans/2026-10-documents-demandes.md),
 * l'alerte vit sur la PIECE attendue ("PieceAttendue"), plus sur le lien.
 * `section` choisit la liste : `ordonnances` (defaut) ou `documents`
 * (« Questionnaires et documents »). Une carte = un lien qui a au moins une
 * piece de la section encore ouverte.
 *
 * Depuis le 20/10/2026 (questionnaires en ligne,
 * plans/2026-10-questionnaires-en-ligne.md), la section `documents` montre
 * aussi, sans attendre le seuil, les liens dont un questionnaire recu porte
 * une reponse a verifier ("alertesReponses" de la piece, non classee) :
 * `reponses` en donne les libelles (« Pacemaker ou défibrillateur : oui »).
 *
 * `canal` (26/10/2026, plans/2026-10-konnect-questionnaires-centre.md) : les
 * liens de LyraeTalk (defaut) ou ceux de Konnect (`PrescriptionUpload.canal`).
 * Konnect a son droit de page (`konnect_questionnaires`) et son delai
 * (`alertAfterHoursKonnect`, 24 h par defaut).
 *
 * Filtre metier :
 *   - une piece de la section ni recue (recueAt) ni classee (alertResolvedAt)
 *   - lien non echu (status <> 'EXPIRED') ; un lien verrouille (LOCKED,
 *     trois mauvais codes) y figure : le patient ne peut plus deposer
 *   - piece creee il y a plus de X heures (X = hoursThreshold effectif)
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
 *       hoursSinceCreated, hoursSinceAlert,
 *       pieces: string[]      // libelles des pieces ouvertes de la section
 *       reponses: string[]    // section documents : reponses a verifier
 *       suivi: { statut, note, parNom, majAt } | null  // "SuiviCarte" (28/10/2026)
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

  const section = sortieDeSection(req.nextUrl.searchParams.get("section"));
  const canal = canalDuParametre(req.nextUrl.searchParams.get("canal"));

  const ownErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownErr) return ownErr;

  const droitErr = await requirePagePermission(
    canal === "konnect" ? PAGES.KONNECT_QUESTIONNAIRES : PAGES.ORDONNANCES,
    "read"
  );
  if (droitErr) return droitErr;

  // Delai du canal (defaut si pas de PrescriptionConfig pour ce centre)
  const cfgRes = await db.query<{ alertAfterHours: number; alertAfterHoursKonnect: number | null }>(
    `SELECT "alertAfterHours", "alertAfterHoursKonnect"
       FROM "PrescriptionConfig"
      WHERE "userProductId" = $1
      LIMIT 1`,
    [userProductId]
  );
  const defaultHours = delaiDuCanal(cfgRes.rows[0], canal);

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
    pieces: string[];
    reponses: string[];
    suiviStatut: string | null;
    suiviNote: string | null;
    suiviParNom: string | null;
    suiviMajAt: Date | null;
  }>(
    `
    WITH ouvertes AS (
      SELECT p."uploadId",
             MIN(p."createdAt") AS "depuis",
             array_agg(p."libelle" ORDER BY p."ordre", p."id") AS "pieces"
        FROM "PieceAttendue" p
       WHERE p."piece" = $3
         AND p."recueAt" IS NULL
         AND p."alertResolvedAt" IS NULL
       GROUP BY p."uploadId"
    ), reponses AS (
      SELECT p."uploadId",
             MIN(p."recueAt") AS "recue",
             array_agg(DISTINCT a.libelle) AS "reponses"
        FROM "PieceAttendue" p
        CROSS JOIN LATERAL jsonb_array_elements_text(p."alertesReponses") AS a(libelle)
       WHERE $3 = 'document'
         AND p."alertesReponses" IS NOT NULL
         AND p."alertResolvedAt" IS NULL
       GROUP BY p."uploadId"
    )
    SELECT pu."id", pu."rdvId", pu."phone", pu."firstname", pu."lastname",
           pu."appointmentDate", pu."examType", pu."status",
           COALESCE(o."depuis", r."recue") AS "createdAt", pu."alertRaisedAt",
           EXTRACT(EPOCH FROM (NOW() - COALESCE(o."depuis", r."recue"))) / 3600 AS "hoursSinceCreated",
           CASE
             WHEN pu."alertRaisedAt" IS NOT NULL
             THEN EXTRACT(EPOCH FROM (NOW() - pu."alertRaisedAt")) / 3600
             ELSE NULL
           END AS "hoursSinceAlert",
           COALESCE(o."pieces", '{}') AS "pieces",
           COALESCE(r."reponses", '{}') AS "reponses",
           s."statut" AS "suiviStatut", s."note" AS "suiviNote",
           s."parNom" AS "suiviParNom", s."majAt" AS "suiviMajAt"
      FROM "PrescriptionUpload" pu
      LEFT JOIN ouvertes o
        ON o."uploadId" = pu."id"
       AND o."depuis" < NOW() - ($2::int || ' hours')::interval
      LEFT JOIN reponses r ON r."uploadId" = pu."id"
      LEFT JOIN "SuiviCarte" s ON s."uploadId" = pu."id" AND s."piece" = $3
     WHERE pu."externalCenterCode" = ANY($1::text[])
       AND pu."canal" = $4
       AND pu."status" <> 'EXPIRED'
       AND (o."uploadId" IS NOT NULL OR r."uploadId" IS NOT NULL)
     ORDER BY COALESCE(o."depuis", r."recue") ASC
     LIMIT 500
    `,
    [codes, thresholdHours, section, canal]
  );

  const items = alertsRes.rows.map(
    ({ suiviStatut, suiviNote, suiviParNom, suiviMajAt, ...r }) => ({
      ...r,
      hoursSinceCreated: Math.round(Number(r.hoursSinceCreated) * 10) / 10,
      hoursSinceAlert:
        r.hoursSinceAlert !== null
          ? Math.round(Number(r.hoursSinceAlert) * 10) / 10
          : null,
      suivi: suiviStatut
        ? {
            statut: suiviStatut,
            note: suiviNote,
            parNom: suiviParNom,
            majAt: suiviMajAt,
          }
        : null,
    })
  );

  return NextResponse.json({
    userProductId,
    section: section === "document" ? "documents" : "ordonnances",
    thresholdHours,
    defaultHours,
    autoResolvedCount,
    items,
  });
}
