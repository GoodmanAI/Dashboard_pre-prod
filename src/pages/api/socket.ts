import { Server as IOServer } from "socket.io";
import type { NextApiRequest, NextApiResponse } from "next";
import type { Server as HTTPServer } from "http";

type NextApiResponseServerIO = NextApiResponse & {
  socket: {
    server: HTTPServer & {
      io?: IOServer;
    };
  };
};

export default function handler(
  req: NextApiRequest,
  res: NextApiResponseServerIO
) {

  if (!res.socket.server.io) {

    console.log("Initialisation Socket.io");

    const io = new IOServer(res.socket.server, {
      path: "/api/socket",
      cors: { origin: "*" }
    });

    res.socket.server.io = io;

    globalThis.io = io;

    io.on("connection", (socket) => {
      console.log("client connecté", socket.id);
    });

  }

  res.end();
}