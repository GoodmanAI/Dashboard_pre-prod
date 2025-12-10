import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userProductId = Number(searchParams.get("userProductId"));

  const settings = await prisma.talkSettings.findUnique({
    where: { userProductId },
    select: { exams: true },
  });

  return NextResponse.json(settings?.exams ?? {});
}

export async function POST(req: Request) {
  const { userProductId, exams } = await req.json();

  await prisma.talkSettings.update({
    where: { userProductId },
    data: {
      exams: exams,
    },
  });

  return NextResponse.json({ success: true });
}