import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutLirePilot } from "@/pilot/lib/autorisations";
import { reponseErreur } from "@/pilot/lib/http";
import { exporterProspects } from "@/pilot/lib/prospection/exporter";

export const dynamic = "force-dynamic";

/** Tous les dossiers et leurs informations, en CSV. Ouvert à qui lit Pilot : rien que le tableau Prospects ne montre déjà. */
export async function GET() {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutLirePilot(utilisateur.role));
    const { nom, contenu } = await exporterProspects();
    return new NextResponse(contenu, { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nom}"`,
      "Cache-Control": "no-store",
    } });
  } catch (erreur) { return reponseErreur(erreur); }
}
