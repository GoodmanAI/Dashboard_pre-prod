import type { z } from "zod";
import type { saisieEchange } from "@/pilot/lib/validation/echange";
import { transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { verrouillerOrganisation } from "@/pilot/lib/organisations/comptes";
import { recalculerProchaineAction } from "@/pilot/lib/organisations/prochaineAction";
import { saisirDansTransaction } from "./ecrire";

export async function saisirEchange(p: z.output<typeof saisieEchange> & { auteurId: number }) {
  return transactionJournalisee(async (tx) => {
    await verrouillerOrganisation(tx, p.organisationId);
    const echange = await saisirDansTransaction(tx, p, new Date());
    await recalculerProchaineAction(tx, p.organisationId, p.auteurId);
    return echange;
  });
}
