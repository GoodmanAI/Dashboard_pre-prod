export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireSuperAdmin } from "@/lib/auth-helpers";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import { passwordSchema } from "@/lib/passwordSchema";

/**
 * Gestion unifiee des comptes (chantier 3, Lot C).
 * -----------------------------------------------------------------------------
 * GET  /api/admin/users               -> liste tous les comptes (SUPER_ADMIN)
 *   ?role=ADMIN|CLIENT                -> filtre par role
 *   ?managerId=<id>                   -> filtre les sous-comptes d'un CLIENT
 *
 * POST /api/admin/users               -> creation compte (SUPER_ADMIN)
 *   body : { mode: "admin" | "sub-account", email, password, name,
 *            managerId?, permissions? }
 *   - mode "admin"        : cree un ADMIN (simple : email+pwd+name)
 *   - mode "sub-account"  : cree un CLIENT sous-compte, obligatoire :
 *                           managerId (compte parent CLIENT) + permissions JSON
 *
 * Pour creer un CLIENT PRINCIPAL, utiliser /api/admin/create-client (endpoint
 * dedie qui bootstrap tous les UserProduct + fichiers CSV).
 */

const CreateAdminSchema = z.object({
  mode: z.literal("admin"),
  email: z
    .string()
    .min(3)
    .transform((v) => v.trim().toLowerCase()),
  password: passwordSchema,
  name: z.string().min(1),
});

const CreateSubAccountSchema = z.object({
  mode: z.literal("sub-account"),
  email: z
    .string()
    .min(3)
    .transform((v) => v.trim().toLowerCase()),
  password: passwordSchema,
  name: z.string().min(1),
  managerId: z.number().int().positive(),
  permissions: z.record(z.enum(["none", "read", "write"])),
});

const CreateBodySchema = z.union([CreateAdminSchema, CreateSubAccountSchema]);

// ============================================================================
// GET /api/admin/users
// ============================================================================
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const superErr = requireSuperAdmin(auth.session);
  if (superErr) return superErr;

  const { searchParams } = req.nextUrl;
  const roleFilter = searchParams.get("role");
  const managerIdFilter = searchParams.get("managerId");

  const where: any = {};
  if (roleFilter === "SUPER_ADMIN" || roleFilter === "ADMIN" || roleFilter === "CLIENT") {
    where.role = roleFilter;
  }
  if (managerIdFilter) {
    const mid = Number(managerIdFilter);
    if (Number.isFinite(mid)) where.managerId = mid;
  }

  const users = await prisma.user.findMany({
    where,
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
      tokenVersion: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { managedUsers: true, userProducts: true } },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ users });
}

// ============================================================================
// POST /api/admin/users
// ============================================================================
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const superErr = requireSuperAdmin(auth.session);
  if (superErr) return superErr;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Echec de la validation",
        details: parsed.error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const ip = extractIpFromRequest(req);
  const userAgent = extractUserAgent(req);
  const actor = {
    id: auth.session.user.id,
    email: auth.session.user.email ?? null,
    role: auth.session.user.role,
    ip,
    userAgent,
  };

  // Verifie unicite email/name
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: data.email }, { name: data.name }] },
    select: { id: true, email: true, name: true },
  });
  if (existing) {
    const field = existing.email === data.email ? "email" : "name";
    return NextResponse.json(
      { error: `Un compte avec ce ${field} existe deja.` },
      { status: 409 }
    );
  }

  const hashedPassword = await bcrypt.hash(data.password, 10);

  if (data.mode === "admin") {
    const newUser = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        role: "ADMIN",
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    auditLog("account", "create-admin", {
      actor,
      target: { type: "user", id: newUser.id, label: newUser.email },
      metadata: { name: newUser.name },
    });
    return NextResponse.json({ user: newUser }, { status: 201 });
  }

  // mode "sub-account"
  const parent = await prisma.user.findUnique({
    where: { id: data.managerId },
    select: { id: true, role: true, name: true },
  });
  if (!parent || parent.role !== "CLIENT") {
    return NextResponse.json(
      { error: "managerId invalide : le compte parent doit etre un CLIENT existant." },
      { status: 400 }
    );
  }

  const newUser = await prisma.user.create({
    data: {
      email: data.email,
      password: hashedPassword,
      name: data.name,
      role: "CLIENT",
      managerId: data.managerId,
      permissions: data.permissions as any,
    },
    select: {
      id: true, name: true, email: true, role: true,
      managerId: true, permissions: true, createdAt: true,
    },
  });
  auditLog("account", "create-sub-account", {
    actor,
    target: { type: "user", id: newUser.id, label: newUser.email },
    metadata: {
      managerId: data.managerId,
      managerName: parent.name,
      permissions: data.permissions,
    },
  });
  return NextResponse.json({ user: newUser }, { status: 201 });
}
