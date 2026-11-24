import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutLirePilot, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { identifiant } from "@/pilot/lib/validation/commun";
import { messageConcurrent, modificationConcurrent } from "@/pilot/lib/validation/concurrent";
import { modifierConcurrent, supprimerConcurrent } from "@/pilot/lib/concurrents/gerer";
import { lireConcurrent } from "@/pilot/lib/concurrents/lire";
import { lireCorps } from "@/pilot/lib/requete";

export const dynamic = "force-dynamic";

function lireId(valeur: string): number {
  const id = identifiant.safeParse(Number(valeur));
  if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
  return id.data;
}

export async function GET(_requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutLirePilot(utilisateur.role));
    return NextResponse.json({ concurrent: await lireConcurrent(lireId(params.id)) });
  } catch (erreur) { return reponseErreur(erreur); }
}

export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const id = lireId(params.id);
    const analyse = modificationConcurrent.safeParse(await lireCorps(requete));
    if (!analyse.success) throw new ErreurMetier(messageConcurrent(analyse.error), 400);
    const concurrent = await modifierConcurrent(id, analyse.data, utilisateur.id);
    return NextResponse.json({ concurrent });
  } catch (erreur) { return reponseErreur(erreur); }
}

export async function DELETE(_requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    await supprimerConcurrent(lireId(params.id), utilisateur.id);
    return NextResponse.json({ supprime: true });
  } catch (erreur) { return reponseErreur(erreur); }
}
