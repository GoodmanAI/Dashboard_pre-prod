export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { amorcerMapping } from "@/lib/referentielExamens";

/**
 * La liste d'examens qui amorce le mapping d'un centre jamais configuré.
 *
 *   GET /api/referentiel-examens                     → la nomenclature seule
 *   GET /api/referentiel-examens?userProductId=NN    → le mapping LyraeTalk de ce
 *                                                      client s'il en a un, sinon la
 *                                                      nomenclature
 *
 * POURQUOI CETTE ROUTE EXISTE, alors que `/api/data/exams` couvrait déjà le sujet.
 * Elle ne le couvrait pas : **elle renvoie du CSV**, et l'écran de mapping de LyraeTalk
 * appelle `.json()` dessus. Ce repli lève donc une exception et affiche « Erreur de
 * chargement des examens ». Il n'a jamais fonctionné, indépendamment d'Azure.
 *
 * Personne ne s'en était aperçu parce que ce chemin ne s'emprunte que sur un centre
 * SANS `TalkSettings`, c'est-à-dire un client tout neuf. Le défaut attendait la
 * prochaine installation.
 *
 * `/api/data/exams` reste en place : c'est un EXPORT, et le CSV y a du sens. Cette
 * route-ci sert les écrans.
 *
 * Réservée à une session : c'est un écran de configuration, jamais un appel machine.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const brut = new URL(req.url).searchParams.get("userProductId");
  const userProductId = brut === null ? undefined : Number(brut);
  if (userProductId !== undefined && !Number.isFinite(userProductId)) {
    return NextResponse.json(
      { error: "userProductId invalide" },
      { status: 400 },
    );
  }

  const referentiel = await amorcerMapping(userProductId);

  return NextResponse.json({
    source: referentiel.source,
    // Présent quand aucune source n'a répondu : l'écran l'affiche tel quel plutôt que
    // de laisser un tableau vide sans explication.
    motif: referentiel.motif ?? null,
    count: referentiel.lignes.length,
    // Forme attendue par l'écran de mapping de LyraeTalk (`ExamRow`). Les colonnes du
    // client sont vides à dessein : le code RIS lui appartient, c'est ce qu'il saisit.
    examens: referentiel.lignes.map((l) => ({
      codeExamen: l.codeExamen,
      typeExamen: l.typeExamen ?? "",
      libelle: l.libelle ?? "",
      codeExamenClient: l.codeExamenClient,
      typeExamenClient: l.typeExamenClient,
      libelleClient: l.libelleClient,
      codeExamenClientInject: l.codeExamenInjection || null,
      performed: l.performed,
      horaire: { enabled: false, position: "below", time: "" },
    })),
  });
}
