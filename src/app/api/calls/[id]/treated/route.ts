import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PATCH(req: Request, { params }: any) {
  const id = Number(params.id);
  const { treated } = await req.json();

  const call = await prisma.callConversation.update({
    where: { id },
    data: { treated },
  });

  const io: any = globalThis.io;

  if (io) {
    io.emit("call-treated", {
      callId: id,
      treated,
    });
  } else {
    console.log("Socket non initialisé");
  }

  return NextResponse.json(call);
}