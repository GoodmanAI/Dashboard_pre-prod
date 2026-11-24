import { grillePourActeur } from "@/pilot/lib/tarifs/confidentialite";
import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutLirePilot, peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { creationGrille, messageTarif } from "@/pilot/lib/validation/tarif";
import { creerGrille } from "@/pilot/lib/tarifs/gerer";
import { listerGrilles } from "@/pilot/lib/tarifs/lire";
import { lireCorps } from "@/pilot/lib/requete";

export const dynamic = "force-dynamic";

/** Tout compte de l'équipe lit les grilles : en vigueur, passées, à venir, avec leurs tarifs et leur usage. */
export async function GET() {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutLirePilot(utilisateur.role));
    return NextResponse.json({ grilles: (await listerGrilles()).map((g) => grillePourActeur(g, utilisateur)) });
  } catch (erreur) { return reponseErreur(erreur); }
}

/** Créer une grille datée, vide ou copiée d'une grille existante. Droit « Modifier les montants », relu à chaque appel. */
export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierLesMontants(utilisateur));
    const analyse = creationGrille.safeParse(await lireCorps(requete));
    if (!analyse.success) throw new ErreurMetier(messageTarif(analyse.error), 400);
    const grille = await creerGrille(analyse.data, utilisateur.id);
    return NextResponse.json({ grille: grillePourActeur(grille, utilisateur) }, { status: 201 });
  } catch (erreur) { return reponseErreur(erreur); }
}
