import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { Prisma } from "@prisma/client";
import { requireApiKey } from "@/lib/auth-helpers";

type Speaker = "Lyrae" | "User";

interface Step {
  speaker: Speaker;
  text: string;
}

export async function POST(req: NextRequest) {
  try {
    const keyErr = requireApiKey(req, "BOT_API_KEY");
    if (keyErr) return keyErr;

    const data = await req.json();

    const { userProductId, steps, stats } = data;

    if (!userProductId || !steps || !Array.isArray(steps)) {
      return NextResponse.json(
        { error: "Missing or invalid parameters" },
        { status: 400 }
      );
    }

    // Centre effectif contre centre d'entrée.
    // -------------------------------------------------------------------------
    // Depuis le 2026-09-04, sur un groupe qui partage un numéro d'appel (Quimper
    // 18, Fouesnant 20, Pont-l'Abbé 21), LyraeTalk envoie le centre où le patient
    // a pris ou choisi son rendez-vous, pas celui du numéro composé. Il joint le
    // centre d'entrée dans `stats.entry_user_product_id`.
    //
    // `CallConversation.userProductId` porte une clé étrangère vers UserProduct :
    // écrire un centre qui n'existe pas encore côté Dashboard ferait échouer
    // l'insertion en 500 et PERDRAIT l'appel, transcription comprise. On retombe
    // donc sur le centre d'entrée, quitte à mal attribuer, plutôt que de perdre.
    // Cf. plans/2026-09-attribution-stats-multisite.md.
    const entryUserProductId =
      Number(stats?.entry_user_product_id) || Number(userProductId);

    const existe = await prisma.userProduct.findUnique({
      where: { id: Number(userProductId) },
      select: { id: true },
    });

    let userProductIdFinal = Number(userProductId);
    if (!existe) {
      if (entryUserProductId === userProductIdFinal) {
        return NextResponse.json(
          { error: `UserProduct ${userProductId} introuvable` },
          { status: 404 }
        );
      }
      console.warn(
        `[calls/summary] UserProduct ${userProductId} introuvable, ` +
          `appel attribué au centre d'entrée ${entryUserProductId}. ` +
          `Créer le centre côté Dashboard pour rétablir l'attribution.`
      );
      userProductIdFinal = entryUserProductId;
    }

    // Transformation des steps
    const stepsTransformed: Step[] = steps.map((text: string, index: number) => ({
      speaker: index % 2 === 0 ? "Lyrae" : "User",
      text,
    }));

    await prisma.callConversation.create({
      data: {
        userProductId: userProductIdFinal,
        // `centerId` reste à 0 : dans les autres tables de cette base
        // (AppointmentConfirmation, PrescriptionUpload) il désigne un User.id.
        // Lui donner ici le sens de « centre d'entrée » serait un troisième
        // sens pour un même nom de colonne. Cette information vit dans
        // `stats.entry_user_product_id`, qui est explicite.
        centerId: 0,
        steps: stepsTransformed as unknown as Prisma.InputJsonValue,
        stats: stats as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error("❌ Error saving call summary:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
