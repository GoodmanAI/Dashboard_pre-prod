export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertUserProductOwnership, requireAuth } from "@/lib/auth-helpers";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import { triggerAzureRebuildWebhook } from "@/lib/moduleInfoWebhook";

/**
 * PATCH  /api/module-info/items/[id] -> modif partielle
 * DELETE /api/module-info/items/[id] -> suppression
 *
 * Session auth + ownership check (via userProductId de l'item).
 * Chaque mutation : bump version + webhook Azure fire-and-forget + audit log.
 */

const PatchSchema = z.object({
  question: z.string().trim().min(1).max(2000).optional(),
  reponse: z.string().trim().min(1).max(10_000).optional(),
  categorie: z.string().trim().max(100).nullable().optional(),
  enabled: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});

// ============================================================================
// PATCH
// ============================================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const id = params.id;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.errors },
      { status: 400 }
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Aucun champ a mettre a jour" }, { status: 400 });
  }

  const existing = await prisma.moduleInfoItem.findUnique({
    where: { id },
    select: { id: true, userProductId: true, question: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ownErr = await assertUserProductOwnership(auth.session, existing.userProductId);
  if (ownErr) return ownErr;

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.moduleInfoItem.update({
      where: { id },
      data: {
        ...(parsed.data.question !== undefined && { question: parsed.data.question.trim() }),
        ...(parsed.data.reponse !== undefined && { reponse: parsed.data.reponse.trim() }),
        ...(parsed.data.categorie !== undefined && {
          categorie: parsed.data.categorie?.trim() || null,
        }),
        ...(parsed.data.enabled !== undefined && { enabled: parsed.data.enabled }),
        ...(parsed.data.order !== undefined && { order: parsed.data.order }),
      },
    });

    const bumped = await tx.userProduct.update({
      where: { id: existing.userProductId },
      data: { moduleInfoVersion: new Date() },
      select: { moduleInfoVersion: true },
    });

    return { updated, version: bumped.moduleInfoVersion };
  });

  triggerAzureRebuildWebhook(existing.userProductId, result.version.toISOString());

  auditLog("data", "module-info-update", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "moduleInfoItem", id, label: existing.question.slice(0, 80) },
    metadata: { userProductId: existing.userProductId, changes: parsed.data },
  });

  return NextResponse.json({ item: result.updated, version: result.version.toISOString() });
}

// ============================================================================
// DELETE
// ============================================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const id = params.id;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const existing = await prisma.moduleInfoItem.findUnique({
    where: { id },
    select: { id: true, userProductId: true, question: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ownErr = await assertUserProductOwnership(auth.session, existing.userProductId);
  if (ownErr) return ownErr;

  const result = await prisma.$transaction(async (tx) => {
    await tx.moduleInfoItem.delete({ where: { id } });
    const bumped = await tx.userProduct.update({
      where: { id: existing.userProductId },
      data: { moduleInfoVersion: new Date() },
      select: { moduleInfoVersion: true },
    });
    return { version: bumped.moduleInfoVersion };
  });

  triggerAzureRebuildWebhook(existing.userProductId, result.version.toISOString());

  auditLog("data", "module-info-delete", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "moduleInfoItem", id, label: existing.question.slice(0, 80) },
    metadata: { userProductId: existing.userProductId },
  });

  return NextResponse.json({ deleted: true, version: result.version.toISOString() });
}
