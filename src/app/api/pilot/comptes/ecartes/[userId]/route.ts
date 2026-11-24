import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { identifiant } from "@/pilot/lib/validation/commun";
import { reafficherCompte } from "@/pilot/lib/reprise/reprendre";

/** Réaffiche un compte écarté : il revient dans la liste des comptes à relier. */
export async function DELETE(_requete: Request, { params }: { params: { userId: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const userId = identifiant.safeParse(Number(params.userId));
    if (!userId.success) throw new ErreurMetier("Identifiant invalide.", 400);
    await reafficherCompte(userId.data, utilisateur.id);
    return NextResponse.json({ reaffiche: true });
  } catch (erreur) { return reponseErreur(erreur); }
}
