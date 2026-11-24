import { exiger, peutExporter } from "@/pilot/lib/autorisations";
import { reponseErreur } from "@/pilot/lib/http";
import { utilisateurCourant } from "@/pilot/lib/session";
import { chargerApports } from "@/pilot/lib/apports/charger";
import { exporterSauvegarde } from "@/pilot/lib/apports/importer";

export const dynamic = "force-dynamic";

/** La sauvegarde au format du calculateur, en pièce jointe (CHOIX.md, C-63). */
export async function GET() {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutExporter(utilisateur), "L'export est réservé aux administrateurs de Pilot.");
    const donnees = await chargerApports();
    const corps = JSON.stringify(exporterSauvegarde(donnees), null, 1);
    return new Response(corps, { headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="Sauvegarde_LYRAE_${donnees.aujourdhui}.json"`,
      "Cache-Control": "no-store",
    } });
  } catch (erreur) { return reponseErreur(erreur); }
}
