import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutLirePilot, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { identifiant } from "@/pilot/lib/validation/commun";
import { messageCommentaire, nouveauCommentaire } from "@/pilot/lib/validation/commentaire";
import { chargerCommentaire, chargerFil, lireCurseurCommentaires } from "@/pilot/lib/commentaires/charger";
import { ecrireCommentaire } from "@/pilot/lib/commentaires/gerer";
import { CORPS_MAXIMUM, lireJsonBorne } from "@/pilot/lib/requete";

// Un commentaire tient en 10 000 unités brutes au plus : les 64 Kio de `CORPS_MAXIMUM` laissent toute la marge du JSON et de ses échappements.

export const dynamic = "force-dynamic";

/**
 * Le fil de commentaires d'un client, du plus récent au plus ancien (lot T).
 * `?avant=` : le curseur rendu par la page précédente. Chaque ligne dit, pour
 * l'utilisateur courant, s'il a été prévenu et s'il l'a lu.
 */
export async function GET(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutLirePilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const avant = new URL(requete.url).searchParams.get("avant");
    const curseur = lireCurseurCommentaires(avant);
    if (avant && !curseur) throw new ErreurMetier("Page inconnue. Rechargez la page.", 400);
    return NextResponse.json(await chargerFil(id.data, utilisateur, curseur), { headers: { "Cache-Control": "no-store" } });
  } catch (erreur) { return reponseErreur(erreur); }
}

/**
 * Écrire un commentaire sur un client, avec ou sans alerte (lot T). Corps :
 * `{ texte, cible?, departement?, personneId? }`. La réponse dit combien de
 * personnes sont prévenues. Un corps de plus de 64 Kio est refusé (413) avant
 * d'être lu en entier.
 */
export async function POST(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = nouveauCommentaire.safeParse(await lireJsonBorne(requete, CORPS_MAXIMUM));
    if (!analyse.success) throw new ErreurMetier(messageCommentaire(analyse.error), 400);
    const { id: commentaireId, destinataires } = await ecrireCommentaire(id.data, analyse.data, utilisateur);
    // Null si le commentaire a été supprimé entre son écriture et sa relecture : l'écran le dit sans l'ajouter au fil.
    return NextResponse.json({ commentaire: await chargerCommentaire(commentaireId, utilisateur), destinataires }, { status: 201 });
  } catch (erreur) { return reponseErreur(erreur); }
}
