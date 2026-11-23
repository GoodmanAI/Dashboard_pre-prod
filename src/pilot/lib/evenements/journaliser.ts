import type { CrmTypeEvenement, Prisma } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";

/**
 * resume est une phrase affichable et loggée : jamais de compte rendu, de nom
 * de contact ni de commentaire d'étape. avant/apres restent uniquement en base.
 * Les mutations utilisent transactionJournalisee pour ne publier l'audit
 * qu'après le commit, jamais pour une transaction annulée.
 */
export type EvenementAJournaliser = {
  type: CrmTypeEvenement;
  resume: string;
  auteurId: number | null;
  organisationId?: number;
  centreId?: number;
  centreProduitId?: number;
  etapeIntegrationId?: number;
  echangeId?: number;
  propositionId?: number;
  contratId?: number;
  opportuniteId?: number;
  avant?: Record<string, unknown>;
  apres?: Record<string, unknown>;
  /** Réservé au seed et à l'import. */
  surveneuLe?: Date;
};

const audits = new WeakMap<Prisma.TransactionClient, string[]>();

/** Liste blanche volontaire : aucun objet métier n'est étalé dans stdout. */
export function ligneAudit(e: EvenementAJournaliser, ts: Date): string {
  return JSON.stringify({
    niveau: "audit",
    type: e.type,
    organisationId: e.organisationId ?? null,
    auteurId: e.auteurId,
    resume: e.resume,
    ts: ts.toISOString(),
  });
}

export async function journaliser(
  tx: Prisma.TransactionClient,
  e: EvenementAJournaliser,
): Promise<void> {
  const surveneuLe = e.surveneuLe ?? new Date();
  // Le passage JSON normalise aussi les Date des instantanés en chaînes ISO.
  const json = (valeur: Record<string, unknown> | undefined) =>
    valeur === undefined ? undefined : JSON.parse(JSON.stringify(valeur)) as Prisma.InputJsonObject;
  await tx.crmEvenement.create({
    data: { ...e, avant: json(e.avant), apres: json(e.apres), surveneuLe },
  });
  const ligne = ligneAudit(e, surveneuLe);
  const collecte = audits.get(tx);
  if (collecte) collecte.push(ligne);
  else console.log(ligne);
}

export async function transactionJournalisee<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { timeout?: number; maxWait?: number },
): Promise<T> {
  const lignes: string[] = [];
  const resultat = await prisma.$transaction(async (tx) => {
    audits.set(tx, lignes);
    try {
      return await fn(tx);
    } finally {
      audits.delete(tx);
    }
  }, options);
  for (const ligne of lignes) console.log(ligne);
  return resultat;
}
