import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { identifiant } from "@/pilot/lib/validation/commun";
import { supprimerCommentaire } from "@/pilot/lib/commentaires/gerer";

/** Supprimer un commentaire (lot T) : son auteur, ou un super-administrateur. Le texte disparaît avec ses destinataires. */
export async function DELETE(_requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    await supprimerCommentaire(id.data, utilisateur);
    return NextResponse.json({ supprime: true });
  } catch (erreur) { return reponseErreur(erreur); }
}
