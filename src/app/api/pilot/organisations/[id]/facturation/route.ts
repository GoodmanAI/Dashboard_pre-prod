import { NextResponse } from "next/server";
import { z } from "zod";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutVoirCa, peutModifierLesMontants } from "@/pilot/lib/autorisations";
import { reponseErreur } from "@/pilot/lib/http";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { dateValide, identifiant, auMoinsUnChamp } from "@/pilot/lib/validation/commun";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { chargerFacturation } from "@/pilot/lib/facturation/charger";
import { modifierFormationPoc } from "@/pilot/lib/facturation/gerer";
export const dynamic = "force-dynamic";

const modification = z.object({ montantCentimes: z.number().int().min(0).max(2147483647).optional(), factureEmiseLe: dateValide.optional() }).strict().refine(auMoinsUnChamp, "Renseignez un prix ou une date de facture.");
function lireId(texte: string) {
  const id = identifiant.safeParse(Number(texte));
  if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
  return id.data;
}
export async function GET(_requete: Request, { params }: { params: { id: string } }) {
  try {
    const acteur = await utilisateurCourant();
    exiger(peutVoirCa(acteur));
    return NextResponse.json({ facturation: await chargerFacturation(lireId(params.id), acteur) });
  } catch (e) { return reponseErreur(e); }
}
export async function PATCH(requete: Request, { params }: { params: { id: string } }) {
  try {
    const acteur = await utilisateurCourant();
    exiger(peutVoirCa(acteur) && peutModifierLesMontants(acteur));
    const id = lireId(params.id);
    const p = modification.safeParse(await requete.json().catch(() => null));
    if (!p.success) throw new ErreurMetier(messageValidation(p.error), 400);
    return NextResponse.json(await modifierFormationPoc(id, p.data, acteur));
  } catch (e) { return reponseErreur(e); }
}
