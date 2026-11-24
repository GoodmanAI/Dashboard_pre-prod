import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { creationVersion } from "@/pilot/lib/validation/proposition";
import { creerVersionDetaillee } from "@/pilot/lib/propositions/creerVersion";
import { RefusPreremplissage } from "@/pilot/lib/propositions/lignesPreremplies";
import { lireCorps } from "@/pilot/lib/requete";

/**
 * Une nouvelle version : vide ou reprise de la précédente, ou préremplie depuis
 * la grille en vigueur (`{ "preremplir": true }`). Dans ce cas la réponse porte
 * aussi `preremplissage` : la grille, les remarques (pourquoi une ligne manque)
 * et les lignes dont le prix est à renseigner. Si la grille ne donne aucune
 * ligne, rien n'est créé : 400, avec `remarques`.
 */
export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierLesMontants(utilisateur));
    const analyse = creationVersion.safeParse(await lireCorps(requete));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    const { proposition, preremplissage } = await creerVersionDetaillee(analyse.data, utilisateur.id);
    return NextResponse.json({ proposition, ...(preremplissage ? { preremplissage } : {}) }, { status: 201 });
  } catch (erreur) {
    if (erreur instanceof RefusPreremplissage) return NextResponse.json({ erreur: erreur.message, remarques: erreur.remarques }, { status: 400 });
    return reponseErreur(erreur);
  }
}
