import type { CrmOrganisation, CrmIssueCyclePoc, Prisma } from "@prisma/client";
import { journaliser } from "@/pilot/lib/evenements/journaliser";

/** L'appelant tient le verrou de l'organisation, partagé avec prolongerPoc. */
export async function cyclePocOuvert(tx: Prisma.TransactionClient, org: Pick<CrmOrganisation, "pocCycleId">): Promise<boolean> {
  return !!org.pocCycleId && !await tx.crmCyclePoc.findUnique({ where: { id: org.pocCycleId }, select: { id: true } });
}

export function donneesCycleClos(org: Pick<CrmOrganisation, "id" | "pocCycleId" | "pocDebuteLe" | "pocProlongeLe">,
  issue: CrmIssueCyclePoc, decideLe: Date) {
  if (!org.pocCycleId || !org.pocDebuteLe) throw new Error("Cycle de POC sans identifiant ou sans début.");
  return { id: org.pocCycleId, organisationId: org.id, debuteLe: org.pocDebuteLe,
    prolongeLe: org.pocProlongeLe, issue, decideLe };
}

/** Une seule insertion par UUID, au moment de la décision, dans sa transaction. */
export async function cloreCyclePoc(tx: Prisma.TransactionClient, org: CrmOrganisation, issue: CrmIssueCyclePoc, decideLe: Date, auteurId: number) {
  const cycle = donneesCycleClos(org, issue, decideLe);
  await tx.crmCyclePoc.create({ data: cycle });
  await journaliser(tx, { type: "CYCLE_POC_CLOS", organisationId: org.id, auteurId,
    resume: "Cycle de POC clos", apres: cycle, surveneuLe: decideLe });
}
