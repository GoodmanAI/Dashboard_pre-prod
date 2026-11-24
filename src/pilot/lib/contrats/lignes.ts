import type { z } from "zod";
import type { CrmContrat, CrmLigneContrat, Prisma } from "@prisma/client";
import { ligneContrat, type modificationLigneContrat } from "@/pilot/lib/validation/contrat";
import { messageValidation } from "@/pilot/lib/validation/messages";
import { transactionJournalisee, journaliser } from "@/pilot/lib/evenements/journaliser";
import { champsChanges } from "@/pilot/lib/evenements/diff";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { bilanOpportunites, gagnerOpportunitesOuvertes } from "@/pilot/lib/opportunites/gerer";
import type { BilanOpportunites } from "@/pilot/lib/opportunites/regles";
import { estAChiffrer, messageAChiffrer } from "@/pilot/lib/propositions/affichage";
import { chargerSousVerrou, conflitContrat, ecrireConditionnellement, exigerModifiable, verifierLignes } from "./commun";

/**
 * Sur un contrat actif, une ligne posée ou modifiée ne peut pas être à chiffrer (`estAChiffrer`, la règle de
 * l'envoi d'une proposition) : le contrat dit ce que le client paie. Sur un brouillon, elle attend son prix ;
 * l'activation la refusera tant qu'elle n'est ni chiffrée ni offerte.
 */
function exigerChiffree(c: { statut: CrmContrat["statut"] }, ligne: Pick<CrmLigneContrat, "montantCentimes" | "type"> & { offerte?: boolean | null }) {
  if (c.statut === "ACTIF" && estAChiffrer(ligne)) throw new ErreurMetier(messageAChiffrer(1, "contrat"), 400);
}

/**
 * Un contrat actif qui porte un produit gagne les opportunités ouvertes de ce produit (C-71) : une
 * ligne posée, ou dont le produit change, sur un contrat déjà actif fait comme l'activation, dans la même transaction,
 * sinon la projection compterait le produit deux fois. Sur un brouillon, rien : l'activation s'en
 * chargera. Le bilan n'est lu que si une opportunité vient d'être gagnée : l'écran n'a rien à dire sinon.
 */
async function gagnerPourLaLigne(tx: Prisma.TransactionClient, c: { statut: CrmContrat["statut"]; organisationId: number }, productId: number | null | undefined, auteurId: number): Promise<BilanOpportunites | null> {
  if (c.statut !== "ACTIF") return null;
  const gagnees = await gagnerOpportunitesOuvertes(tx, { organisationId: c.organisationId, auteurId, maintenant: new Date(), productIds: [productId ?? null] });
  return gagnees ? bilanOpportunites(tx, c.organisationId, gagnees) : null;
}
const instantane = ({ type, montantCentimes, productId }: Pick<CrmLigneContrat, "type" | "montantCentimes"> & { productId?: number | null }) =>
  ({ type, montantCentimes, productId: productId ?? null });
export async function ajouterLigne(id: number, champs: z.output<typeof ligneContrat>, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    const c = await chargerSousVerrou(tx, id); exigerModifiable(c);
    await verifierLignes(tx, c.organisationId, [champs]);
    exigerChiffree(c, champs);
    await ecrireConditionnellement(tx, c, {});
    const ligne = await tx.crmLigneContrat.create({ data: { ...champs, contratId: id } });
    await journaliser(tx, { type: "CONTRAT_MODIFIE", organisationId: c.organisationId, contratId: id, auteurId, resume: "Ligne ajoutée", apres: instantane(ligne) });
    const bilan = await gagnerPourLaLigne(tx, c, ligne.productId, auteurId);
    return { ligne, bilan };
  });
}
export async function modifierLigne(id: number, ligneId: number, champs: z.output<typeof modificationLigneContrat>, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    const c = await chargerSousVerrou(tx, id);
    const ligne = c.lignes.find((l) => l.id === ligneId);
    if (!ligne) throw new ErreurMetier("Ligne inconnue dans ce contrat.", 404);
    exigerModifiable(c);
    const { productId, centreId, type, montantCentimes, unite, volumeInclus, libelle, offerte, quantite, prixUnitaireCentimes, baseQuantite, remisePourMille } = ligne;
    const analyse = ligneContrat.safeParse({ productId, centreId, type, montantCentimes, unite, volumeInclus, libelle, offerte, quantite, prixUnitaireCentimes, baseQuantite, remisePourMille, ...champs });
    if (!analyse.success) throw new ErreurMetier(messageValidation(analyse.error), 400);
    const diff = champsChanges(ligne, analyse.data, ["productId", "centreId", "type", "montantCentimes", "unite", "volumeInclus", "libelle", "offerte", "quantite", "prixUnitaireCentimes", "baseQuantite", "remisePourMille"]);
    if (!Object.keys(diff.apres).length) return { ligne, bilan: null };
    await verifierLignes(tx, c.organisationId, [analyse.data]);
    exigerChiffree(c, analyse.data);
    await ecrireConditionnellement(tx, c, {});
    const r = await tx.crmLigneContrat.updateMany({ where: { id: ligneId, contratId: id, majLe: ligne.majLe }, data: diff.apres });
    if (!r.count) throw conflitContrat();
    await journaliser(tx, { type: "CONTRAT_MODIFIE", organisationId: c.organisationId, contratId: id, auteurId,
      resume: "Ligne modifiée", avant: instantane(ligne), apres: instantane(analyse.data) });
    // Seul un changement de produit gagne (C-71) : corriger un libellé ou un montant ne conclut rien de plus.
    const bilan = "productId" in diff.apres ? await gagnerPourLaLigne(tx, c, analyse.data.productId, auteurId) : null;
    return { ligne: await tx.crmLigneContrat.findUniqueOrThrow({ where: { id: ligneId } }), bilan };
  });
}
export async function retirerLigne(id: number, ligneId: number, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    const c = await chargerSousVerrou(tx, id);
    const ligne = c.lignes.find((l) => l.id === ligneId);
    if (!ligne) throw new ErreurMetier("Ligne inconnue dans ce contrat.", 404);
    exigerModifiable(c);
    await ecrireConditionnellement(tx, c, {});
    const r = await tx.crmLigneContrat.deleteMany({ where: { id: ligneId, contratId: id, majLe: ligne.majLe } });
    if (!r.count) throw conflitContrat();
    await journaliser(tx, { type: "CONTRAT_MODIFIE", organisationId: c.organisationId, contratId: id, auteurId, resume: "Ligne retirée", avant: instantane(ligne) });
    return { supprime: true };
  });
}
