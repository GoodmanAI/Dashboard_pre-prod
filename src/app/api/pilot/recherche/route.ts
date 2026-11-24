import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutLirePilot } from "@/pilot/lib/autorisations";
import { rechercher } from "@/pilot/lib/recherche";

export const dynamic = "force-dynamic";
/** POST et non GET : le texte saisi peut être un nom, il ne doit finir dans aucun journal d'accès (CHOIX.md, C-36). */
export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutLirePilot(utilisateur.role));
    const corps: unknown = await requete.json().catch(() => null);
    const q = corps && typeof corps === "object" && "q" in corps && typeof corps.q === "string" ? corps.q : "";
    return NextResponse.json(await rechercher(q));
  } catch (erreur) {
    // Ne jamais laisser Next imprimer une erreur susceptible de contenir la requête.
    const { ErreurMetier } = await import("@/pilot/lib/erreurs");
    return NextResponse.json({ erreur: erreur instanceof ErreurMetier ? erreur.message : "La recherche est indisponible. Réessayez." },
      { status: erreur instanceof ErreurMetier ? erreur.statut : 500 });
  }
}
