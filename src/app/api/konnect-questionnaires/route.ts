export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/auth-helpers";
import {
  centreDuCode,
  questionnairesApplicables,
  typeExamenValide,
} from "@/lib/konnectQuestionnaires";

/**
 * POST /api/konnect-questionnaires   (x-api-key: KONNECT_API_KEY)
 *
 * Les questionnaires du centre que Konnect fait remplir dans son parcours,
 * apres le choix du creneau. Calcul seul : rien n'est ecrit, aucune donnee
 * patient n'entre (deux booleens et un type d'examen).
 * Plan : plans/2026-10-konnect-questionnaires-centre.md (workspace).
 *
 * Body : { externalCenterCode, examType: "irm" | "scanner" | ..., mineur?: bool,
 *          grossessePossible?: bool }
 * 200 : { questionnaires: [{ id, libelle, libelleXplore, formulaire }] }
 *       `formulaire` est complet, fonds de page compris (data URL) : Konnect
 *       dessine l'apercu avec les memes coordonnees que le PDF.
 *       Liste vide : rien a remplir, l'ecran ne s'affiche pas.
 * 400 : type d'examen inconnu. 404 : code de site sans centre.
 */
export async function POST(req: NextRequest) {
  const authErr = requireApiKey(req, "KONNECT_API_KEY");
  if (authErr) return authErr;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const examType = typeExamenValide(body.examType);
  if (!examType) {
    return NextResponse.json({ error: "Invalid or missing examType" }, { status: 400 });
  }
  const userProductId = await centreDuCode(body.externalCenterCode);
  if (userProductId === null) {
    return NextResponse.json({ error: "Unknown externalCenterCode" }, { status: 404 });
  }

  const liste = await questionnairesApplicables(
    userProductId,
    examType,
    body.mineur === true,
    body.grossessePossible === true
  );
  return NextResponse.json({
    questionnaires: liste.map((q) => ({
      id: q.id,
      libelle: q.libelle,
      libelleXplore: q.libelleXplore,
      formulaire: q.formulaire,
    })),
  });
}
