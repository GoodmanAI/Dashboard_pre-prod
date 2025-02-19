// src/app/api/public/talk-documents/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export async function GET(request: NextRequest) {
  // Récupérer la session de l'utilisateur
  const session = await getServerSession({ req: request, ...authOptions });
  if (!session || session.user.role !== "CLIENT") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Vérifier que l'utilisateur est abonné au produit LyraeTalk (id = 2)
  const userProduct = await prisma.userProduct.findFirst({
    where: { userId: userId, productId: 2 },
    include: { talkDetails: true },
  });
  if (!userProduct) {
    return NextResponse.json(
      { error: "User is not subscribed to LyraeTalk" },
      { status: 404 }
    );
  }

  // Récupérer les enregistrements FileSubmission pour ce produit et cet utilisateur
  const files = await prisma.fileSubmission.findMany({
    where: { userId: userId, productId: 2 },
  });

  // Séparer les fichiers en fonction du préfixe dans leur nom
  const talkInfoFile = files.find((file) =>
    file.fileName.startsWith("talkInfo-")
  );
  const talkLibelesFile = files.find((file) =>
    file.fileName.startsWith("talkLibeles-")
  );

  // Composer la réponse
  const responseObj = {
    talkInfo: {
      fileName: talkInfoFile ? talkInfoFile.fileName : null,
      fileUrl: talkInfoFile ? talkInfoFile.fileUrl : null,
      validated: userProduct.talkDetails?.talkInfoValidated ?? false,
    },
    talkLibeles: {
      fileName: talkLibelesFile ? talkLibelesFile.fileName : null,
      fileUrl: talkLibelesFile ? talkLibelesFile.fileUrl : null,
      validated: userProduct.talkDetails?.talkLibelesValidated ?? false,
    },
  };

  return NextResponse.json(responseObj, { status: 200 });
}
