import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import type { creationContact, majContact } from "@/pilot/lib/validation/contact";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { champsChanges } from "@/pilot/lib/evenements/diff";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { verrouillerOrganisation } from "@/pilot/lib/organisations/comptes";
import { evaluerOrganisationSansEchouer } from "@/pilot/lib/checklist/evaluer";

async function retirerPrincipal(tx: Prisma.TransactionClient, organisationId: number, auteurId: number, saufId?: number) {
  const resultat = await tx.crmContact.updateMany({ where: { organisationId, principal: true, id: saufId ? { not: saufId } : undefined }, data: { principal: false } });
  if (resultat.count) await journaliser(tx, {
    type: "CONTACT_MODIFIE", organisationId, auteurId, resume: "Contact modifié",
    avant: { champs: ["principal"] }, apres: { champs: ["principal"] },
  });
}

async function chargerContact(tx: Prisma.TransactionClient, id: number) {
  const contact = await tx.crmContact.findUnique({ where: { id } });
  if (!contact) throw new ErreurMetier("Contact inconnu.", 404);
  await verrouillerOrganisation(tx, contact.organisationId);
  // Relire après le verrou : un autre appel a pu modifier ou supprimer le contact.
  const courant = await tx.crmContact.findUnique({ where: { id } });
  if (!courant) throw new ErreurMetier("Contact inconnu.", 404);
  return courant;
}

export async function ajouterContact(donnees: z.output<typeof creationContact>, auteurId: number) {
  const contact = await transactionJournalisee(async (tx) => {
    await verrouillerOrganisation(tx, donnees.organisationId);
    if (donnees.principal) await retirerPrincipal(tx, donnees.organisationId, auteurId);
    const contact = await tx.crmContact.create({ data: donnees });
    await journaliser(tx, { type: "CONTACT_AJOUTE", organisationId: contact.organisationId, auteurId,
      resume: "Contact ajouté", apres: { champs: Object.keys(donnees).filter((cle) => cle !== "organisationId") } });
    return contact;
  });
  // L'étape « Contacts facturation récupérés » se constate après le commit (C-85).
  if (contact.facturation) await evaluerOrganisationSansEchouer(contact.organisationId);
  return contact;
}

export async function modifierContact(id: number, donnees: z.output<typeof majContact>, auteurId: number) {
  let facturationChangee = false;
  const resultat = await transactionJournalisee(async (tx) => {
    const contact = await chargerContact(tx, id);
    const diff = champsChanges(contact, donnees, Object.keys(donnees) as (keyof typeof donnees)[]);
    if (!Object.keys(diff.apres).length) return contact;
    facturationChangee = "facturation" in diff.apres;
    if (donnees.principal) await retirerPrincipal(tx, contact.organisationId, auteurId, id);
    const modifie = await tx.crmContact.update({ where: { id }, data: donnees });
    const champs = Object.keys(diff.apres);
    await journaliser(tx, { type: "CONTACT_MODIFIE", organisationId: contact.organisationId, auteurId,
      resume: "Contact modifié", avant: { champs }, apres: { champs } });
    return modifie;
  });
  if (facturationChangee) await evaluerOrganisationSansEchouer(resultat.organisationId);
  return resultat;
}

export async function supprimerContact(id: number, auteurId: number) {
  const contact = await transactionJournalisee(async (tx) => {
    const contact = await chargerContact(tx, id);
    await tx.crmContact.delete({ where: { id } });
    await journaliser(tx, { type: "CONTACT_SUPPRIME", organisationId: contact.organisationId, auteurId, resume: "Contact supprimé" });
    return contact;
  });
  if (contact.facturation) await evaluerOrganisationSansEchouer(contact.organisationId);
}
