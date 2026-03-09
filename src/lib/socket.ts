import { Server } from "socket.io";

let io: Server | null = null;

export function initSocket(server: any) {
  if (!io) {
    io = new Server(server, {
      cors: { origin: "*" },
    });

    io.on("connection", (socket) => {
      console.log("client connecté", socket.id);
    });
  }

  return io;
}

export function setIO(server: Server) {
  io = server;
}

export function getIO() {
  if (!io) {
    throw new Error("Socket.io non initialisé");
  }

  return io;
}