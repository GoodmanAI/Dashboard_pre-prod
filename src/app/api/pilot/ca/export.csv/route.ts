import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutExporterCa } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { exporterCa } from "@/pilot/lib/ca/exporter";

export const dynamic = "force-dynamic";
export async function GET(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutExporterCa(utilisateur), "L'export comptable demande le droit « Exporter pour la comptabilité ».");
    const recherche = new URL(requete.url).searchParams;
    if (recherche.getAll("de").length > 1 || recherche.getAll("a").length > 1) throw new ErreurMetier("Période invalide : un seul mois de début et de fin.", 400);
    const { nom, contenu } = await exporterCa({ de: recherche.get("de"), a: recherche.get("a") });
    return new NextResponse(contenu, { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nom}"`,
      "Cache-Control": "no-store",
    } });
  } catch (erreur) { return reponseErreur(erreur); }
}
