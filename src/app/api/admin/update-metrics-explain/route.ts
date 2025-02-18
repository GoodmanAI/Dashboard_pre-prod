import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { z } from "zod";

// Définition des clés autorisées pour les métriques
type MetricKey = "rdv" | "borne" | "examen" | "secretaire" | "attente";

// Schéma de validation avec Zod
const UpdateMetricsSchema = z.object({
  clientId: z.number().int().positive("Le clientId doit être un nombre positif"),
  // Chaque métrique est optionnelle et doit être comprise entre 0 et 100
  rdv: z.number().min(0, "La note doit être au moins 0").max(100, "La note doit être au maximum 100").optional(),
  borne: z.number().min(0, "La note doit être au moins 0").max(100, "La note doit être au maximum 100").optional(),
  examen: z.number().min(0, "La note doit être au moins 0").max(100, "La note doit être au maximum 100").optional(),
  secretaire: z.number().min(0, "La note doit être au moins 0").max(100, "La note doit être au maximum 100").optional(),
  attente: z.number().min(0, "La note doit être au moins 0").max(100, "La note doit être au maximum 100").optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Vérifier la clé API dans le header
    const apiKey = request.headers.get("x-api-key");
    const validApiKey = process.env.ADMIN_API_KEY;
    if (!apiKey || apiKey !== validApiKey) {
      return NextResponse.json(
        { error: "Access denied. Invalid API key." },
        { status: 403 }
      );
    }

    // Récupérer et valider le corps de la requête
    const body = await request.json();
    const parsed = UpdateMetricsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.errors },
        { status: 400 }
      );
    }

    const { clientId, rdv, borne, examen, secretaire, attente } = parsed.data;

    // Construction de l'objet de métriques (ne retenir que les valeurs définies)
    const metrics: Partial<Record<MetricKey, number>> = {};
    (["rdv", "borne", "examen", "secretaire", "attente"] as MetricKey[]).forEach((key) => {
      if (parsed.data[key] != null) {
        metrics[key] = parsed.data[key]!;
      }
    });

    // Rechercher l'enregistrement UserProduct pour l'utilisateur et le produit LyraeExplain (id = 1)
    const userProduct = await prisma.userProduct.findFirst({
      where: {
        userId: clientId,
        productId: 1,
      },
      include: { explainDetails: true },
    });

    if (!userProduct) {
      return NextResponse.json(
        { error: "Aucun enregistrement trouvé pour le service LyraeExplain pour ce client." },
        { status: 404 }
      );
    }

    let updatedDetails;
    if (!userProduct.explainDetails) {
      // Si aucun enregistrement de metrics n'existe, le créer
      updatedDetails = await prisma.lyraeExplainDetails.create({
        data: {
          userProductId: userProduct.id,
          ...metrics,
          metricsUpdatedAt: new Date(),
        },
      });
    } else {
      // Sinon, le mettre à jour
      updatedDetails = await prisma.lyraeExplainDetails.update({
        where: { userProductId: userProduct.id },
        data: {
          ...metrics,
          metricsUpdatedAt: new Date(),
        },
      });
    }

    return NextResponse.json(
      {
        message: "Les métriques du service LyraeExplain ont été mises à jour avec succès.",
        metrics: updatedDetails,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erreur lors de la mise à jour des métriques :", error);
    return NextResponse.json(
      { error: "Une erreur inattendue est survenue." },
      { status: 500 }
    );
  }
}
