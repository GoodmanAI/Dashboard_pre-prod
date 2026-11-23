import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutGererComptes } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { identifiant } from "@/pilot/lib/validation/commun";
import { messageCommentaire, modificationDepartement } from "@/pilot/lib/validation/commentaire";
import { changerDepartement } from "@/pilot/lib/acces/comptes";

/**
 * Le département d'un compte de l'équipe, super-administrateur compris (lot T).
 * Corps : `{ departement, majLe }`, `majLe` étant la version lue par l'écran
 * Équipe (null tant que le compte n'a pas de département). Le super-administrateur seul.
 */
export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutGererComptes(utilisateur.role), "Seul le super-administrateur choisit les départements.");
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = modificationDepartement.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageCommentaire(analyse.error), 400);
    return NextResponse.json(await changerDepartement(id.data, analyse.data, utilisateur.id), { headers: { "Cache-Control": "no-store" } });
  } catch (erreur) { return reponseErreur(erreur); }
}
