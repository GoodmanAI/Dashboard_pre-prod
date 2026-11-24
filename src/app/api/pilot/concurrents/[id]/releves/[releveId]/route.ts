import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { identifiant } from "@/pilot/lib/validation/commun";
import { messageConcurrent, modificationReleve, suppressionReleve } from "@/pilot/lib/validation/concurrent";
import { modifierReleve, supprimerReleve } from "@/pilot/lib/concurrents/gerer";
import { lireCorps } from "@/pilot/lib/requete";

type Params = { params: { id: string; releveId: string } };
function lireIds({ id, releveId }: Params["params"]) {
  const concurrent = identifiant.safeParse(Number(id)), releve = identifiant.safeParse(Number(releveId));
  if (!concurrent.success || !releve.success) throw new ErreurMetier("Identifiant invalide.", 400);
  return { concurrentId: concurrent.data, releveId: releve.data };
}

/** Corriger un relevé. Corps : `majLe` lu par l'écran et les seuls champs modifiés ; 409 si le relevé a changé depuis. */
export async function PATCH(requete: Request, { params }: Params) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const ids = lireIds(params);
    const analyse = modificationReleve.safeParse(await lireCorps(requete));
    if (!analyse.success) throw new ErreurMetier(messageConcurrent(analyse.error), 400);
    const releve = await modifierReleve(ids.concurrentId, ids.releveId, analyse.data, utilisateur.id);
    return NextResponse.json({ releve });
  } catch (erreur) { return reponseErreur(erreur); }
}

/** Supprimer un relevé. Corps facultatif : `{ majLe }`, la version lue ; 409 si le relevé a changé depuis. */
export async function DELETE(requete: Request, { params }: Params) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const ids = lireIds(params);
    const texte = await requete.text();
    let corps: unknown = {};
    if (texte.trim()) { try { corps = JSON.parse(texte); } catch { corps = null; } }
    const analyse = suppressionReleve.safeParse(corps);
    if (!analyse.success) throw new ErreurMetier(messageConcurrent(analyse.error), 400);
    await supprimerReleve(ids.concurrentId, ids.releveId, analyse.data, utilisateur.id);
    return NextResponse.json({ supprime: true });
  } catch (erreur) { return reponseErreur(erreur); }
}
