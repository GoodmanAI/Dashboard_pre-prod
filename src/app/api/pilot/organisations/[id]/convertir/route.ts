import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutChangerEtape, peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { identifiant } from "@/pilot/lib/validation/commun";
import { conversionClient, SIGNATURE_FUTURE } from "@/pilot/lib/validation/conversion";
import { convertirAvecContrat } from "@/pilot/lib/organisations/convertir";

/**
 * Convertir en client sans proposition : un contrat en brouillon daté, puis
 * chaque étape jusqu'à Signé, en une transaction. Le changement d'étape et la
 * création de contrat sont réunis : il faut les deux droits, dont celui de
 * modifier les montants, comme `POST /api/pilot/contrats`.
 */
export async function POST(requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutChangerEtape(utilisateur.role) && peutModifierLesMontants(utilisateur));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    const analyse = conversionClient.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) {
      const futur = analyse.error.issues.some((i) => i.message === SIGNATURE_FUTURE);
      throw new ErreurMetier(futur ? SIGNATURE_FUTURE : messageValidation(analyse.error), 400);
    }
    const resultat = await convertirAvecContrat(id.data, analyse.data, utilisateur.id);
    return NextResponse.json(resultat, { status: 201 });
  } catch (erreur) { return reponseErreur(erreur); }
}
