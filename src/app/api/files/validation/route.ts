import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { z } from "zod";
import transporter from "@/utils/mailer";

// Définir un schéma zod pour le paramètre fileType (récupéré depuis l'URL)
const fileTypeSchema = z.enum(["talkInfo", "talkLibeles"]);

export async function POST(request: NextRequest) {
  try {
    // Vérifier la session et le rôle CLIENT
    const session = await getServerSession({ req: request, ...authOptions });
    if (!session || session.user.role !== "CLIENT") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const userId = session.user.id;

    // Récupérer le paramètre "type" depuis l'URL
    const { searchParams } = new URL(request.url);
    const fileTypeParam = searchParams.get("type");
    const parsed = fileTypeSchema.safeParse(fileTypeParam);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Le type de fichier est requis et doit être 'talkInfo' ou 'talkLibeles'." },
        { status: 400 }
      );
    }
    const fileType = parsed.data;

    // Vérifier que l'utilisateur est abonné au service LyraeTalk (produit id = 2)
    const userProduct = await prisma.userProduct.findFirst({
      where: { userId: userId, productId: 2 },
      include: { talkDetails: true },
    });
    if (!userProduct || !userProduct.talkDetails) {
      return NextResponse.json(
        { error: "Vous n'êtes pas abonné au service LyraeTalk ou les détails sont introuvables." },
        { status: 404 }
      );
    }

    // Préparer la mise à jour en fonction du type de fichier
    let updateData = {};
    let fieldName = "";
    if (fileType === "talkInfo") {
      if (userProduct.talkDetails.talkInfoValidated) {
        return NextResponse.json(
          { error: "Le document Talk Info est déjà validé." },
          { status: 403 }
        );
      }
      updateData = { talkInfoValidated: true };
      fieldName = "Talk Info";
    } else if (fileType === "talkLibeles") {
      if (userProduct.talkDetails.talkLibelesValidated) {
        return NextResponse.json(
          { error: "Le document Talk Libellés est déjà validé." },
          { status: 403 }
        );
      }
      updateData = { talkLibelesValidated: true };
      fieldName = "Talk Libellés";
    }

    // Mettre à jour le détail dans le modèle LyraeTalkDetails
    const updatedDetails = await prisma.lyraeTalkDetails.update({
      where: { userProductId: userProduct.id },
      data: updateData,
    });

    // Créer une notification pour l'admin (supposé avoir l'ID 1)
    const notificationMessage = `Le document ${fieldName} du client ${session.user.name} (${session.user.email}) a été validé.`;
    await prisma.notification.create({
      data: {
        userId: 1, // L'admin (ID 1)
        message: notificationMessage,
      },
    });

    // Envoyer un e‑mail à l'adresse de support
    const mailOptions = {
      from: process.env.SMTP_USER, // Adresse de l'expéditeur
      to: process.env.SUPPORT_EMAIL, // Adresse de support
      subject: `Validation du document ${fieldName} par ${session.user.email}`,
      text: `Le document ${fieldName} du client ${session.user.name} a été validé.`,
    };
    await transporter.sendMail(mailOptions);

    return NextResponse.json(
      { message: `Document ${fieldName} validé avec succès`, talkDetails: updatedDetails },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erreur lors de la validation du document :", error);
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
