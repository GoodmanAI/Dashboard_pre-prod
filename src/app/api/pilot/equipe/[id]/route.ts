import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutGererComptes } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { identifiant } from "@/pilot/lib/validation/commun";
import { messageAcces, operationAcces } from "@/pilot/lib/validation/acces";
import { agirSurAcces } from "@/pilot/lib/acces/comptes";

/** Rôle et droits, retrait, retour, mot de passe provisoire d'un compte de l'équipe (C-64). */
export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutGererComptes(utilisateur.role), "Seul le super-administrateur donne les droits.");
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = operationAcces.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageAcces(analyse.error), 400);
    return NextResponse.json(await agirSurAcces(id.data, analyse.data, utilisateur.id), { headers: { "Cache-Control": "no-store" } });
  } catch (erreur) { return reponseErreur(erreur); }
}
