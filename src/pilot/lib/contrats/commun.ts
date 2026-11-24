import type { CrmContrat, Prisma } from "@prisma/client";
import type { z } from "zod";
import type { ligneContrat } from "@/pilot/lib/validation/contrat";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { verrouillerOrganisation } from "@/pilot/lib/organisations/comptes";
import { journaliser } from "@/pilot/lib/evenements/journaliser";
import { LIBELLES_CONTRAT } from "./regles";

export const conflitContrat = () => new ErreurMetier("Ce contrat vient de changer. Rechargez la page.", 409);
export const inclureLignes = { lignes: { orderBy: { id: "asc" as const } } };
export async function chargerSousVerrou(tx: Prisma.TransactionClient, id: number) {
  const initial = await tx.crmContrat.findUnique({ where: { id } });
  if (!initial) throw new ErreurMetier("Contrat inconnu.", 404);
  await verrouillerOrganisation(tx, initial.organisationId);
  const contrat = await tx.crmContrat.findUnique({ where: { id }, include: inclureLignes });
  if (!contrat || +contrat.majLe !== +initial.majLe || contrat.statut !== initial.statut) throw conflitContrat();
  return contrat;
}
export function exigerModifiable(c: CrmContrat) {
  if (c.statut === "TERMINE") throw new ErreurMetier("Un contrat terminé ne change plus.", 400);
}
export async function ecrireConditionnellement(tx: Prisma.TransactionClient, c: CrmContrat, data: Prisma.CrmContratUpdateManyMutationInput) {
  const r = await tx.crmContrat.updateMany({ where: { id: c.id, statut: c.statut, majLe: c.majLe },
    data: { ...data, majLe: new Date(Math.max(Date.now(), +c.majLe + 1)) } });
  if (!r.count) throw conflitContrat();
}
export async function verifierLignes(tx: Prisma.TransactionClient, organisationId: number, lignes: z.output<typeof ligneContrat>[]) {
  // Une ligne sans produit (lot S) n'a pas de produit à vérifier.
  const produits = [...new Set(lignes.flatMap((l) => l.productId == null ? [] : [l.productId]))];
  const centres = [...new Set(lignes.flatMap((l) => l.centreId == null ? [] : [l.centreId]))];
  if (await tx.product.count({ where: { id: { in: produits } } }) !== produits.length) throw new ErreurMetier("Produit inconnu dans les lignes.", 400);
  if (await tx.crmCentre.count({ where: { id: { in: centres }, organisationId } }) !== centres.length) throw new ErreurMetier("Le centre doit appartenir à cette organisation.", 400);
}
export async function journaliserStatut(tx: Prisma.TransactionClient, c: CrmContrat, vers: CrmContrat["statut"], auteurId: number) {
  // La référence est saisie librement : elle reste hors du résumé loggé, l'identifiant aussi, qui ne dit rien à l'écran.
  await journaliser(tx, { type: "CONTRAT_MODIFIE", organisationId: c.organisationId, contratId: c.id, auteurId,
    resume: `Contrat : ${LIBELLES_CONTRAT[c.statut]} vers ${LIBELLES_CONTRAT[vers]}`,
    avant: { statut: c.statut }, apres: { statut: vers } });
}
