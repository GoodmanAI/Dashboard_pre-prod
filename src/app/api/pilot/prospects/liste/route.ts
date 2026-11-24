import { NextResponse } from "next/server";
import { z } from "zod";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutLirePilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { chargerProspection } from "@/pilot/lib/prospection/charger";

export const dynamic = "force-dynamic";
const champ = z.string().max(200).optional();
const corps = z.object({ q: champ, region: champ, type: champ, ris: champ, rdv: champ, priorite: champ, etat: champ,
  responsable: champ, origine: champ, page: champ, temperature: champ, tri: champ }).strict();

/** La vue « À prospecter » (C-65). POST : le texte cherché ne passe jamais par l'URL (C-36). */
export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutLirePilot(utilisateur.role));
    const analyse = corps.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier("Corps de requête invalide.", 400);
    return NextResponse.json(await chargerProspection(analyse.data, utilisateur.id));
  } catch (erreur) {
    return NextResponse.json({ erreur: erreur instanceof ErreurMetier ? erreur.message : "La liste est indisponible. Réessayez." },
      { status: erreur instanceof ErreurMetier ? erreur.statut : 500 });
  }
}
