import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";

export async function PATCH(req: Request, { params }: any) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { session } = auth;

  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const existing = await prisma.callConversation.findUnique({
    where: { id },
    select: { userProductId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ownershipErr = await assertUserProductOwnership(session, existing.userProductId);
  if (ownershipErr) return ownershipErr;

  const { flagged } = await req.json();

  const call = await prisma.callConversation.update({
    where: { id },
    data: { flagged },
  });

  const io: any = globalThis.io;

  if (io) {
    io.emit("call-flagged", {
      callId: id,
      flagged,
    });
  } else {
    console.log("Socket non initialisé");
  }

  return NextResponse.json(call);
}
