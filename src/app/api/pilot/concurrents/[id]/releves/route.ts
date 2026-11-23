import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { identifiant } from "@/pilot/lib/validation/commun";
import { creationReleve, messageConcurrent } from "@/pilot/lib/validation/concurrent";
import { ajouterReleve } from "@/pilot/lib/concurrents/gerer";
import { lireCorps } from "@/pilot/lib/requete";

export async function POST(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = creationReleve.safeParse(await lireCorps(requete));
    if (!analyse.success) throw new ErreurMetier(messageConcurrent(analyse.error), 400);
    const releve = await ajouterReleve(id.data, analyse.data, utilisateur.id);
    return NextResponse.json({ releve }, { status: 201 });
  } catch (erreur) { return reponseErreur(erreur); }
}
