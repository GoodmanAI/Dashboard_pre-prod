import { NextResponse } from "next/server";
import { exiger, peutLirePilot } from "@/pilot/lib/autorisations";
import { reponseErreur } from "@/pilot/lib/http";
import { utilisateurCourant } from "@/pilot/lib/session";
import { chargerApports } from "@/pilot/lib/apports/charger";
import { nomFichier, suiviCsv, vueDepuis } from "@/pilot/lib/apports/documents";

export const dynamic = "force-dynamic";

/** Le suivi mensuel des commissions, pour un tableur (CHOIX.md, C-63). */
export async function GET(requete: Request) {
  try {
    const u = await utilisateurCourant();
    exiger(peutLirePilot(u.role));
    const d = await chargerApports();
    const vue = vueDepuis(d, new URL(requete.url).searchParams.get("apporteur"));
    const nom = nomFichier.suivi(d.moisCourant);
    return new NextResponse(suiviCsv(d, vue), { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nom}"`,
      "Cache-Control": "no-store",
    } });
  } catch (erreur) { return reponseErreur(erreur); }
}
