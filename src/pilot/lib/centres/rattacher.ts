import { Prisma } from "@prisma/client";
import type { z } from "zod";
import type { creationRattachement, majRattachement } from "@/pilot/lib/validation/centre";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { champsChanges } from "@/pilot/lib/evenements/diff";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { evaluerSansEchouer } from "@/pilot/lib/checklist/evaluer";
import { verrouillerOrganisation } from "@/pilot/lib/organisations/comptes";
import { synchroniserStatutsDashboard } from "@/pilot/lib/centres/statutDashboard";

export async function verifierCompte(
  tx: Prisma.TransactionClient, productId: number, userProductId: number | null | undefined,
  organisationId: number, saufId?: number,
) {
  if (userProductId == null) return;
  // Verrou applicatif : protège l'unicité sans modifier le schéma ni le Dashboard.
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(72101, ${userProductId}::integer)`;
  const compte = await tx.userProduct.findUnique({ where: { id: userProductId } });
  if (!compte) throw new ErreurMetier("Compte Dashboard inconnu.", 400);
  if (compte.productId !== productId) throw new ErreurMetier("Ce compte Dashboard ne porte pas ce produit.", 400);
  if (compte.removedAt) throw new ErreurMetier("Ce compte Dashboard a été retiré.", 400);
  // Quand l'organisation a déjà son compte Dashboard, un centre ne peut pas
  // emprunter l'accès produit d'un autre client.
  const organisation = await tx.crmOrganisation.findUnique({ where: { id: organisationId }, select: { utilisateurId: true } });
  if (organisation?.utilisateurId != null && organisation.utilisateurId !== compte.userId) {
    throw new ErreurMetier("Ce compte Dashboard appartient à un autre client.", 400);
  }
  const occupe = await tx.crmCentreProduit.findFirst({ where: { userProductId, id: saufId ? { not: saufId } : undefined }, select: { id: true } });
  if (occupe) throw new ErreurMetier("Ce compte Dashboard est déjà relié à un autre centre.", 409);
}

export async function rattacherProduit(donnees: z.output<typeof creationRattachement>, auteurId: number) {
  let rattachement;
  try {
    rattachement = await transactionJournalisee(async (tx) => {
      const centre = await tx.crmCentre.findUnique({ where: { id: donnees.centreId } });
      if (!centre) throw new ErreurMetier("Centre inconnu.", 404);
      const produit = await tx.product.findUnique({ where: { id: donnees.productId } });
      if (!produit) throw new ErreurMetier("Produit inconnu.", 404);
      const existant = await tx.crmCentreProduit.findUnique({
        where: { centreId_productId: { centreId: donnees.centreId, productId: donnees.productId } },
        select: { id: true },
      });
      if (existant) throw new ErreurMetier("Ce centre a déjà ce produit.", 409);
      await verifierCompte(tx, donnees.productId, donnees.userProductId, centre.organisationId);
      const cree = await tx.crmCentreProduit.create({ data: { ...donnees, datePromiseInitiale: donnees.datePromise } });
      await journaliser(tx, { type: "RATTACHEMENT_CREE", organisationId: centre.organisationId, centreId: centre.id,
        centreProduitId: cree.id, auteurId, resume: `Produit ajouté : ${produit.name} · ${centre.nom}`,
        apres: { productId: cree.productId, userProductId: cree.userProductId, datePromise: cree.datePromise } });
      await synchroniserStatutsDashboard(tx, { centreProduitIds: [cree.id] }, auteurId);
      return cree;
    });
  } catch (erreur) {
    if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") {
      throw new ErreurMetier("Ce centre a déjà ce produit.", 409);
    }
    throw erreur;
  }
  // Après le commit : une panne du registre ne refuse pas le rattachement.
  await evaluerSansEchouer(rattachement.id);
  return rattachement;
}

export async function modifierRattachement(id: number, donnees: z.output<typeof majRattachement>, auteurId: number) {
  const rattachement = await transactionJournalisee(async (tx) => {
    const repere = await tx.crmCentreProduit.findUnique({ where: { id }, select: { centre: { select: { organisationId: true } } } });
    if (!repere) throw new ErreurMetier("Ce produit n'existe plus sur ce centre.", 404);
    await verrouillerOrganisation(tx, repere.centre.organisationId);
    await tx.$queryRaw`SELECT id FROM "CrmCentreProduit" WHERE id = ${id} FOR UPDATE`;
    const courant = await tx.crmCentreProduit.findUnique({ where: { id }, include: { centre: true } });
    if (!courant) throw new ErreurMetier("Ce produit n'existe plus sur ce centre.", 404);
    await verifierCompte(tx, courant.productId, donnees.userProductId, courant.centre.organisationId, id);
    const valeurs = { ...donnees };
    if (valeurs.vagueId != null) {
      const vague = await tx.crmVague.findUnique({ where: { id: valeurs.vagueId } });
      if (!vague) throw new ErreurMetier("Vague inconnue.", 404);
      if (vague.organisationId !== courant.centre.organisationId) throw new ErreurMetier("Cette vague appartient à une autre organisation.", 400);
      if (vague.id !== courant.vagueId && vague.datePromise) valeurs.datePromise = vague.datePromise;
    }
    const diff = champsChanges(courant, valeurs, ["datePromise", "userProductId", "vagueId"]);
    if (!Object.keys(diff.apres).length) return courant;
    const modifie = await tx.crmCentreProduit.update({ where: { id }, data: { ...valeurs,
      datePromiseInitiale: courant.datePromiseInitiale ?? valeurs.datePromise ?? courant.datePromise } });
    const contexte = { organisationId: courant.centre.organisationId, centreId: courant.centreId, centreProduitId: id, auteurId };
    if ("datePromise" in diff.apres) {
      await journaliser(tx, { ...contexte, type: "DATE_PROMISE_CHANGEE", resume: "Date promise modifiée",
        avant: { datePromise: courant.datePromise }, apres: { datePromise: modifie.datePromise } });
    }
    if ("userProductId" in diff.apres) {
      await journaliser(tx, { ...contexte, type: "ORGANISATION_MODIFIEE", resume: "Compte Dashboard modifié",
        avant: { userProductId: courant.userProductId }, apres: { userProductId: modifie.userProductId } });
      await synchroniserStatutsDashboard(tx, { centreProduitIds: [id] }, auteurId);
    }
    if ("vagueId" in diff.apres) {
      await journaliser(tx, { ...contexte, type: "ORGANISATION_MODIFIEE", resume: "Vague modifiée",
        avant: { vagueId: courant.vagueId }, apres: { vagueId: modifie.vagueId } });
    }
    return modifie;
  });
  // Même évaluation ponctuelle après commit.
  await evaluerSansEchouer(rattachement.id);
  return rattachement;
}
