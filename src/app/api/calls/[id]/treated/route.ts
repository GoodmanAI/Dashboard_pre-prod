import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getIO } from "@/lib/socket";

export async function PATCH(req: Request, { params }: any) {

  const id = Number(params.id);
  const { treated } = await req.json();

  const call = await prisma.callConversation.update({
    where: { id },
    data: { treated },
  });

  const io = getIO();

  io.emit("call-treated", {
    callId: id,
    treated
  });

  return NextResponse.json(call);
}