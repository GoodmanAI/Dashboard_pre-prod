import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { identifiant } from "@/pilot/lib/validation/commun";
import { forcageTemperature, retraitTemperature } from "@/pilot/lib/validation/temperature";
import { forcerTemperature, libererTemperature } from "@/pilot/lib/organisations/forcerTemperature";

/** Poser ou changer le forçage de la température du dossier. Corps : `{ temperature, forceeLe }`. */
export async function PUT(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = forcageTemperature.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier("Corps de requête invalide.", 400);
    return NextResponse.json({ forcage: await forcerTemperature(id.data, analyse.data, utilisateur.id) });
  } catch (erreur) { return reponseErreur(erreur); }
}

/** Retirer le forçage : le dossier reprend sa température calculée. Corps facultatif : `{ forceeLe }`. */
export async function DELETE(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const texte = await requete.text();
    let corps: unknown = {};
    if (texte.trim()) { try { corps = JSON.parse(texte); } catch { corps = null; } }
    const analyse = retraitTemperature.safeParse(corps);
    if (!analyse.success) throw new ErreurMetier("Corps de requête invalide.", 400);
    return NextResponse.json({ forcage: await libererTemperature(id.data, analyse.data, utilisateur.id) });
  } catch (erreur) { return reponseErreur(erreur); }
}
