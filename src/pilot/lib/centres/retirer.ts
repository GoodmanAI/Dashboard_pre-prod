import { ErreurMetier } from "@/pilot/lib/erreurs";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { verrouillerOrganisation } from "@/pilot/lib/organisations/comptes";

/**
 * Pourquoi un produit ne se retire plus d'un centre, ou null (C-86). Tant que
 * rien n'est fait, c'est une saisie à corriger ; après, c'est de l'historique,
 * et un client parti passe en « Contrat terminé ».
 */
export function refusRetraitProduit(r: { etapesFaites: number; miseEnProductionLe: Date | null }): string | null {
  if (r.miseEnProductionLe) return "Ce produit est déjà en service : il ne se retire plus. Si le client est parti, passez-le en « Contrat terminé ».";
  if (r.etapesFaites) return "Des étapes de ce produit sont déjà faites : il ne se retire plus. Si le client est parti, passez-le en « Contrat terminé ».";
  return null;
}

/** Pourquoi un centre ne se supprime pas, ou null (C-86). */
export function refusSuppressionCentre(c: { produits: number; lignes: number; centresDuClient: number }): string | null {
  if (c.centresDuClient <= 1) return "C'est le seul centre de ce client : modifiez-le plutôt que de le supprimer.";
  if (c.produits) return "Retirez d'abord les produits de ce centre.";
  if (c.lignes) return "Ce centre figure dans un devis ou un contrat : il reste, pour que ces lignes gardent leur site.";
  return null;
}

/** Retire un produit ajouté par erreur à un centre : le rattachement et sa check-list, jamais le journal. */
export async function retirerRattachement(id: number, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    const repere = await tx.crmCentreProduit.findUnique({ where: { id }, select: { centre: { select: { organisationId: true } } } });
    if (!repere) throw new ErreurMetier("Ce produit n'est déjà plus sur ce centre.", 404);
    await verrouillerOrganisation(tx, repere.centre.organisationId);
    const r = await tx.crmCentreProduit.findUnique({ where: { id }, include: { centre: true, product: { select: { name: true } } } });
    if (!r) throw new ErreurMetier("Ce produit n'est déjà plus sur ce centre.", 404);
    const etapesFaites = await tx.crmEtapeIntegration.count({ where: { centreId: r.centreId, productId: r.productId, faite: true } });
    const refus = refusRetraitProduit({ etapesFaites, miseEnProductionLe: r.miseEnProductionLe });
    if (refus) throw new ErreurMetier(refus, 409);
    await tx.crmEtapeIntegration.deleteMany({ where: { centreId: r.centreId, productId: r.productId } });
    await tx.crmCentreProduit.delete({ where: { id } });
    await journaliser(tx, { type: "ORGANISATION_MODIFIEE", organisationId: r.centre.organisationId, centreId: r.centreId, auteurId,
      resume: `Produit retiré : ${r.product.name} · ${r.centre.nom}`, avant: { productId: r.productId, userProductId: r.userProductId, datePromise: r.datePromise } });
    return { retire: true };
  });
}

/** Supprime un centre saisi par erreur : sans produit, sans ligne de devis ni de contrat, jamais le dernier du client. */
export async function supprimerCentre(id: number, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    const repere = await tx.crmCentre.findUnique({ where: { id }, select: { organisationId: true } });
    if (!repere) throw new ErreurMetier("Ce centre n'existe déjà plus.", 404);
    await verrouillerOrganisation(tx, repere.organisationId);
    const c = await tx.crmCentre.findUnique({ where: { id }, include: { _count: { select: { rattachements: true, lignesContrat: true, lignesProposition: true } } } });
    if (!c) throw new ErreurMetier("Ce centre n'existe déjà plus.", 404);
    const centresDuClient = await tx.crmCentre.count({ where: { organisationId: c.organisationId } });
    const refus = refusSuppressionCentre({ produits: c._count.rattachements, lignes: c._count.lignesContrat + c._count.lignesProposition, centresDuClient });
    if (refus) throw new ErreurMetier(refus, 409);
    await tx.crmEtapeIntegration.deleteMany({ where: { centreId: id } });
    await tx.crmCentre.delete({ where: { id } });
    await journaliser(tx, { type: "ORGANISATION_MODIFIEE", organisationId: c.organisationId, auteurId, resume: `Centre supprimé : ${c.nom}`, avant: { nom: c.nom } });
    return { supprime: true };
  });
}
