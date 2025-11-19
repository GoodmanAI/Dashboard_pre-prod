// app/api/typeexam/route.ts

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const defaultTypes = {
  US: { fr: "Echographie" },
  MG: { fr: "Mammographie" },
  RX: { fr: "Radio" },
  MR: { fr: "IRM" },
  CT: { fr: "Scanner" }
};


export async function GET(req: Request) {
  const url = new URL(req.url);
  const userProductId = url.searchParams.get("userProductId");

  if (!userProductId) {
    return NextResponse.json(
      { error: "Missing userProductId" },
      { status: 400 }
    );
  }

  const id = Number(userProductId);

  const mappings = await prisma.examMapping.findMany({
    where: { userProductId: id }
  });

  if (mappings.length === 0) {
    // Renvoi valeurs par défaut
    return NextResponse.json(defaultTypes);
  }

  return NextResponse.json(mappings);
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const userProductId = url.searchParams.get("userProductId");

  if (!userProductId) {
    return NextResponse.json(
      { error: "Missing userProductId" },
      { status: 400 }
    );
  }

  const id = Number(userProductId);
  const data = await req.json();

  // Clean existing
  await prisma.examMapping.deleteMany({
    where: { userProductId: id }
  });

  // Insert
  await prisma.examMapping.createMany({
    data: Object.entries(data).map(([code, row]: any) => ({
      userProductId: id,
      examCode: code,
      labelFr: row.fr,
      diminutif: row.diminutif
    }))
  });

  return NextResponse.json({ success: true });
}
