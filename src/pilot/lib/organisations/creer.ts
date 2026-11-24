import type { z } from "zod";
import type { creationOrganisation } from "@/pilot/lib/validation/organisation";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { verifierResponsables } from "./comptes";

export async function creerOrganisation(donnees: z.output<typeof creationOrganisation>, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    await verifierResponsables(tx, donnees);
    const { contactPrincipal, ...identite } = donnees;
    const organisation = await tx.crmOrganisation.create({ data: { ...identite, etape: "PROSPECT", etapeDepuisLe: new Date() } });
    await journaliser(tx, {
      type: "ORGANISATION_CREEE", organisationId: organisation.id, auteurId, resume: "Prospect créé",
      apres: { type: organisation.type, responsableId: organisation.responsableId, chefDeProjetId: organisation.chefDeProjetId },
    });
    if (contactPrincipal) {
      await tx.crmContact.create({ data: { ...contactPrincipal, organisationId: organisation.id, principal: true } });
      await journaliser(tx, {
        type: "CONTACT_AJOUTE", organisationId: organisation.id, auteurId, resume: "Contact ajouté",
        apres: { champs: Object.keys({ ...contactPrincipal, principal: true }) },
      });
    }
    return organisation;
  });
}
