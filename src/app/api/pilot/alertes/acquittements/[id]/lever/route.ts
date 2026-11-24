import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutAcquitter } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { identifiant } from "@/pilot/lib/validation/commun";
import { lever } from "@/pilot/lib/alertes/acquitter";

export async function POST(_requete: Request, { params }: { params: { id: string } }) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutAcquitter(utilisateur.role));
    const id = identifiant.safeParse(Number(params.id));
    if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
    return NextResponse.json({ acquittement: await lever(id.data, utilisateur.id) });
  } catch (erreur) { return reponseErreur(erreur); }
}
