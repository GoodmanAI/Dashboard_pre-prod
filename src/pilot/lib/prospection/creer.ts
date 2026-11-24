import type { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { creationProspect } from "@/pilot/lib/validation/prospect";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { verifierResponsables } from "@/pilot/lib/organisations/comptes";
import { recalculerProchaineAction } from "@/pilot/lib/organisations/prochaineAction";
import { saisirDansTransaction } from "@/pilot/lib/echanges/ecrire";
import { creerOpportuniteDansTransaction } from "@/pilot/lib/opportunites/gerer";
import { PRODUIT_KONNECT, PRODUIT_TALK } from "@/pilot/lib/checklist/definition";
import { premierProduitOffert } from "@/pilot/lib/tarifs/estimer";
import { verrouillerConcurrentLie } from "@/pilot/lib/concurrents/lien";
import { geocoderApresCommit } from "@/pilot/lib/carte/localiser";

/**
 * Crée un prospect depuis la fiche de saisie rapide (C-65), en une transaction :
 * l'organisation, son site (adresse, code postal, ville), ses contacts (le
 * premier est le principal) et le premier contact noté dans la chronologie.
 * Le journal garde le même découpage qu'une saisie faite pas à pas.
 *
 * Un montant estimé par mois (C-70) crée une opportunité dans la même
 * transaction : jamais une colonne de l'organisation, donc jamais une seconde
 * vérité à côté de l'onglet Argent.
 *
 * Le concurrent en place (lot R) s'écrit avec l'organisation : il doit exister
 * (sinon 400), et le verrou partagé l'empêche d'être supprimé pendant l'écriture.
 *
 * Le site naît en A_FAIRE ; sa position est cherchée après le commit, sans
 * faire attendre la saisie (lot U).
 */
export async function creerProspect(d: z.output<typeof creationProspect>, auteurId: number, maintenant = new Date()) {
  if (d.premierContact && d.premierContact.surveneuLe > maintenant) {
    throw new ErreurMetier("Le premier contact a déjà eu lieu : sa date est aujourd'hui ou avant.", 400);
  }
  const { organisation, centreId } = await transactionJournalisee(async (tx) => {
    await verifierResponsables(tx, d.organisation);
    const produitDuMontant = d.montantEstime ? await produitPourMontant(tx, d.montantEstime.offres) : null;
    if (d.organisation.concurrentId != null) await verrouillerConcurrentLie(tx, d.organisation.concurrentId);
    const organisation = await tx.crmOrganisation.create({ data: { ...d.organisation, etape: "PROSPECT", etapeDepuisLe: maintenant } });
    await journaliser(tx, {
      type: "ORGANISATION_CREEE", organisationId: organisation.id, auteurId, resume: "Prospect créé",
      apres: { type: organisation.type, responsableId: organisation.responsableId, priorite: organisation.priorite,
        ...(organisation.concurrentId != null ? { concurrentId: organisation.concurrentId } : {}) },
    });

    // Un prospect a un site dès sa création : c'est là que vivent l'adresse et la ville (C-63).
    const centre = await tx.crmCentre.create({ data: { organisationId: organisation.id, nom: organisation.raisonSocialeNom, ...d.site } });
    await journaliser(tx, { type: "CENTRE_CREE", organisationId: organisation.id, centreId: centre.id, auteurId,
      resume: `Centre créé : ${centre.nom}`, apres: { nom: centre.nom, ville: centre.ville, codePostal: centre.codePostal } });

    if (d.montantEstime && produitDuMontant !== null) {
      // La création et l'événement de la route des opportunités, à la probabilité de l'étape Prospect (C-44),
      // sans démarrage attendu (le prospect n'a pas de date) ni frais d'installation chiffrés.
      await creerOpportuniteDansTransaction(tx, { organisationId: organisation.id, productId: produitDuMontant,
        montantMensuelCentimes: d.montantEstime.montantMensuelCentimes, montantMiseEnServiceCentimes: 0 }, auteurId);
    }

    let principalId: number | null = null;
    for (const [rang, contact] of d.contacts.entries()) {
      const cree = await tx.crmContact.create({ data: { ...contact, organisationId: organisation.id, principal: rang === 0 } });
      principalId ??= cree.id;
      await journaliser(tx, { type: "CONTACT_AJOUTE", organisationId: organisation.id, auteurId, resume: "Contact ajouté",
        apres: { champs: [...Object.keys(contact), "principal"] } });
    }

    if (d.premierContact) {
      // Le premier contact s'est fait avec le contact principal : sa date de dernier contact suit.
      await saisirDansTransaction(tx, { organisationId: organisation.id, statut: "REALISE", auteurId, contactId: principalId, ...d.premierContact }, maintenant);
      await recalculerProchaineAction(tx, organisation.id, auteurId);
    }
    return { organisation, centreId: centre.id };
  });
  geocoderApresCommit([centreId]);
  return organisation;
}

/** Le produit du catalogue auquel rattacher le montant, ou un refus qui dit quoi faire. */
async function produitPourMontant(tx: Prisma.TransactionClient, offres: Parameters<typeof premierProduitOffert>[0]): Promise<number> {
  const offert = premierProduitOffert(offres);
  if (!offert) throw new ErreurMetier("Cochez Talk ou Konnect pour enregistrer un montant estimé.", 400);
  const nom = offert === "TALK" ? PRODUIT_TALK : PRODUIT_KONNECT;
  const produit = await tx.product.findUnique({ where: { name: nom }, select: { id: true } });
  if (!produit) throw new ErreurMetier(`Le produit ${offert === "TALK" ? "Talk" : "Konnect"} est introuvable dans le catalogue du Dashboard. Créez le prospect sans montant, puis ajoutez-le dans l'onglet Argent.`, 400);
  return produit.id;
}
