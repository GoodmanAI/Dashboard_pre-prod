import { NextResponse } from "next/server";
import { z } from "zod";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutLirePilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { chercherDoublons } from "@/pilot/lib/prospection/doublons";

export const dynamic = "force-dynamic";
const corps = z.object({ nom: z.string().max(200), ville: z.string().max(200).optional() }).strict();

/** POST et non GET : un nom de cabinet peut être un nom de personne, il ne va dans aucun journal d'accès (C-36, C-65). */
export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutLirePilot(utilisateur.role));
    const analyse = corps.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier("Corps de requête invalide.", 400);
    return NextResponse.json({ doublons: await chercherDoublons(analyse.data.nom, analyse.data.ville) });
  } catch (erreur) {
    // Comme la recherche : aucune erreur imprimée qui pourrait contenir la saisie.
    return NextResponse.json({ erreur: erreur instanceof ErreurMetier ? erreur.message : "La vérification des doublons est indisponible." },
      { status: erreur instanceof ErreurMetier ? erreur.statut : 500 });
  }
}
