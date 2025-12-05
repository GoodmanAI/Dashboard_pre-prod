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

export async function POST(req: NextRequest) {
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

  // Mapping FR -> Code pour labelFr si pas fourni
  const examCodeMap: Record<string, string> = {
    Echographie: "US",
    Mammographie: "MG",
    Radio: "RX",
    IRM: "MR",
    Scanner: "CT",
  };

  // Nettoyer les entrées existantes
  await prisma.examMapping.deleteMany({
    where: { userProductId: id },
  });

  // Créer de nouvelles entrées
  await prisma.examMapping.createMany({
    data: Object.entries(data).map(([code, row]: any) => ({
      userProductId: id,
      examCode: code,
      fr: row.fr, // Nom français
      diminutif: row.diminutif,
      labelFr: row.labelFr ?? examCodeMap[row.fr] ?? row.fr, // Code ou fallback
    })),
  });

  return NextResponse.json({ success: true });
}