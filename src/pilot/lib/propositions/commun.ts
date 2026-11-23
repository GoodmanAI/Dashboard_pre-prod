import type { CrmLigneProposition, CrmProposition, CrmStatutProposition, Prisma } from "@prisma/client";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { verrouillerOrganisation } from "@/pilot/lib/organisations/comptes";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { sansErreurBrute, type MessagesErreurBase } from "@/pilot/lib/erreursBase";
import { LIBELLES_PROPOSITION, propositionEnAttente, transitionProposition } from "./regles";

export const conflitProposition = () => new ErreurMetier("Cette proposition vient de changer. Rechargez la page.", 409);
/** Une erreur de la base sort traduite, jamais brute : son message pourrait recopier un libellé, des notes ou la réponse du client. */
export const MESSAGES_BASE_PROPOSITION: MessagesErreurBase = {
  contrainte: "La proposition n'a pas pu être enregistrée. Vérifiez les lignes saisies.",
  disparu: "La fiche, un centre, un produit ou la grille vient d'être supprimé. Rechargez la page.",
  conflit: "Cette proposition vient de changer. Rechargez la page.",
  panne: "Écriture d'une proposition impossible : erreur de la base.",
  ecriture: "Écriture d'une proposition",
};
/** La transaction journalisée des écritures de propositions, erreurs de base traduites. */
export const transactionProposition = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => sansErreurBrute(() => transactionJournalisee(fn), MESSAGES_BASE_PROPOSITION);
export const inclureLignes = { lignes: { orderBy: { id: "asc" as const } } };
/** Une ligne recopiée telle quelle (nouvelle version, acceptation), geste commercial compris (lot S). */
export function copierLigne({ productId, centreId, type, montantCentimes, unite, volumeInclus, libelle, offerte, quantite, prixUnitaireCentimes, baseQuantite, remisePourMille }: CrmLigneProposition) {
  return { productId, centreId, type, montantCentimes, unite, volumeInclus, libelle, offerte, quantite, prixUnitaireCentimes, baseQuantite, remisePourMille };
}
export async function chargerSousVerrou(tx: Prisma.TransactionClient, id: number) {
  const initiale = await tx.crmProposition.findUnique({ where: { id } });
  if (!initiale) throw new ErreurMetier("Proposition inconnue.", 404);
  await verrouillerOrganisation(tx, initiale.organisationId);
  const proposition = await tx.crmProposition.findUnique({ where: { id }, include: inclureLignes });
  if (!proposition || proposition.majLe.getTime() !== initiale.majLe.getTime() || proposition.statut !== initiale.statut) throw conflitProposition();
  return proposition;
}
export function verifierTransition(p: CrmProposition, vers: CrmStatutProposition) {
  if (!transitionProposition(p.statut, vers)) throw new ErreurMetier(`Passage refusé : ${LIBELLES_PROPOSITION[p.statut]} vers ${LIBELLES_PROPOSITION[vers]}.`, 409);
}
export async function ecrireConditionnellement(tx: Prisma.TransactionClient, p: CrmProposition, data: Prisma.CrmPropositionUpdateManyMutationInput) {
  const resultat = await tx.crmProposition.updateMany({ where: { id: p.id, statut: p.statut, majLe: p.majLe }, data });
  if (!resultat.count) throw conflitProposition();
}
export async function journaliserStatut(tx: Prisma.TransactionClient, p: CrmProposition, vers: CrmStatutProposition, auteurId: number | null) {
  await journaliser(tx, { type: "PROPOSITION_STATUT_CHANGE", organisationId: p.organisationId, propositionId: p.id, auteurId,
    resume: `Version ${p.version} : ${LIBELLES_PROPOSITION[p.statut]} vers ${LIBELLES_PROPOSITION[vers]}`,
    avant: { statut: p.statut }, apres: { statut: vers } });
}
/**
 * Seule la version qui attend une réponse (`propositionEnAttente`) s'accepte, se
 * refuse ou passe en discussion : une ancienne version restée envoyée a été
 * remplacée, l'accepter créerait un contrat sur des conditions que le client n'a
 * plus sous les yeux. Lu sous le verrou de l'organisation (`chargerSousVerrou`) :
 * une version envoyée au même instant attend la fin de cette transaction. 409.
 */
export async function exigerVersionEnAttente(tx: Prisma.TransactionClient, p: CrmProposition, message: string) {
  const versions = await tx.crmProposition.findMany({ where: { organisationId: p.organisationId }, select: { id: true, version: true, statut: true } });
  if (propositionEnAttente(versions)?.id !== p.id) throw new ErreurMetier(message, 409);
}
