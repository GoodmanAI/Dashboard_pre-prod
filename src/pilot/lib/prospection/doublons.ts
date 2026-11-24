import { prisma } from "@/pilot/lib/prisma";
import { LIBELLES } from "@/pilot/lib/pipeline";
import { motsSignificatifs, scoreDoublon, SEUIL_DOUBLON } from "./regles";

export type Doublon = { id: number; nom: string; ville: string | null; etape: string };

/**
 * Les établissements déjà dans Pilot qui ressemblent à la saisie (C-65). Les
 * noms sont comparés sans accents, en JavaScript : quelques centaines de lignes,
 * et aucune extension PostgreSQL à installer.
 */
export async function chercherDoublons(nom: string, ville?: string | null, limite = 5): Promise<Doublon[]> {
  if (!motsSignificatifs(nom).length && nom.trim().length < 3) return [];
  const organisations = await prisma.crmOrganisation.findMany({
    select: { id: true, raisonSocialeNom: true, etape: true, centres: { select: { ville: true }, orderBy: { id: "asc" } } },
  });
  return organisations
    .map((o) => ({ o, score: scoreDoublon({ nom, ville }, { nom: o.raisonSocialeNom, villes: o.centres.map((c) => c.ville) }) }))
    .filter(({ score }) => score >= SEUIL_DOUBLON)
    .sort((a, b) => b.score - a.score || a.o.raisonSocialeNom.localeCompare(b.o.raisonSocialeNom, "fr"))
    .slice(0, limite)
    .map(({ o }) => ({ id: o.id, nom: o.raisonSocialeNom, ville: o.centres[0]?.ville ?? null, etape: LIBELLES[o.etape] }));
}
