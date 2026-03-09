import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PATCH(req: Request, { params }: any) {
  const id = Number(params.id);
  const { treated } = await req.json();

  console.log("id", id);

  const io = res.socket.server.io;

  io.emit("call-treated", {
    callId: id,
    treated: treated
  });

  const call = await prisma.callConversation.update({
    where: { id },
    data: {
      treated,
    },
  });

  return NextResponse.json(call);
}