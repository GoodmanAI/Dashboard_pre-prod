import { NextResponse } from "next/server";
import { PrismaClient, TalkSettings, User, Product } from '@prisma/client'

export async function POST(request: Request) {
    const { userProductId, reconnaissance } = await request.json();
    const prisma = new PrismaClient();

    if (!userProductId) {
        return NextResponse.json({ error: "Missing userProductId" }, { status: 400 });
    }

    try {
        const settings = await prisma.talkSettings.upsert({
        where: { userProductId },
        update: { reconnaissance },
        create: { userProductId, reconnaissance },
        });

        return NextResponse.json(settings);
    } catch (error) {
        console.error("Error saving TalkSettings:", error);
        return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
    }
}