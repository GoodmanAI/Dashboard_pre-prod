import type { z } from "zod";
import type { modificationEchange } from "@/pilot/lib/validation/echange";
import { transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { verrouillerOrganisation } from "@/pilot/lib/organisations/comptes";
import { recalculerProchaineAction } from "@/pilot/lib/organisations/prochaineAction";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { corrigerCompteRendu, modifierDansTransaction } from "./ecrire";

export async function modifierEchange(id: number, p: z.output<typeof modificationEchange>, auteurId: number, role = "ADMIN") {
  return transactionJournalisee(async (tx) => {
    const initial = await tx.crmEchange.findUnique({ where: { id }, select: { organisationId: true } });
    if (!initial) throw new ErreurMetier("Échange inconnu.", 404);
    await verrouillerOrganisation(tx, initial.organisationId);
    const echange = await tx.crmEchange.findUnique({ where: { id } });
    if (!echange) throw new ErreurMetier("Échange inconnu.", 404);
    if (p.operation === "corriger") return corrigerCompteRendu(tx, echange, p.compteRendu, { id: auteurId, role });
    const modifie = await modifierDansTransaction(tx, echange, p, auteurId, new Date());
    await recalculerProchaineAction(tx, echange.organisationId, auteurId);
    return modifie;
  });
}
