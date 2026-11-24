import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { identifiant } from "@/pilot/lib/validation/commun";
import { preremplissageVersion } from "@/pilot/lib/validation/proposition";
import { RefusPreremplissage } from "@/pilot/lib/propositions/lignesPreremplies";
import { preremplirVersion } from "@/pilot/lib/propositions/preremplirVersion";

/**
 * Repréremplir une version en brouillon depuis la grille en vigueur (lot S).
 * Le corps porte la version lue : `{ "majLe": "…" }`. La réponse porte la
 * version et `preremplissage` (grille, remarques, lignes à renseigner). Si la
 * grille ne donne aucune ligne : 400, `remarques` en plus, rien n'est écrit.
 */
export async function POST(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierLesMontants(utilisateur));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = preremplissageVersion.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    return NextResponse.json(await preremplirVersion(id.data, analyse.data, utilisateur.id));
  } catch (erreur) {
    if (erreur instanceof RefusPreremplissage) return NextResponse.json({ erreur: erreur.message, remarques: erreur.remarques }, { status: 400 });
    return reponseErreur(erreur);
  }
}
