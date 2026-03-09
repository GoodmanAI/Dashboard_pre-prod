import { NextResponse } from "next/server";
import { initSocket } from "@/lib/socket";

export async function GET() {

  // @ts-ignore
  const server = global.server;

  if (!server) {
    throw new Error("HTTP server non disponible");
  }

  initSocket(server);

  return NextResponse.json({ status: "ok" });
}