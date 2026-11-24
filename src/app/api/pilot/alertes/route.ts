import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutLirePilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { calculerAlertesDuParc } from "@/pilot/lib/alertes";
import { filtresAlertes, filtrerAlertes } from "@/pilot/lib/alertes/filtres";
export const dynamic = "force-dynamic";

export async function GET(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutLirePilot(utilisateur.role));
    const analyse = filtresAlertes.safeParse(Object.fromEntries(new URL(requete.url).searchParams));
    if (!analyse.success) throw new ErreurMetier("Vérifiez les filtres des alertes.", 400);
    const filtres = analyse.data;
    return NextResponse.json(filtrerAlertes(await calculerAlertesDuParc({ organisationId: filtres.organisationId,
      utilisateurId: filtres.moi === "1" ? utilisateur.id : undefined }), filtres));
  } catch (erreur) { return reponseErreur(erreur); }
}
