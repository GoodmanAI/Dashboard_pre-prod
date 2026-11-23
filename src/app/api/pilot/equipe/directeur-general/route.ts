import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutGererComptes } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { designationDirecteur } from "@/pilot/lib/validation/attribution";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { designerDirecteurGeneral } from "@/pilot/lib/alertes/attribuer";

/**
 * Désigne le directeur général (C-91) : toute alerte lui va d'office.
 * Corps : `{ userId, majLe }`, `majLe` étant la version lue par l'écran Équipe
 * (null tant que personne n'est désigné). Le super-administrateur seul.
 */
export async function PUT(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutGererComptes(utilisateur.role), "Seul le super-administrateur désigne le directeur général.");
    const analyse = designationDirecteur.safeParse(await requete.json().catch(() => null));
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    return NextResponse.json(await designerDirecteurGeneral(analyse.data, utilisateur.id), { headers: { "Cache-Control": "no-store" } });
  } catch (erreur) { return reponseErreur(erreur); }
}
