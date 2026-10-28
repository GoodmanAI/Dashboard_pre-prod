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

  const corps = await req.json();
  const flagged = corps?.flagged === true;
  // Commentaire facultatif du client (décision A6, 27/10/2026), lu chaque matin par
  // daily-report via `GET /api/incidents-signales`. Peut porter une donnée patient :
  // jamais journalisé. Retirer le signalement efface la date et le commentaire.
  const commentaire =
    typeof corps?.flagComment === "string" ? corps.flagComment.trim().slice(0, 500) : "";

  const call = await prisma.callConversation.update({
    where: { id },
    data: flagged
      ? { flagged, flaggedAt: new Date(), flagComment: commentaire || null }
      : { flagged, flaggedAt: null, flagComment: null },
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
