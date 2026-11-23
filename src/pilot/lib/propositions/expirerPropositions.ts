import { transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { verrouillerOrganisation } from "@/pilot/lib/organisations/comptes";
import { debutDuJour } from "@/pilot/lib/dates";
import { journaliserStatut } from "./commun";

export async function expirerPropositions(maintenant: Date): Promise<number> {
  return transactionJournalisee(async (tx) => {
    const debut = debutDuJour(maintenant);
    const propositions = await tx.crmProposition.findMany({
      where: { statut: { in: ["ENVOYEE", "EN_DISCUSSION"] }, valideJusquAu: { lt: debut } },
      orderBy: [{ organisationId: "asc" }, { id: "asc" }],
    });
    let nombre = 0;
    for (const organisationId of [...new Set(propositions.map((p) => p.organisationId))]) await verrouillerOrganisation(tx, organisationId);
    for (const p of propositions) {
      const resultat = await tx.crmProposition.updateMany({ where: { id: p.id, statut: p.statut, valideJusquAu: { lt: debut } }, data: { statut: "EXPIREE" } });
      if (!resultat.count) continue;
      await journaliserStatut(tx, p, "EXPIREE", null);
      nombre++;
    }
    return nombre;
  }, { timeout: 120000 });
}
