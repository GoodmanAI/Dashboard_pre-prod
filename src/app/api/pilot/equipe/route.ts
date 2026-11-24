import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutGererComptes } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { creationCompte, messageAcces } from "@/pilot/lib/validation/acces";
import { creerCompte } from "@/pilot/lib/acces/comptes";

/** Crée un compte de l'équipe (C-64). La réponse porte le mot de passe provisoire, une seule fois : jamais en cache. */
export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutGererComptes(utilisateur), "Seul un administrateur de Pilot crée les comptes.");
    const analyse = creationCompte.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageAcces(analyse.error), 400);
    const { id, motDePasse } = await creerCompte(analyse.data, utilisateur);
    return NextResponse.json({ compte: { id }, motDePasse }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (erreur) { return reponseErreur(erreur); }
}
