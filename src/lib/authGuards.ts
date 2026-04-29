import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

/**
 * Refuse l'accès si la session courante correspond à un compte Secrétaire.
 * Retourne null si l'écriture est autorisée, ou une NextResponse 403 sinon.
 * À appeler en début de handler des routes API d'écriture (POST/PUT/PATCH/DELETE).
 */
export async function rejectIfSecretary() {
  const session = await getServerSession(authOptions);
  if (session?.user?.isSecretary) {
    return NextResponse.json(
      { error: "Lecture seule : les comptes Secrétaire ne peuvent pas modifier la configuration." },
      { status: 403 }
    );
  }
  return null;
}
