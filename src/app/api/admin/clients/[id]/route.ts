import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";

/**
 * DELETE /api/admin/clients/:id
 * ---------------------------------------------------------
 * Supprime un utilisateur CLIENT et ses données liées
 * (cascades gérés par Prisma : UserProduct, calls, tickets, etc).
 *
 * Double confirmation exigée côté appelant : le body doit contenir
 * `confirmName` égal au `User.name` stocké en BDD — protège contre
 * un DELETE accidentel par saisie d'URL.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const confirmName: string | undefined = body?.confirmName;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }

  // Garde-fou : on ne supprime pas un ADMIN via cet endpoint
  if (user.role !== "CLIENT") {
    return NextResponse.json(
      { error: "Seuls les comptes CLIENT peuvent être supprimés via cette action." },
      { status: 403 }
    );
  }

  // Double confirmation : le nom saisi doit matcher exactement
  if (!confirmName || confirmName !== user.name) {
    return NextResponse.json(
      { error: "Confirmation manquante ou incorrecte (nom du client à saisir)." },
      { status: 400 }
    );
  }

  try {
    await prisma.user.delete({ where: { id } });
    return NextResponse.json(
      { success: true, deleted: { id: user.id, name: user.name, email: user.email } },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("DELETE /api/admin/clients/[id] error:", err);
    return NextResponse.json(
      { error: "Erreur lors de la suppression.", details: err.message },
      { status: 500 }
    );
  }
}
