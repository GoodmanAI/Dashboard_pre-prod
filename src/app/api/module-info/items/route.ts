export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertUserProductOwnership, requireAuth } from "@/lib/auth-helpers";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import { slugifyQuestion, uniqueSlug } from "@/lib/moduleInfoSlug";
import { triggerAzureRebuildWebhook } from "@/lib/moduleInfoWebhook";

/**
 * CRUD interne ModuleInfoItem (chantier 2026-08-05).
 * Session auth + ownership check.
 *
 * GET  /api/module-info/items?userProductId=X -> liste items du centre
 * POST /api/module-info/items                 -> creer un nouvel item
 *
 * Chaque mutation :
 *   1. Applique le change en base
 *   2. Bump UserProduct.moduleInfoVersion
 *   3. Fire-and-forget Azure webhook
 *   4. Audit log Loki
 */

// ============================================================================
// GET /api/module-info/items?userProductId=X
// ============================================================================
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

  const items = await prisma.moduleInfoItem.findMany({
    where: { userProductId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      question: true,
      reponse: true,
      categorie: true,
      enabled: true,
      order: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const versionRow = await prisma.userProduct.findUnique({
    where: { id: userProductId },
    select: { moduleInfoVersion: true },
  });

  return NextResponse.json({
    userProductId,
    version: versionRow?.moduleInfoVersion?.toISOString() ?? null,
    items,
  });
}

// ============================================================================
// POST /api/module-info/items
// ============================================================================
const CreateSchema = z.object({
  userProductId: z.number().int().positive(),
  question: z.string().trim().min(1, "Question requise").max(2000),
  reponse: z.string().trim().min(1, "Reponse requise").max(10_000),
  categorie: z.string().trim().max(100).optional().nullable(),
  enabled: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.errors },
      { status: 400 }
    );
  }

  const { userProductId, question, reponse, categorie, enabled, order } = parsed.data;

  const ownErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownErr) return ownErr;

  // Slug lisible auto. La PK est globale a la table (pas par centre) :
  // on cherche donc les slugs GLOBALEMENT (LIKE prefixe) pour eviter les
  // collisions entre centres. Rare mais possible (ex: "urgence-sans-rdv"
  // question standard qu'on retrouve chez plusieurs clients).
  const baseSlug = slugifyQuestion(question);
  const existing = await prisma.moduleInfoItem.findMany({
    where: { id: { startsWith: baseSlug } },
    select: { id: true },
  });
  const id = uniqueSlug(baseSlug, existing.map((e) => e.id));

  // Mutation + bump version dans une transaction
  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.moduleInfoItem.create({
      data: {
        id,
        userProductId,
        question: question.trim(),
        reponse: reponse.trim(),
        categorie: categorie?.trim() || null,
        enabled: enabled ?? true,
        order: order ?? 0,
      },
    });

    const bumped = await tx.userProduct.update({
      where: { id: userProductId },
      data: { moduleInfoVersion: new Date() },
      select: { moduleInfoVersion: true },
    });

    return { created, version: bumped.moduleInfoVersion };
  });

  // Webhook Azure fire-and-forget (n'attend pas la reponse)
  triggerAzureRebuildWebhook(userProductId, result.version.toISOString());

  // Audit log
  auditLog("data", "module-info-create", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "moduleInfoItem", id: result.created.id, label: question.slice(0, 80) },
    metadata: { userProductId, categorie: categorie ?? null, enabled: enabled ?? true },
  });

  return NextResponse.json(
    { item: result.created, version: result.version.toISOString() },
    { status: 201 }
  );
}
