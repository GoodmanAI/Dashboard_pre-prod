import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { identifiant } from "@/pilot/lib/validation/commun";
import { operationDemande } from "@/pilot/lib/validation/demande";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { annulerDemande, traiterDemande } from "@/pilot/lib/demandes/gerer";

/** Marquer une demande faite (destinataire) ou l'annuler (demandeur). Un super-administrateur peut les deux. */
export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = operationDemande.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    const demande = analyse.data.operation === "faite"
      ? await traiterDemande(id.data, analyse.data.reponse ?? null, utilisateur)
      : await annulerDemande(id.data, utilisateur);
    return NextResponse.json({ demande });
  } catch (erreur) { return reponseErreur(erreur); }
}
