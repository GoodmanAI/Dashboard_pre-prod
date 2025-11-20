import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userProductId, ...formData } = body;

    if (!userProductId || typeof userProductId !== "number") {
      return NextResponse.json(
        { success: false, error: "userProductId manquant ou invalide" },
        { status: 400 }
      );
    }

    const userProduct = await prisma.userProduct.findUnique({
      where: { id: userProductId },
    });

    if (!userProduct) {
      return NextResponse.json(
        { success: false, error: "Aucun UserProduct trouvé avec cet ID" },
        { status: 404 }
      );
    }

    const saved = await prisma.talkInformationSettings.upsert({
      where: { userProductId },
      update: { data: formData },
      create: { userProductId, data: formData },
    });

    // --------------✨ CALCUL DU NOMBRE DE CHAMPS REMPLIS ✨--------------
    const values = Object.values(formData);
    const filledSections = values.filter(
      (v) => v !== null && v !== "" && String(v).trim() !== ""
    ).length;

    const totalSections = Object.keys(formData).length;
    // --------------------------------------------------------------------

    return NextResponse.json({
      success: true,
      message: "Configuration enregistrée avec succès",
      filledSections,
      totalSections,
      data: saved,
    });
  } catch (error: any) {
    console.error("Erreur API /informationnel:", error);
    return NextResponse.json(
      { success: false, error: "Erreur serveur", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userProductIdParam = searchParams.get("userProductId");

    const userProductId = userProductIdParam ? parseInt(userProductIdParam, 10) : NaN;
    if (isNaN(userProductId)) {
      return NextResponse.json(
        { success: false, error: "Paramètre userProductId invalide ou manquant" },
        { status: 400 }
      );
    }

    const userProduct = await prisma.userProduct.findUnique({
      where: { id: userProductId },
      include: { informationSettings: true },
    });

    if (!userProduct) {
      return NextResponse.json(
        { success: false, error: "UserProduct non trouvé" },
        { status: 404 }
      );
    }

    const data = userProduct.informationSettings?.data ?? {};

    // ---- ✨ NOUVEAU : calcul remplissage ✨ ----
    const totalSections = Object.keys(data).length;

    const filledSections = Object.values(data).filter(
      (v) => v && String(v).trim() !== ""
    ).length;
    // -------------------------------------------

    return NextResponse.json({
      success: true,
      data,
      filledSections,
      totalSections,
      userProduct: {
        id: userProduct.id,
        userId: userProduct.userId,
        productId: userProduct.productId,
      },
    });
  } catch (error: any) {
    console.error("Erreur GET /informationnel:", error);
    return NextResponse.json(
      { success: false, error: "Erreur interne serveur", details: error.message },
      { status: 500 }
    );
  }
}