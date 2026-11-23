import { grillePourActeur } from "@/pilot/lib/tarifs/confidentialite";
import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutVoirCa, peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { identifiant } from "@/pilot/lib/validation/commun";
import { creationTarif, messageTarif } from "@/pilot/lib/validation/tarif";
import { ajouterTarif } from "@/pilot/lib/tarifs/gerer";
import { lireCorps } from "@/pilot/lib/requete";

export async function POST(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierLesMontants(utilisateur));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = creationTarif.safeParse(await lireCorps(requete));
    if (!analyse.success) throw new ErreurMetier(messageTarif(analyse.error), 400);
    exiger(analyse.data.role !== "FORMATION_POC" || peutVoirCa(utilisateur));
    const { tarifId, grille } = await ajouterTarif(id.data, analyse.data, utilisateur.id);
    return NextResponse.json({ tarifId, grille: grillePourActeur(grille, utilisateur) }, { status: 201 });
  } catch (erreur) { return reponseErreur(erreur); }
}
