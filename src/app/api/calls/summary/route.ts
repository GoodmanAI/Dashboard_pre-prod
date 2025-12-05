// pages/api/calls/summary.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Speaker = "Lyrae" | "User";

interface Step {
  speaker: Speaker;
  text: string;
}

interface CallSummaryRequest {
  userProductId: number;
  centerId: number;
  steps: string[];
  stats: {
    intents: string[];
    rdv_status: "success" | "no_slot" | "not_performed" | "cancelled" | "modified" | null;
    patient_status: "known" | "new" | "third_party" | null;
    end_reason: "hangup" | "transfer" | "error_logic" | "error_timeout" | null;
    questions_completed: boolean;
    exam_code: string | null;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean } | { error: string }>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data: CallSummaryRequest = req.body;

    const { userProductId, centerId, steps, stats } = data;

    if (!userProductId || !centerId || !steps || !Array.isArray(steps)) {
      return res.status(400).json({ error: "Missing or invalid parameters" });
    }

    // Transformation du tableau en Step[] avec alternance Lyrae/User
    const stepsTransformed: Step[] = steps.map((text, index) => ({
      speaker: index % 2 === 0 ? "Lyrae" : "User",
      text,
    }));

    // Enregistrement dans la base
    await prisma.callConversation.create({
      data: {
        userProductId,
        centerId,
        steps: stepsTransformed, // Prisma JSON
        stats,
      },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error saving call summary:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
