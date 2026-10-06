import { NextRequest, NextResponse } from "next/server";
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";
import { requireAnyPagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";
import { sallesDuCentre } from "@/lib/sallesExamenLecture";

/**
 * GET /api/configuration/salles?userProductId=NN   (session uniquement)
 *   → 200 { sallesParType: { "RX": [{ "poste": "CHKRX2", "libelle": "R2" }] } }
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
    return NextResponse.json({ sallesParType: await sallesDuCentre(userProductId) });
  } catch (e) {
    console.error("[configuration/salles] lecture impossible :", e);
    return NextResponse.json(
      { error: "Les salles du centre n'ont pas pu être lues. Rechargez la page." },
      { status: 500 }
    );
  }
}
