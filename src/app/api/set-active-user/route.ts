// app/api/set-active-user/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { userId } = await req.json();

  const res = NextResponse.json({ ok: true });
  res.cookies.set("activeUserId", String(userId), {
    httpOnly: true,
    path: "/",
  });
  return res;
}
