import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// DELETE /api/user/:userId/number/:numberId
export async function DELETE(req: Request, { params }: { params: { userId: string, numberId: string } }) {
  const userId = Number(params.userId);
  const numberId = Number(params.numberId);

  // Vérifier que le numéro existe et appartient au user
  const number = await prisma.userNumber.findUnique({
    where: { id: numberId }
  });

  if (!number || number.userId !== userId) {
    return NextResponse.json(
      { error: "Numéro introuvable pour cet utilisateur" },
      { status: 404 }
    );
  }

  // Suppression
  await prisma.userNumber.delete({
    where: { id: numberId }
  });

  return NextResponse.json({ message: "Numéro supprimé avec succès" });
}
