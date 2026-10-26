export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/auth-helpers";
import { alertesDe, verifierReponses } from "@/lib/formulaires";
import { lireSignature, remplirPdf } from "@/lib/formulairesPdf";
import { centreDuCode, questionnaireDuDocument } from "@/lib/konnectQuestionnaires";

/**
 * POST /api/konnect-questionnaires/[id]/pdf   (x-api-key: KONNECT_API_KEY)
 *
 * Le patient a rempli dans Konnect le questionnaire `id` et l'a signe. Le
 * Dashboard reverifie les reponses (memes regles que la page de depot), les
 * ecrit dans le PDF du centre avec la signature et la date du jour, et RENVOIE
 * le PDF : Konnect l'envoie lui-meme dans Xplore avec l'ordonnance, une fois le
 * RDV cree. Ni les reponses ni le PDF ne sont gardes ici.
 * Plan : plans/2026-10-konnect-questionnaires-centre.md (workspace).
 *
 * Body : { externalCenterCode, reponses: { [champ]: string | string[] | boolean },
 *          signature: "data:image/png;base64,..." }
 * 200 : { pdf: base64, libelle, libelleXplore, alertes: string[] }
 *       `alertes` : libelles des reponses a alerte ; Konnect les renvoie a
 *       /api/prescriptions/init (`documentsRecus`) pour la secretaire.
 * 400 : reponses incompletes (`erreurs` par champ) ou signature absente.
 * 404 : centre inconnu, document hors du centre, retire de Konnect, ou qui ne
 *       se remplit plus en ligne (modele remplace).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authErr = requireApiKey(req, "KONNECT_API_KEY");
  if (authErr) return authErr;

  if (!/^\d+$/.test(params.id)) {
    return NextResponse.json({ error: "Unknown questionnaire" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const userProductId = await centreDuCode(body.externalCenterCode);
  if (userProductId === null) {
    return NextResponse.json({ error: "Unknown externalCenterCode" }, { status: 404 });
  }
  const q = await questionnaireDuDocument(userProductId, parseInt(params.id, 10));
  if (!q) {
    return NextResponse.json({ error: "Unknown questionnaire" }, { status: 404 });
  }

  const verifie = verifierReponses(q.formulaire, body.reponses);
  if (!verifie.ok) {
    return NextResponse.json(
      { error: "Il manque des réponses.", erreurs: verifie.erreurs },
      { status: 400 }
    );
  }
  const signature = lireSignature(body.signature);
  if (q.formulaire.champs.some((c) => c.type === "signature") && !signature) {
    return NextResponse.json({ error: "Signature manquante." }, { status: 400 });
  }

  let pdf: Uint8Array;
  try {
    pdf = await remplirPdf(q.modele, q.formulaire, verifie.reponses, signature);
  } catch (err) {
    // Ni reponse ni nom dans le journal : le seul identifiant est le document.
    console.error("[konnect-questionnaires] remplissage du PDF impossible, document", q.id, err);
    return NextResponse.json({ error: "PDF fill failed" }, { status: 500 });
  }

  return NextResponse.json({
    pdf: Buffer.from(pdf).toString("base64"),
    libelle: q.libelle,
    libelleXplore: q.libelleXplore,
    alertes: alertesDe(q.formulaire, verifie.reponses),
  });
}
