import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutLirePilot, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { creationConcurrent, messageConcurrent } from "@/pilot/lib/validation/concurrent";
import { creerConcurrent } from "@/pilot/lib/concurrents/gerer";
import { listerConcurrents } from "@/pilot/lib/concurrents/lire";
import { lireCorps } from "@/pilot/lib/requete";

export const dynamic = "force-dynamic";

/** Tout compte de l'équipe lit. */
export async function GET() {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutLirePilot(utilisateur.role));
    return NextResponse.json({ concurrents: await listerConcurrents() });
  } catch (erreur) { return reponseErreur(erreur); }
}

export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const analyse = creationConcurrent.safeParse(await lireCorps(requete));
    if (!analyse.success) throw new ErreurMetier(messageConcurrent(analyse.error), 400);
    const concurrent = await creerConcurrent(analyse.data, utilisateur.id);
    return NextResponse.json({ concurrent }, { status: 201 });
  } catch (erreur) { return reponseErreur(erreur); }
}
