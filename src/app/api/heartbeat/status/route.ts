export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { listHeartbeats } from "@/utils/heartbeatStore";

const DOWN_AFTER_SECONDS = 15;

export async function GET() {
  const now = Date.now();
  const data = listHeartbeats().map((h) => {
    const secondsAgo = Math.max(
      0,
      Math.floor((now - new Date(h.lastSeen).getTime()) / 1000)
    );
    return {
      app: h.app,
      lastSeen: h.lastSeen,
      secondsAgo,
      status: secondsAgo < DOWN_AFTER_SECONDS ? "alive" : "down",
      pid: h.pid,
      uptime: h.uptime,
    };
  });

  return NextResponse.json(data);
}
