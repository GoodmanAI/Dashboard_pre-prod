import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { changementMotDePasse, messageAcces } from "@/pilot/lib/validation/acces";
import { changerMonMotDePasse } from "@/pilot/lib/acces/comptes";

/** Chacun change son propre mot de passe, en donnant l'actuel (C-64). */
export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    const analyse = changementMotDePasse.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageAcces(analyse.error), 400);
    await changerMonMotDePasse(utilisateur.id, analyse.data);
    return NextResponse.json({ ok: true });
  } catch (erreur) { return reponseErreur(erreur); }
}
