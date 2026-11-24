import { NextResponse } from "next/server";
import { z } from "zod";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { lireCorps } from "@/pilot/lib/requete";
import { prisma } from "@/pilot/lib/prisma";
import { lireEntreprise } from "@/pilot/lib/annuaire/service";
import { rapprochements } from "@/pilot/lib/annuaire/appliquer";

export const dynamic = "force-dynamic";
const demande = z.object({ siren: z.string().regex(/^\d{9}$/), organisationId: z.number().int().positive().optional() }).strict();

/**
 * Une entreprise relue par son SIREN, avec tous ses établissements ouverts
 * (C-89). Pour une fiche existante, dit aussi quels centres déjà saisis
 * correspondent à quel établissement, et lesquels ont déjà leur SIRET.
 */
export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const analyse = demande.safeParse(await lireCorps(requete));
    if (!analyse.success) throw new ErreurMetier("Corps de requête invalide.", 400);
    const entreprise = await lireEntreprise(analyse.data.siren);
    if (analyse.data.organisationId === undefined) return NextResponse.json({ entreprise, rapprochements: {}, dejaSaisis: [] });
    const centres = await prisma.crmCentre.findMany({ where: { organisationId: analyse.data.organisationId },
      select: { id: true, nom: true, codePostal: true, adresse: true, siret: true } });
    return NextResponse.json({ entreprise, rapprochements: rapprochements(entreprise, centres),
      dejaSaisis: centres.filter((c) => c.siret).map((c) => ({ siret: c.siret, nom: c.nom })), centres: centres.map((c) => ({ id: c.id, nom: c.nom })) });
  } catch (erreur) { return reponseErreur(erreur); }
}
