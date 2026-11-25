import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutLirePilot } from "@/pilot/lib/autorisations";
import { reponseErreur } from "@/pilot/lib/http";
import { modeleXlsx } from "@/pilot/lib/import/prospects";

export const dynamic = "force-dynamic";

/** Le modèle du fichier d'import des prospects. */
export async function GET() {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutLirePilot(utilisateur.role));
    return new NextResponse(new Uint8Array(modeleXlsx()), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modele-import-prospects.xlsx"',
      "Cache-Control": "no-store",
    } });
  } catch (erreur) { return reponseErreur(erreur); }
}
