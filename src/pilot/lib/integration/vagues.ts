import type { z } from "zod";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { champsChanges } from "@/pilot/lib/evenements/diff";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { verrouillerOrganisation } from "@/pilot/lib/organisations/comptes";
import type { creationVague, majVague } from "@/pilot/lib/validation/vague";

export async function creerVague(donnees: z.output<typeof creationVague>, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    await verrouillerOrganisation(tx, donnees.organisationId);
    const maximum = await tx.crmVague.aggregate({ where: { organisationId: donnees.organisationId }, _max: { numero: true } });
    const vague = await tx.crmVague.create({ data: { ...donnees, numero: (maximum._max.numero ?? 0) + 1 } });
    await journaliser(tx, { type: "ORGANISATION_MODIFIEE", organisationId: vague.organisationId, auteurId,
      resume: `Vague ${vague.numero} créée`, apres: { vagueId: vague.id, numero: vague.numero, datePromise: vague.datePromise } });
    return vague;
  });
}

export async function modifierVague(id: number, donnees: z.output<typeof majVague>, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    const courant = await tx.crmVague.findUnique({ where: { id } });
    if (!courant) throw new ErreurMetier("Vague inconnue.", 404);
    // Même ordre de verrouillage que modifierRattachement : organisation puis rattachements.
    await verrouillerOrganisation(tx, courant.organisationId);
    const diff = champsChanges(courant, donnees, ["nom", "datePromise"]);
    if (!Object.keys(diff.apres).length) return courant;
    const resultat = await tx.crmVague.updateMany({ where: { id, nom: courant.nom, datePromise: courant.datePromise }, data: donnees });
    if (!resultat.count) throw new ErreurMetier("Cette vague a changé. Rechargez la page.", 409);
    const modifie = { ...courant, ...donnees };
    if ("datePromise" in diff.apres) {
      const rattachements = await tx.crmCentreProduit.findMany({ where: { vagueId: id }, orderBy: { id: "asc" } });
      for (const r of rattachements) {
        if (r.datePromise?.getTime() === modifie.datePromise?.getTime()) continue;
        await tx.crmCentreProduit.update({ where: { id: r.id }, data: { datePromise: modifie.datePromise,
          datePromiseInitiale: r.datePromiseInitiale ?? modifie.datePromise } });
        await journaliser(tx, { type: "DATE_PROMISE_CHANGEE", organisationId: courant.organisationId, centreId: r.centreId,
          centreProduitId: r.id, auteurId, resume: "Date promise modifiée",
          avant: { datePromise: r.datePromise }, apres: { datePromise: modifie.datePromise } });
      }
    }
    await journaliser(tx, { type: "ORGANISATION_MODIFIEE", organisationId: courant.organisationId, auteurId,
      resume: `Vague ${courant.numero} modifiée`, avant: { vagueId: id, champs: Object.keys(diff.avant), datePromise: courant.datePromise },
      apres: { vagueId: id, champs: Object.keys(diff.apres), datePromise: modifie.datePromise } });
    return tx.crmVague.findUniqueOrThrow({ where: { id } });
  }, { timeout: 30000 });
}
