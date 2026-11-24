import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutLirePilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { nouvelleAttribution } from "@/pilot/lib/validation/attribution";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { attribuerAlerte, equipeAttribuable, peutConfierAlertes } from "@/pilot/lib/alertes/attribuer";

/** Les personnes à qui confier une alerte (C-91) : pour le directeur général et le super-administrateur. */
export async function GET() {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutLirePilot(utilisateur.role));
    exiger(await peutConfierAlertes(utilisateur), "Seul le directeur général ou un administrateur de Pilot confie une alerte.");
    return NextResponse.json({ equipe: await equipeAttribuable() }, { headers: { "Cache-Control": "no-store" } });
  } catch (erreur) { return reponseErreur(erreur); }
}

/** Confie une alerte, et les signaux de sa cause, à une personne (C-91). La garde de rôle est revue dans la transaction. */
export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutLirePilot(utilisateur.role));
    const analyse = nouvelleAttribution.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    return NextResponse.json({ attribution: await attribuerAlerte(analyse.data, utilisateur) });
  } catch (erreur) { return reponseErreur(erreur); }
}
