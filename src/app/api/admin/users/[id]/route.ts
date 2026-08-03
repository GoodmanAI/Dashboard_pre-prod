export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireSuperAdmin } from "@/lib/auth-helpers";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";

/**
 * Detail / update / delete d'un user (chantier 3, Lot C).
 * -----------------------------------------------------------------------------
 * GET    /api/admin/users/:id -> detail complet (SUPER_ADMIN)
 * PATCH  /api/admin/users/:id -> update champs (name, permissions, isSecretary)
 *                                 (SUPER_ADMIN, jamais le mot de passe ici)
 * DELETE /api/admin/users/:id -> suppression (SUPER_ADMIN, jamais soi-meme)
 *
 * Le kick (revocation JWT) est dans /api/admin/users/:id/kick.
 * Le reset password est dans /api/admin/reset-password (existant, etendu).
 */

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  isSecretary: z.boolean().optional(),
  permissions: z
    .union([
      z.null(),
      z.record(z.enum(["none", "read", "write"])),
    ])
    .optional(),
  managerId: z.union([z.null(), z.number().int().positive()]).optional(),
});

// ============================================================================
// GET
// ============================================================================
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const superErr = requireSuperAdmin(auth.session);
  if (superErr) return superErr;

  const userId = parseInt(params.id, 10);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      centreRole: true,
      isSecretary: true,
      permissions: true,
      managerId: true,
      manager: { select: { id: true, name: true, email: true } },
      managedUsers: {
        select: { id: true, name: true, email: true, role: true },
      },
      tokenVersion: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      createdAt: true,
      updatedAt: true,
      userProducts: {
        where: { removedAt: null },
        select: {
          id: true,
          productId: true,
          product: { select: { name: true } },
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ user });
}

// ============================================================================
// PATCH
// ============================================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const superErr = requireSuperAdmin(auth.session);
  if (superErr) return superErr;

  const userId = parseInt(params.id, 10);
  if (!Number.isFinite(userId)) {
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
      {
        error: "Echec de la validation",
        details: parsed.error.errors,
      },
      { status: 400 }
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { error: "Aucun champ a mettre a jour" },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, role: true, name: true,
      permissions: true, isSecretary: true, managerId: true,
      tokenVersion: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updateData: any = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.isSecretary !== undefined) updateData.isSecretary = parsed.data.isSecretary;
  if (parsed.data.permissions !== undefined) updateData.permissions = parsed.data.permissions;
  if (parsed.data.managerId !== undefined) updateData.managerId = parsed.data.managerId;

  // Change de permissions ou managerId -> on bump tokenVersion pour forcer
  // la re-hydratation cote client (le JWT contient permissions, on veut que
  // les nouveaux droits prennent effet immediatement).
  const shouldBumpToken =
    parsed.data.permissions !== undefined ||
    parsed.data.managerId !== undefined ||
    parsed.data.isSecretary !== undefined;
  if (shouldBumpToken) {
    updateData.tokenVersion = { increment: 1 };
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true, name: true, email: true, role: true,
      isSecretary: true, permissions: true, managerId: true,
      tokenVersion: true, updatedAt: true,
    },
  });

  const ip = extractIpFromRequest(req);
  const userAgent = extractUserAgent(req);
  auditLog("account", "update-user", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip,
      userAgent,
    },
    target: { type: "user", id: userId, label: existing.email },
    metadata: {
      changes: parsed.data,
      previous: {
        name: existing.name,
        permissions: existing.permissions,
        isSecretary: existing.isSecretary,
        managerId: existing.managerId,
      },
      tokenBumped: shouldBumpToken,
    },
  });

  return NextResponse.json({ user: updated });
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
  const superErr = requireSuperAdmin(auth.session);
  if (superErr) return superErr;

  const userId = parseInt(params.id, 10);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  if (userId === auth.session.user.id) {
    return NextResponse.json(
      { error: "Impossible de supprimer votre propre compte." },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Bloque la suppression du dernier SUPER_ADMIN pour ne pas se locker out
  if (existing.role === "SUPER_ADMIN") {
    const superAdminCount = await prisma.user.count({ where: { role: "SUPER_ADMIN" } });
    if (superAdminCount <= 1) {
      return NextResponse.json(
        { error: "Impossible de supprimer le dernier SUPER_ADMIN." },
        { status: 400 }
      );
    }
  }

  await prisma.user.delete({ where: { id: userId } });

  const ip = extractIpFromRequest(req);
  const userAgent = extractUserAgent(req);
  auditLog("account", "delete-user", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip,
      userAgent,
    },
    target: { type: "user", id: userId, label: existing.email },
    metadata: { role: existing.role, name: existing.name },
  });

  return NextResponse.json({ deleted: true });
}
