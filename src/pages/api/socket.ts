import { Server } from "socket.io";
import type { NextApiRequest, NextApiResponse } from "next";
import { getIO } from "@/lib/socket";

export default function handler(req: NextApiRequest, res: NextApiResponse) {

  if (!(res.socket as any).server.io) {

    console.log("Initialisation Socket.io");

    const io = new Server((res.socket as any).server);

    (res.socket as any).server.io = io;

    getIO();

    io.on("connection", (socket) => {
      console.log("client connecté", socket.id);
    });

  }

  res.end();
}