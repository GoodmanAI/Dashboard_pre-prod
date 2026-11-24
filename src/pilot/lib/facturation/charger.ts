import { prisma } from "@/pilot/lib/prisma";
import { peutVoirCa, type Acteur } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { calendrierFacturation, type CycleFacturation, type FormationFacturation } from "./calendrier";
import { decalerMois, type ContratProjection } from "@/pilot/lib/ca/projeter";

type CycleLu = { organisationId: number; id: string | null; debuteLe: Date | null; prolongeLe: Date | null };
type FormationLue = FormationFacturation & { cleDejaFigee: boolean };
type ContratLu = Omit<ContratProjection, "lignes"> & { id: number; ligneId: number | null; type: ContratProjection["lignes"][number]["type"] | null; montantCentimes: number | null };

/** Trois lectures SQL fixes. Garde avant toute lecture des nouvelles données C-95. */
export async function chargerFacturation(organisationId: number, acteur: Acteur, maintenant = new Date()) {
  if (!peutVoirCa(acteur)) return null;
  const [cyclesLus, formations, lignes] = await Promise.all([
    prisma.$queryRaw<CycleLu[]>`SELECT o.id AS "organisationId", o."pocCycleId" AS id, o."pocDebuteLe" AS "debuteLe", o."pocProlongeLe" AS "prolongeLe"
      FROM "CrmOrganisation" o WHERE o.id = ${organisationId}
      UNION ALL SELECT c."organisationId", c.id, c."debuteLe", c."prolongeLe" FROM "CrmCyclePoc" c WHERE c."organisationId" = ${organisationId}`,
    prisma.$queryRaw<FormationLue[]>`SELECT f."cycleId", f."debuteLe", f."grilleId", f."montantCentimes", f."factureEmiseLe", f."comptabiliseeLe",
      EXISTS(SELECT 1 FROM "CrmCaMensuel" m WHERE m.cle = to_char(f."debuteLe", 'YYYY-MM') || '|' || f."organisationId"::text || '|0|0') AS "cleDejaFigee"
      FROM "CrmFormationPoc" f WHERE f."organisationId" = ${organisationId}`,
    prisma.$queryRaw<ContratLu[]>`SELECT c.id, c.statut, c."debuteLe", c."signeLe", c."termineLe", l.id AS "ligneId", l.type, l."montantCentimes"
      FROM "CrmContrat" c LEFT JOIN "CrmLigneContrat" l ON l."contratId" = c.id
      WHERE c."organisationId" = ${organisationId} ORDER BY c.id, l.id`,
  ]);
  if (!cyclesLus.length) throw new ErreurMetier("Dossier inconnu.", 404);
  const cycles: CycleFacturation[] = cyclesLus.flatMap((c) => c.id && c.debuteLe ? [{ id: c.id, debuteLe: c.debuteLe, prolongeLe: c.prolongeLe }] : []);
  const contrats = new Map<number, ContratProjection>();
  for (const l of lignes) {
    let c = contrats.get(l.id);
    if (!c) contrats.set(l.id, c = { statut: l.statut, debuteLe: l.debuteLe, signeLe: l.signeLe, termineLe: l.termineLe, lignes: [] });
    if (l.ligneId !== null && l.type && l.montantCentimes !== null) c.lignes.push({ id: l.ligneId, type: l.type, montantCentimes: l.montantCentimes });
  }
  const formation = formations[0] ?? null;
  const dates = [maintenant, ...cycles.map((c) => c.debuteLe), ...lignes.flatMap((c) => c.debuteLe ?? c.signeLe ?? [])];
  const depart = decalerMois(new Date(Math.min(...dates.map(Number))), 0);
  const fin = decalerMois(maintenant, 12);
  const nbMois = (fin.getUTCFullYear() - depart.getUTCFullYear()) * 12 + fin.getUTCMonth() - depart.getUTCMonth();
  const mois = calendrierFacturation({ cycles, formation, contrats: [...contrats.values()], moisDepart: depart, nbMois, maintenant, cleFormationDejaFigee: formation?.cleDejaFigee });
  return { formation: formation ? { cycleId: formation.cycleId, debuteLe: formation.debuteLe.toISOString(), montantCentimes: formation.montantCentimes,
    factureEmiseLe: formation.factureEmiseLe?.toISOString() ?? null } : null,
    formationAbsente: cycles.length > 0 && !formation,
    mois: mois.map((m) => ({ ...m, mois: m.mois.toISOString(), lignes: m.lignes.map((l) => ({ ...l, debuteLe: l.debuteLe.toISOString(), termineLe: l.termineLe?.toISOString() ?? null })) })) };
}
export type FacturationVue = NonNullable<Awaited<ReturnType<typeof chargerFacturation>>>;
