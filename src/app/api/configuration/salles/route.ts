import { NextRequest, NextResponse } from "next/server";
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";
import { requireAnyPagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sallesDuCentre } from "@/lib/sallesExamenLecture";
import {
  examensDuCentre,
  lireExceptionsSalles,
  sallesDuType,
} from "@/lib/sallesExamen";

/**
 * GET /api/configuration/salles?userProductId=NN   (session uniquement)
 *   → 200 {
 *       sallesParType: { "RX": [{ "poste": "CHKRX2", "libelle": "R2" }] },
 *       examens: [{ codeExamen, libelle, typeExamen }],   // ceux qui ont des salles
 *       exceptionsSalles: [{ codeExamen, poste }]         // nettoyées, comme au GET
 *     }
 *
 * Les salles déclarées par l'admin dans `talk.site.sallesParType`, EN LECTURE SEULE,
 * pour les deux écrans du centre qui choisissent parmi elles : « Correspondance des
 * examens » (salles par examen) et « Paramètres généraux » (priorité des salles des
 * doubles examens). Plan `2026-10-filtrage-creneaux-par-salle`, décision D4.
 *
 * POURQUOI UNE ROUTE À PART. `talk.site` est un domaine admin : un compte client ne
 * le lit pas par `/api/product-config`, et l'ouvrir lui montrerait les codes sites et
 * les numéros de transfert. Glisser les salles dans `get/mapping` aurait changé la
 * forme que lit LyraeTalk (`data[internal_code]`, ou un tableau d'examens) ; un
 * en-tête HTTP aurait porté du JSON hors du corps. Une petite route, qui ne rend que
 * ce champ, laisse les deux formes intactes.
 *
 * `examens` (07/10/2026) : les examens de la correspondance du centre dont le type a
 * des salles déclarées, les seuls à qui l'on peut imposer une salle. Libellé = celui
 * du centre s'il en a saisi un. `exceptionsSalles` : les salles imposées encore
 * valables, pour que la colonne « Salles » de la correspondance les montre.
 *
 * Droit : lecture de l'un des deux écrans qui s'en servent.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const userProductId = Number(new URL(req.url).searchParams.get("userProductId"));
  if (!userProductId || Number.isNaN(userProductId)) {
    return NextResponse.json({ error: "Missing or invalid userProductId" }, { status: 400 });
  }

  const ownershipErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownershipErr) return ownershipErr;

  const droitErr = await requireAnyPagePermission(
    [PAGES.MAPPING_EXAM, PAGES.PARAMETRAGE],
    "read"
  );
  if (droitErr) return droitErr;

  try {
    const sallesParType = await sallesDuCentre(userProductId);
    const settings = await prisma.talkSettings.findUnique({
      where: { userProductId },
      select: { exams: true, options: true },
    });
    const tous = examensDuCentre(settings?.exams ?? null);
    const examens = tous
      .filter((e) => sallesDuType(sallesParType, e.typeExamen).length > 0)
      .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr"));
    const exceptionsSalles = lireExceptionsSalles(
      (settings?.options as any)?.exceptionsSalles,
      tous,
      sallesParType
    );
    return NextResponse.json({ sallesParType, examens, exceptionsSalles });
  } catch (e) {
    console.error("[configuration/salles] lecture impossible :", e);
    return NextResponse.json(
      { error: "Les salles du centre n'ont pas pu être lues. Rechargez la page." },
      { status: 500 }
    );
  }
}
