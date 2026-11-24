import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { identifiant } from "@/pilot/lib/validation/commun";
import { operationAttente } from "@/pilot/lib/validation/attente";
import { declarerAttente, leverAttente, relancer } from "@/pilot/lib/checklist/attentes";

export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = operationAttente.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier("Vérifiez le tiers et les dates de l'attente.", 400);
    const p = analyse.data;
    const etape = p.operation === "declarer" ? await declarerAttente(id.data, p, utilisateur.id)
      : p.operation === "relancer" ? await relancer(id.data, utilisateur.id) : await leverAttente(id.data, utilisateur.id);
    return NextResponse.json({ etape });
  } catch (erreur) { return reponseErreur(erreur); }
}
