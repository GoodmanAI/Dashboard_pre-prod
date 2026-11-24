import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { cochageEtape } from "@/pilot/lib/validation/etape";
import { cocherEtape } from "@/pilot/lib/checklist/cocher";

export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const analyse = cochageEtape.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier("Corps de requête invalide.", 400);
    const etape = await cocherEtape({ ...analyse.data, auteurId: utilisateur.id });
    return NextResponse.json({ etape });
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
