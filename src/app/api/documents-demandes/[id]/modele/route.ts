export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  assertUserProductOwnership,
  requireAdmin,
  requireAuth,
} from "@/lib/auth-helpers";
import { requirePagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import { MAX_MODELE_OCTETS } from "@/lib/piecesAttendues";
import { proprietaireDocument } from "@/lib/documentsDemandesApi";

/**
 * /api/documents-demandes/[id]/modele
 *
 * Le PDF vierge d'un document demande, fourni par le centre et depose par
 * l'equipe Lyrae. Stocke en base (comme le logo Konnect), 5 Mo au plus, PDF
 * seulement.
 *
 * GET    : session, proprietaire ou admin. Le client relit le modele que ses
 *          patients telechargeront.
 * PUT    : ADMIN, multipart `fichier`. Remplace le modele : la nouvelle
 *          version vaut aussi pour les liens deja envoyes.
 * DELETE : ADMIN. Le document reste demande, sans modele a telecharger.
 *
 * Le patient, lui, passe par /api/prescriptions/[token]/modele/[pieceId].
 */

async function cible(
  params: { id: string },
  admin: boolean
): Promise<{ id: number; userProductId: number; session: any } | { error: NextResponse }> {
  const auth = await requireAuth();
  if (auth.error) return { error: auth.error };
  if (admin) {
    const adminErr = requireAdmin(auth.session);
    if (adminErr) return { error: adminErr };
  }
  const id = Number(params.id);
  const userProductId = Number.isInteger(id) ? await proprietaireDocument(id) : null;
  if (userProductId === null) {
    return { error: NextResponse.json({ error: "Document introuvable" }, { status: 404 }) };
  }
  const ownErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownErr) return { error: ownErr };
  return { id, userProductId, session: auth.session };
}

function acteur(req: NextRequest, session: any) {
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    role: session.user.role,
    ip: extractIpFromRequest(req),
    userAgent: extractUserAgent(req),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const c = await cible(params, false);
  if ("error" in c) return c.error;
  const droitErr = await requirePagePermission(PAGES.PARAMETRAGE, "read");
  if (droitErr) return droitErr;

  const res = await db.query<{
    modeleContenu: Buffer | null;
    modeleType: string | null;
    modeleNom: string | null;
  }>(
    `SELECT "modeleContenu", "modeleType", "modeleNom"
       FROM "DocumentDemande" WHERE "id" = $1`,
    [c.id]
  );
  const row = res.rows[0];
  if (!row?.modeleContenu) {
    return NextResponse.json({ error: "Aucun modèle déposé" }, { status: 404 });
  }
  const nom = (row.modeleNom || "modele.pdf").replace(/[^\w.\- ]/g, "_");
  return new NextResponse(new Uint8Array(row.modeleContenu), {
    headers: {
      "Content-Type": row.modeleType || "application/pdf",
      "Content-Disposition": `inline; filename="${nom}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const c = await cible(params, true);
  if ("error" in c) return c.error;

  const formData = await req.formData().catch(() => null);
  const fichier = formData?.get("fichier");
  if (!formData || !(fichier instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }
  if (fichier.size === 0) {
    return NextResponse.json({ error: "Le fichier est vide." }, { status: 400 });
  }
  if (fichier.size > MAX_MODELE_OCTETS) {
    return NextResponse.json(
      { error: "Fichier trop lourd. La limite est de 5 Mo." },
      { status: 400 }
    );
  }
  const contenu = Buffer.from(await fichier.arrayBuffer());
  // Le type annonce par le navigateur ne suffit pas : on lit l'en-tete du PDF.
  if (contenu.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return NextResponse.json(
      { error: "Ce fichier n'est pas un PDF. Déposez le questionnaire du centre en PDF." },
      { status: 400 }
    );
  }
  const nom = fichier.name.slice(0, 200);

  await db.query(
    `UPDATE "DocumentDemande"
        SET "modeleContenu" = $2, "modeleType" = 'application/pdf',
            "modeleNom" = $3, "modeleMaj" = NOW(), "updatedAt" = NOW()
      WHERE "id" = $1`,
    [c.id, contenu, nom]
  );

  auditLog("data", "document-demande-modele-depot", {
    actor: acteur(req, c.session),
    target: { type: "userProduct", id: c.userProductId },
    metadata: { documentDemandeId: c.id, octets: fichier.size },
  });

  return NextResponse.json({ ok: true, nom, octets: fichier.size });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const c = await cible(params, true);
  if ("error" in c) return c.error;

  await db.query(
    `UPDATE "DocumentDemande"
        SET "modeleContenu" = NULL, "modeleType" = NULL, "modeleNom" = NULL,
            "modeleMaj" = NOW(), "updatedAt" = NOW()
      WHERE "id" = $1`,
    [c.id]
  );

  auditLog("data", "document-demande-modele-retrait", {
    actor: acteur(req, c.session),
    target: { type: "userProduct", id: c.userProductId },
    metadata: { documentDemandeId: c.id },
  });

  return NextResponse.json({ ok: true });
}
