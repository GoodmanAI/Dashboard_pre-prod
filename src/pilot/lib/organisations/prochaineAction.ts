import type { CrmEchange, Prisma } from "@prisma/client";
import type { z } from "zod";
import type { suiteAction } from "@/pilot/lib/validation/echange";
import { LIBELLES_ECHANGE } from "@/pilot/lib/echanges/libelles";
import { saisirDansTransaction, modifierDansTransaction } from "@/pilot/lib/echanges/ecrire";
import { debutDuJour } from "@/pilot/lib/dates";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { verrouillerOrganisation } from "./comptes";

type SourceAction = Pick<CrmEchange, "id" | "statut" | "type" | "surveneuLe" | "prochaineAction" | "prochaineActionLe" | "prochaineActionFaiteLe">;
export type ProchaineAction = { texte: string; le: Date | null; echangeId: number; nature: "action" | "rendez-vous" };

export function prochaineActionDe(echanges: SourceAction[], maintenant: Date): ProchaineAction | null {
  // Le temps ne filtre pas les rendez-vous : un rendez-vous passé reste à confirmer.
  void maintenant;
  const recente = echanges.filter((e) => e.statut === "REALISE" && e.prochaineAction?.trim())
    .sort((a, b) => b.surveneuLe.getTime() - a.surveneuLe.getTime() || b.id - a.id)[0];
  const action: ProchaineAction | null = recente && !recente.prochaineActionFaiteLe
    ? { texte: recente.prochaineAction!.trim(), le: recente.prochaineActionLe, echangeId: recente.id, nature: "action" } : null;
  const rdv = echanges.filter((e) => e.statut === "PLANIFIE")
    .sort((a, b) => a.surveneuLe.getTime() - b.surveneuLe.getTime() || b.id - a.id)[0];
  if (!rdv) return action;
  if (action?.le && action.le <= rdv.surveneuLe) return action;
  return { texte: `Rendez-vous : ${LIBELLES_ECHANGE[rdv.type]}`, le: rdv.surveneuLe, echangeId: rdv.id, nature: "rendez-vous" };
}

async function chargerAction(tx: Prisma.TransactionClient, organisationId: number) {
  // Deux candidats suffisent : historique borné à deux lignes, en une requête,
  // sans charger le compte rendu. Le même ordre total que la fonction pure.
  const echanges = await tx.$queryRaw<SourceAction[]>`
    (SELECT id, statut, type, "surveneuLe", "prochaineAction", "prochaineActionLe", "prochaineActionFaiteLe"
     FROM "CrmEchange" WHERE "organisationId" = ${organisationId} AND statut = 'REALISE'
       AND btrim(COALESCE("prochaineAction", '')) <> '' ORDER BY "surveneuLe" DESC, id DESC LIMIT 1)
    UNION ALL
    (SELECT id, statut, type, "surveneuLe", "prochaineAction", "prochaineActionLe", "prochaineActionFaiteLe"
     FROM "CrmEchange" WHERE "organisationId" = ${organisationId} AND statut = 'PLANIFIE'
     ORDER BY "surveneuLe" ASC, id DESC LIMIT 1)`;
  return prochaineActionDe(echanges, new Date());
}

/** Appeler dans une transaction qui détient le verrou de l'organisation. */
export async function recalculerProchaineAction(tx: Prisma.TransactionClient, organisationId: number, auteurId: number | null = null) {
  const action = await chargerAction(tx, organisationId);
  const org = await tx.crmOrganisation.findUniqueOrThrow({ where: { id: organisationId }, select: { prochaineAction: true, prochaineActionLe: true } });
  const apres = { prochaineAction: action?.texte ?? null, prochaineActionLe: action?.le ?? null };
  if (org.prochaineAction !== apres.prochaineAction || org.prochaineActionLe?.getTime() !== apres.prochaineActionLe?.getTime()) {
    await tx.crmOrganisation.update({ where: { id: organisationId }, data: apres });
    await journaliser(tx, { type: "PROCHAINE_ACTION_CHANGEE", organisationId, auteurId,
      resume: action ? "Prochaine action modifiée" : "Prochaine action effacée", avant: org, apres });
  }
  return action;
}

export async function marquerFaite(organisationId: number, auteurId: number, suite?: z.output<typeof suiteAction>) {
  return transactionJournalisee(async (tx) => {
    await verrouillerOrganisation(tx, organisationId);
    const action = await chargerAction(tx, organisationId);
    if (!action) throw new ErreurMetier("Aucune prochaine action à marquer.", 409);
    const maintenant = new Date();
    if (action.nature === "action") {
      await tx.crmEchange.update({ where: { id: action.echangeId }, data: { prochaineActionFaiteLe: maintenant } });
      await journaliser(tx, { type: "ECHANGE_MODIFIE", organisationId, echangeId: action.echangeId, auteurId,
        resume: "Prochaine action faite", apres: { prochaineActionFaiteLe: maintenant } });
    } else {
      const echange = await tx.crmEchange.findUniqueOrThrow({ where: { id: action.echangeId } });
      await modifierDansTransaction(tx, echange, { operation: "realiser" }, auteurId, maintenant);
    }
    if (suite) await saisirDansTransaction(tx, { ...suite, organisationId, auteurId, statut: "REALISE", surveneuLe: maintenant }, maintenant);
    return recalculerProchaineAction(tx, organisationId, auteurId);
  });
}

export async function replanifier(organisationId: number, le: Date, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    await verrouillerOrganisation(tx, organisationId);
    const action = await chargerAction(tx, organisationId);
    if (!action) throw new ErreurMetier("Aucune prochaine action à replanifier.", 409);
    // Replanifier dans le passé reviendrait à créer un retard : refusé.
    if (le < debutDuJour(new Date())) throw new ErreurMetier("Une action se replanifie aujourd'hui ou plus tard.", 400);
    if (action.nature === "action") {
      await tx.crmEchange.update({ where: { id: action.echangeId }, data: { prochaineActionLe: le } });
      await journaliser(tx, { type: "ECHANGE_MODIFIE", organisationId, echangeId: action.echangeId, auteurId,
        resume: "Prochaine action replanifiée", avant: { prochaineActionLe: action.le }, apres: { prochaineActionLe: le } });
    } else {
      const echange = await tx.crmEchange.findUniqueOrThrow({ where: { id: action.echangeId } });
      await modifierDansTransaction(tx, echange, { operation: "replanifier", le }, auteurId, new Date());
    }
    return recalculerProchaineAction(tx, organisationId, auteurId);
  });
}
