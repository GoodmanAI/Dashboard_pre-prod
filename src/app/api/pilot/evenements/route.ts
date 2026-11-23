import { NextResponse } from "next/server";
import { prisma } from "@/pilot/lib/prisma";
import { z } from "zod";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutLirePilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { dateValide, identifiant } from "@/pilot/lib/validation/commun";
import { chronologie, ecrireCurseur, lireCurseur, nouveautes } from "@/pilot/lib/evenements/lire";

const Parametres = z.object({
  organisationId: z.string().regex(/^\d+$/).transform(Number).pipe(identifiant).optional(),
  avant: z.string().transform((texte, ctx) => {
    const curseur = lireCurseur(texte);
    if (!curseur) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Curseur invalide." });
    return curseur ?? z.NEVER;
  }).optional(),
  depuis: dateValide.optional(),
  moi: z.literal("1").optional(),
})
  // Une chronologie se lit par curseur, les nouveautés par date : mélanger les
  // deux rendrait un résultat qui ne correspond à aucune des deux questions.
  .refine((p) => (p.organisationId === undefined) !== (p.depuis === undefined))
  .refine((p) => p.avant === undefined || p.organisationId !== undefined || p.avant.nature === "evenement")
  .refine((p) => p.moi === undefined || p.depuis !== undefined);

export const dynamic = "force-dynamic";
export async function GET(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutLirePilot(utilisateur.role));
    const recherche = new URL(requete.url).searchParams;
    const analyse = Parametres.safeParse(Object.fromEntries(recherche));
    if (!analyse.success || ["organisationId", "avant", "depuis", "moi"].some((cle) => recherche.getAll(cle).length > 1)) {
      throw new ErreurMetier("Paramètres de requête invalides.", 400);
    }
    const { organisationId, avant, depuis } = analyse.data;
    if (organisationId !== undefined) {
      const existe = await prisma.crmOrganisation.count({ where: { id: organisationId } });
      if (!existe) throw new ErreurMetier("Organisation inconnue.", 404);
      return NextResponse.json(await chronologie(organisationId, { apres: avant }));
    }
    const liste = await nouveautes({ depuis: depuis!, utilisateurId: analyse.data.moi ? utilisateur.id : undefined, avant, limite: 51 });
    const evenements = liste.slice(0, 50);
    const dernier = evenements.at(-1);
    const suite = liste.length > 50;
    return NextResponse.json({ evenements, suite, curseur: suite && dernier ? ecrireCurseur({ id: dernier.id, nature: "evenement", surveneuLe: dernier.surveneuLe.toISOString() }) : null });
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
