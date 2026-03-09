import { Server } from "socket.io";

export default function handler(req: any, res: any) {
  if (!res.socket.server.io) {

    const io = new Server(res.socket.server);

    res.socket.server.io = io;

    io.on("connection", (socket) => {
      console.log("socket connecté", socket.id);
    });
  }

  res.end();
}