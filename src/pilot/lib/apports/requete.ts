import { NextResponse } from "next/server";
import type { z } from "zod";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { utilisateurCourant } from "@/pilot/lib/session";
import { identifiant } from "@/pilot/lib/validation/commun";
import { messageValidation } from "@/pilot/lib/validation/messages";

type Utilisateur = Awaited<ReturnType<typeof utilisateurCourant>>;

/** Une route de l'apport d'affaires : session, droit, réponse JSON, erreurs métier en 4xx. */
export async function agir(fn: (u: Utilisateur) => Promise<unknown>, autorise: (u: Utilisateur) => boolean = (u) => peutModifierPilot(u.role), statut = 200) {
  try {
    const u = await utilisateurCourant();
    exiger(autorise(u));
    return NextResponse.json(await fn(u), { status: statut });
  } catch (erreur) { return reponseErreur(erreur); }
}

/** Le corps validé, ou une erreur 400 qui dit quel champ corriger. */
export async function corps<T extends z.ZodTypeAny>(requete: Request, schema: T): Promise<z.output<T>> {
  const analyse = schema.safeParse(await requete.json().catch(() => null));
  if (!analyse.success) {
    const message = messageValidation(analyse.error), propre = analyse.error.issues[0]?.message ?? "";
    throw new ErreurMetier(message === "Vérifiez les champs du formulaire." && /^(Le |La |Date|Mois|Chiffres)/.test(propre) ? propre : message, 400);
  }
  return analyse.data;
}

export function idDe(params: { id: string }): number {
  const id = identifiant.safeParse(Number(params.id));
  if (!id.success) throw new ErreurMetier("Identifiant invalide.", 400);
  return id.data;
}
