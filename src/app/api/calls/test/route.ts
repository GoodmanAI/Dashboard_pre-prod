// app/api/calls/insert_test/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const GET = async () => {
  const prisma = new PrismaClient();

  try {
    const data = {
        "userProductId": 8,
        "centerId": 7,
        "steps": [
            "Bonjour",
            "Bonjour Lyrae, je veux un rendez-vous",
            "Quel rendez-vous",
            "Je voudrais un créneau demain matin",
            "Parfait, je vous ai réservé 10h"
        ],
        "stats": {
            "intents": [],
            "rdv_status": null,
            "patient_status": null,
            "end_reason": null,
            "questions_completed": false,
            "exam_code": null
        }
    }

    const newCallConversation = await prisma.callConversation.create({
      data,
    });

    return NextResponse.json({
      success: true,
      message: "CallConversation insérée avec succès",
      data: newCallConversation,
    });
  } catch (error: any) {
    console.error("Erreur insertion CallConversation:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erreur serveur" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
};
