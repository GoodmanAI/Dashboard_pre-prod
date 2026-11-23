import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutLirePilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { identifiant } from "@/pilot/lib/validation/commun";
import { marquerLu } from "@/pilot/lib/commentaires/gerer";

/** Marquer lu un commentaire qui vous prévenait (lot T). Sans effet s'il l'est déjà. Refusé si vous n'étiez pas prévenu. */
export async function POST(_requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutLirePilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    return NextResponse.json(await marquerLu(id.data, utilisateur));
  } catch (erreur) { return reponseErreur(erreur); }
}
