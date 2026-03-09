import { NextResponse } from "next/server";
import { Server } from "socket.io";

export async function GET(req: any) {

  if (!(global as any).io) {

    console.log("Initialisation socket.io");

    const io = new Server({
      path: "/api/socket"
    });

    (global as any).io = io;

    io.on("connection", (socket) => {
      console.log("client connecté", socket.id);
    });

  }

  return NextResponse.json({ ok: true });

}