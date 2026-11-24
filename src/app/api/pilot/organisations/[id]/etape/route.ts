import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutChangerEtape, peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { changementEtape, GAGNANT_SANS_MOTIF } from "@/pilot/lib/validation/organisation";
import { identifiant } from "@/pilot/lib/validation/commun";
import { changerEtape } from "@/pilot/lib/organisations/changerEtape";

export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutChangerEtape(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = changementEtape.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(analyse.error.issues[0]?.message === GAGNANT_SANS_MOTIF ? GAGNANT_SANS_MOTIF : "Corps de requête invalide.", 400);
    // Terminer un contrat touche aux montants : même droit que l'onglet Argent.
    if (analyse.data.terminerContrats) exiger(peutModifierLesMontants(utilisateur), "Terminer les contrats demande le droit « Modifier les montants ».");
    const organisation = await changerEtape({
      organisationId: id.data, vers: analyse.data.etape,
      raisonSortie: analyse.data.raisonSortie, auteurId: utilisateur.id,
      raisonSortieCode: analyse.data.raisonSortieCode, reveilLe: analyse.data.reveilLe, concurrentGagnantId: analyse.data.concurrentGagnantId,
      terminerContrats: analyse.data.terminerContrats, pocDebuteLe: analyse.data.pocDebuteLe,
    });
    return NextResponse.json({ organisation });
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
