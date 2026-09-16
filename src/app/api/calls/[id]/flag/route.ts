import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";
import { requirePagePermission, requireAnyPagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";

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

  // Signaler un appel se fait depuis DEUX ecrans : la liste des appels et celui des
  // incidents. N'exiger que « Incidents » (jusqu'au 16/09/2026) laissait un sous-compte
  // qui n'a que « Appels » cliquer sur le drapeau, le voir passer au rouge, et perdre le
  // signalement au rechargement : l'ecran n'attendait pas la reponse pour se peindre.
  const droitErr = await requireAnyPagePermission([PAGES.CALLS, PAGES.INCIDENTS], "write");
  if (droitErr) return droitErr;

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
