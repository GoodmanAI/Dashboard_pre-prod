import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { centresLies } from "@/lib/groupesCentres";

export const dynamic = "force-dynamic";

/**
 * GET /api/centres-lies
 * -----------------------------------------------------------------------------
 * Les autres centres du groupe de l'utilisateur courant, pour le sélecteur du
 * header. Tableau vide si son centre n'appartient à aucun groupe.
 *
 * Cette route existe pour retirer du front-end une règle d'AUTORISATION qu'il
 * n'avait pas à connaître : `CentreContext` codait les groupes en dur
 * (`if (data.id == 7 || data.id == 8) ...`), en double de `auth-helpers.ts`, et
 * ne savait exprimer que des paires. Le groupe Quimper en compte trois.
 *
 * La forme renvoyée est celle attendue par `ManagedUser` côté contexte.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const ids = await centresLies(auth.session.user.id);
  if (ids.length === 0) return NextResponse.json([]);

  const centres = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      email: true,
      address: true,
      city: true,
      postalCode: true,
      country: true,
      userProducts: {
        where: { productId: 2, removedAt: null },
        take: 1,
        select: { id: true },
      },
    },
  });

  // Même ordre que la déclaration du groupe, pour que le sélecteur ne change pas
  // d'ordre d'un chargement à l'autre.
  const parId = new Map(centres.map((c) => [c.id, c]));

  return NextResponse.json(
    ids
      .map((id) => parId.get(id))
      .filter((c): c is (typeof centres)[number] => !!c)
      .map((c) => ({
        ...c,
        userProductId: c.userProducts[0]?.id ?? null,
        userProducts: undefined,
      }))
  );
}
