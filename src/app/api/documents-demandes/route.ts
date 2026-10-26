export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  assertUserProductOwnership,
  requireAdmin,
  requireAuth,
} from "@/lib/auth-helpers";
import { requireAnyPagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import { normaliserTypesExamen } from "@/lib/piecesAttendues";
import { libelleValide, lireDocumentsDemandes } from "@/lib/documentsDemandesApi";

/**
 * /api/documents-demandes
 *
 * Documents qu'un client demande au patient en plus de l'ordonnance
 * (questionnaire IRM, questionnaire mineur...). Plan workspace
 * plans/2026-10-documents-demandes.md, DECISIONS.md du 11/10/2026.
 *
 * GET  ?userProductId=X[&archives=1] : session, proprietaire ou admin, droit
 *      de lecture du parametrage de LyraeTalk ou de Konnect (la carte vit dans
 *      les deux, 26/10/2026). Jamais le contenu du modele.
 * POST { userProductId, libelle, typesExamen, mineursSeulement,
 *        grossesseSeulement } : ADMIN seulement. Les deux criteres s'excluent
 *      (plans/2026-10-attestation-grossesse.md). Le document nait « non disponible » : c'est le client qui
 *      le met a disposition.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const userProductId = Number(req.nextUrl.searchParams.get("userProductId"));
  const ownErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownErr) return ownErr;

  const droitErr = await requireAnyPagePermission(
    [PAGES.PARAMETRAGE, PAGES.KONNECT_PARAMETRAGE],
    "read"
  );
  if (droitErr) return droitErr;

  const archives = req.nextUrl.searchParams.get("archives") === "1";
  return NextResponse.json({
    items: await lireDocumentsDemandes(userProductId, archives),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  const body = await req.json().catch(() => null);
  const userProductId = Number(body?.userProductId);
  const ownErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownErr) return ownErr;

  const libelle = libelleValide(body?.libelle);
  if (!libelle) {
    return NextResponse.json(
      { error: "Donnez un nom au document, par exemple « Questionnaire IRM »." },
      { status: 400 }
    );
  }
  const typesExamen = normaliserTypesExamen(body?.typesExamen);
  if (typesExamen.length === 0) {
    return NextResponse.json(
      { error: "Cochez au moins un type d'examen." },
      { status: 400 }
    );
  }

  const mineursSeulement = body?.mineursSeulement === true;
  const grossesseSeulement = body?.grossesseSeulement === true;
  if (mineursSeulement && grossesseSeulement) {
    return NextResponse.json(
      { error: "Un document vaut pour les mineurs ou pour les femmes de 12 à 55 ans, pas les deux. Créez deux documents." },
      { status: 400 }
    );
  }

  const res = await db.query<{ id: number }>(
    `INSERT INTO "DocumentDemande"
       ("userProductId", "libelle", "typesExamen", "mineursSeulement", "grossesseSeulement", "ordre")
     VALUES ($1, $2, $3::jsonb, $4, $5,
             (SELECT COALESCE(MAX("ordre"), 0) + 1 FROM "DocumentDemande" WHERE "userProductId" = $1))
     RETURNING "id"`,
    [userProductId, libelle, JSON.stringify(typesExamen), mineursSeulement, grossesseSeulement]
  );

  auditLog("data", "document-demande-creation", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "userProduct", id: userProductId },
    metadata: { documentDemandeId: res.rows[0].id, typesExamen },
  });

  return NextResponse.json({ id: res.rows[0].id }, { status: 201 });
}
