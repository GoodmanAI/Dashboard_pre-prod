// src/app/api/files/uploads/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

export async function PUT(request: NextRequest) {
  try {
    // Vérifier la session et que l'utilisateur est bien un CLIENT
    const session = await getServerSession({ req: request, ...authOptions });
    if (!session || session.user.role !== "CLIENT") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const userId = session.user.id;

    // Récupérer le type de fichier depuis la query string
    const fileTypeParam = request.nextUrl.searchParams.get("type");
    if (!fileTypeParam || !["talkInfo", "talkLibeles"].includes(fileTypeParam)) {
      return NextResponse.json({ error: "Type de fichier invalide" }, { status: 400 });
    }

    // Utiliser formData pour récupérer le fichier envoyé
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }

    // Construire le nouveau nom de fichier et son chemin
    const safeUserName = session.user.name?.replace(/\s+/g, "") || "unknown";
    const fileName = `${fileTypeParam}-${safeUserName}.csv`;
    const filePath = path.join(process.cwd(), "public", "upload", fileName);

    // Lire le contenu du fichier et l'écrire dans le dossier public/upload
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    // Récupérer l'enregistrement FileSubmission correspondant (en fonction du préfixe dans fileName)
    const fileRecord = await prisma.fileSubmission.findFirst({
      where: {
        userId: userId,
        productId: 2, // Pour LyraeTalk
        fileName: { startsWith: fileTypeParam },
      },
    });
    if (!fileRecord) {
      return NextResponse.json({ error: "Fichier non trouvé" }, { status: 404 });
    }

    // Mettre à jour l'enregistrement avec le nouveau nom et l'URL (l'URL est relative au dossier public)
    const updatedFile = await prisma.fileSubmission.update({
      where: { id: fileRecord.id },
      data: {
        fileName,
        fileUrl: `/upload/${fileName}`,
      },
    });

    return NextResponse.json(
      { message: "Fichier mis à jour avec succès", file: updatedFile },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erreur lors de la mise à jour du fichier :", error);
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
