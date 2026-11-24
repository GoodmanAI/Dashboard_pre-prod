import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutVoirCa } from "@/pilot/lib/autorisations";
import { reponseErreur } from "@/pilot/lib/http";
import { chargerFacturation } from "@/pilot/lib/facturationSalles/charger";
import { facturationCsv } from "@/pilot/lib/facturationSalles/calcul";

/**
 * L'export de la facturation à la salle (CSV pour Excel), repris de
 * `GET /api/admin/facturation?format=csv` du Dashboard. Montants HT de la grille
 * de Pilot, TTC à côté. Même droit que le chiffre d'affaires (C-64).
 */
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutVoirCa(utilisateur), "La facturation demande le droit « Voir le chiffre d'affaires ».");
    const donnees = await chargerFacturation();
    const jour = new Date().toISOString().slice(0, 10);
    return new NextResponse(facturationCsv(donnees), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="facturation-salles-${jour}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
