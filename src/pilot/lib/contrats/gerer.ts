import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import type { creationContrat, contenuContrat, statutContrat } from "@/pilot/lib/validation/contrat";
import { transactionJournalisee, journaliser } from "@/pilot/lib/evenements/journaliser";
import { champsChanges } from "@/pilot/lib/evenements/diff";
import { verrouillerOrganisation } from "@/pilot/lib/organisations/comptes";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { debutDuJour } from "@/pilot/lib/dates";
import { bilanOpportunites, gagnerOpportunitesOuvertes } from "@/pilot/lib/opportunites/gerer";
import type { BilanOpportunites } from "@/pilot/lib/opportunites/regles";
import { estAChiffrer, messageAChiffrer } from "@/pilot/lib/propositions/affichage";
import { LIBELLES_CONTRAT, transitionContrat } from "./regles";
import { refusActivationPendantPoc } from "@/pilot/lib/organisations/poc";
import { evaluerRattachements, phraseSansCentre, rattacherProduitsDuContrat } from "@/pilot/lib/centres/rattacherDepuisContrat";
import { chargerSousVerrou, conflitContrat, ecrireConditionnellement, exigerModifiable, inclureLignes, journaliserStatut, verifierLignes } from "./commun";

export async function creerContrat(donnees: z.output<typeof creationContrat>, auteurId: number) {
  return transactionJournalisee((tx) => creerContratDansTransaction(tx, donnees, auteurId));
}
/** La même création, dans une transaction déjà ouverte : la conversion en client l'appelle avec ses passages d'étape. */
export async function creerContratDansTransaction(tx: Prisma.TransactionClient, { lignes, ...champs }: z.output<typeof creationContrat>, auteurId: number) {
  await verrouillerOrganisation(tx, champs.organisationId);
  await verifierLignes(tx, champs.organisationId, lignes);
  const contrat = await tx.crmContrat.create({ data: { ...champs, statut: "BROUILLON", lignes: { create: lignes } }, include: inclureLignes });
  await journaliser(tx, { type: "CONTRAT_CREE", organisationId: contrat.organisationId, contratId: contrat.id, auteurId,
    resume: "Contrat créé", apres: { lignes: lignes.length } });
  return contrat;
}
export async function modifierContrat(id: number, champs: z.output<typeof contenuContrat>, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    const c = await chargerSousVerrou(tx, id);
    exigerModifiable(c);
    const diff = champsChanges(c, champs, ["reference", "signeLe", "debuteLe", "renouvelleLe", "engagementMois", "preavisMois",
      "essaiDebuteLe", "essaiJours", "reconduction", "conditionsTarifaires"]);
    if (!Object.keys(diff.apres).length) return c;
    await ecrireConditionnellement(tx, c, diff.apres);
    await journaliser(tx, { type: "CONTRAT_MODIFIE", organisationId: c.organisationId, contratId: id, auteurId, resume: "Contrat modifié", ...diff });
    return tx.crmContrat.findUniqueOrThrow({ where: { id }, include: inclureLignes });
  });
}
export async function changerStatutContrat(id: number, { vers, le }: z.output<typeof statutContrat>, auteurId: number) {
  const resultat = await transactionJournalisee(async (tx) => {
    const c = await chargerSousVerrou(tx, id);
    if (!transitionContrat(c.statut, vers)) throw new ErreurMetier(`Passage refusé : ${LIBELLES_CONTRAT[c.statut]} vers ${LIBELLES_CONTRAT[vers]}.`, 409);
    if (vers === "ACTIF") {
      const org = await tx.crmOrganisation.findUniqueOrThrow({ where: { id: c.organisationId }, select: { etape: true } });
      const refus = refusActivationPendantPoc(org.etape);
      if (refus) throw new ErreurMetier(refus, 409);
    }
    if (vers === "ACTIF" && !c.lignes.length) throw new ErreurMetier("Ajoutez au moins une ligne avant d'activer le contrat.", 400);
    // Un contrat actif ne porte pas de ligne à chiffrer : même règle que l'envoi d'une proposition (`estAChiffrer`).
    // La part à l'usage à 0 et une ligne offerte sont des choix.
    const aChiffrer = vers === "ACTIF" ? c.lignes.filter(estAChiffrer).length : 0;
    if (aChiffrer) throw new ErreurMetier(messageAChiffrer(aChiffrer, "contrat"), 400);
    if (vers === "TERMINE" && (!le || c.signeLe && debutDuJour(le) < debutDuJour(c.signeLe))) {
      throw new ErreurMetier("La date de fin est obligatoire et ne peut pas précéder la signature.", 400);
    }
    // Terminé veut dire terminé : une fin future retirerait dès aujourd'hui le contrat du récurrent signé.
    if (vers === "TERMINE" && debutDuJour(le!) > debutDuJour(new Date())) {
      throw new ErreurMetier("Une date de fin future se pose le jour venu : le contrat reste actif d'ici là.", 400);
    }
    await ecrireConditionnellement(tx, c, { statut: vers,
      ...(vers === "ACTIF" ? { signeLe: c.signeLe ?? debutDuJour(new Date()) } : { termineLe: le }) });
    await journaliserStatut(tx, c, vers, auteurId);
    // Un brouillon activé : les opportunités ouvertes des produits de ses lignes sont gagnées, même filtre que
    // l'acceptation (C-39). Jusque-là, elles restent l'estimé que la projection compte (C-71). L'écran dit
    // ensuite combien sont gagnées et lesquelles restent ouvertes.
    let bilan: BilanOpportunites | null = null;
    let rattachements: { crees: number[]; sansCentre: string[] } = { crees: [], sansCentre: [] };
    if (vers === "ACTIF") {
      // Les produits signés rejoignent leurs centres (C-90), comme à l'acceptation d'une proposition.
      rattachements = await rattacherProduitsDuContrat(tx, c.organisationId, c.lignes, auteurId);
      const gagnees = await gagnerOpportunitesOuvertes(tx, { organisationId: c.organisationId, auteurId, maintenant: new Date(), productIds: c.lignes.map((l) => l.productId) });
      bilan = await bilanOpportunites(tx, c.organisationId, gagnees);
    }
    return { contrat: await tx.crmContrat.findUniqueOrThrow({ where: { id }, include: inclureLignes }), bilan,
      rattachementsCrees: rattachements.crees.length, sansCentre: phraseSansCentre(rattachements.sansCentre), idsRattaches: rattachements.crees };
  });
  await evaluerRattachements(resultat.idsRattaches);
  const { idsRattaches: _ids, ...reponse } = resultat;
  return reponse;
}
export async function supprimerContrat(id: number, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    const c = await chargerSousVerrou(tx, id);
    if (c.statut !== "BROUILLON") throw new ErreurMetier("Seul un brouillon de contrat peut être supprimé.", 409);
    const r = await tx.crmContrat.deleteMany({ where: { id, statut: "BROUILLON", majLe: c.majLe } });
    if (!r.count) throw conflitContrat();
    await journaliser(tx, { type: "CONTRAT_MODIFIE", organisationId: c.organisationId, contratId: id, auteurId, resume: "Brouillon de contrat supprimé" });
    return { supprime: true };
  });
}
