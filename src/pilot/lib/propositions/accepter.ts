import { conflitContrat, ecrireConditionnellement as ecrireContrat, journaliserStatut as journaliserContrat } from "@/pilot/lib/contrats/commun";
import { debutDuJour } from "@/pilot/lib/dates";
import type { z } from "zod";
import type { acceptationProposition } from "@/pilot/lib/validation/proposition";
import { journaliser } from "@/pilot/lib/evenements/journaliser";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { cheminVersSigne } from "@/pilot/lib/pipeline";
import { convertirEnClient } from "@/pilot/lib/organisations/convertir";
import { gagnerOpportunitesOuvertes } from "@/pilot/lib/opportunites/gerer";
import { ligneAuNet, MESSAGE_VERSION_REMPLACEE_ACCEPTER } from "./regles";
import { evaluerRattachements, phraseSansCentre, rattacherProduitsDuContrat } from "@/pilot/lib/centres/rattacherDepuisContrat";
import { chargerSousVerrou, copierLigne, ecrireConditionnellement, exigerVersionEnAttente, inclureLignes, journaliserStatut, verifierTransition, transactionProposition } from "./commun";

export async function accepter(id: number, { debuteLe, remplaceContratIds = [] }: z.output<typeof acceptationProposition>, auteurId: number) {
  const resultat = await transactionProposition(async (tx) => {
    const p = await chargerSousVerrou(tx, id);
    verifierTransition(p, "ACCEPTEE");
    // Seule la version qui attend une réponse s'accepte : une ancienne version restée envoyée a été remplacée.
    await exigerVersionEnAttente(tx, p, MESSAGE_VERSION_REMPLACEE_ACCEPTER);
    if (!p.lignes.length) throw new ErreurMetier("Ajoutez au moins une ligne avant l'acceptation.", 400);
    const maintenant = new Date();
    const idsRemplaces = [...new Set(remplaceContratIds)];
    const remplaces = await tx.crmContrat.findMany({ where: { id: { in: idsRemplaces }, organisationId: p.organisationId, statut: "ACTIF" } });
    if (remplaces.length !== idsRemplaces.length) throw new ErreurMetier("Les contrats à terminer doivent être actifs et appartenir à cette organisation.", 400);
    const termineLe = debuteLe ?? maintenant;
    if (remplaces.some((c) => c.signeLe && debutDuJour(termineLe) < debutDuJour(c.signeLe))) throw new ErreurMetier("La date de début ne peut pas précéder la signature d'un contrat remplacé.", 400);
    for (const c of remplaces) {
      await ecrireContrat(tx, c, { statut: "TERMINE", termineLe });
      await journaliserContrat(tx, c, "TERMINE", auteurId);
    }
    await ecrireConditionnellement(tx, p, { statut: "ACCEPTEE", repondueLe: maintenant });
    const autres = await tx.crmProposition.findMany({ where: { organisationId: p.organisationId, id: { not: id }, statut: { in: ["ENVOYEE", "EN_DISCUSSION"] } } });
    for (const autre of autres) {
      await ecrireConditionnellement(tx, autre, { statut: "REFUSEE", repondueLe: maintenant });
      await journaliserStatut(tx, autre, "REFUSEE", auteurId);
    }
    // Copiées au net (C-39) : une ligne offerte devient une ligne à 0, offerte, avec son libellé (lot S).
    const lignes = p.lignes.map((l) => ligneAuNet(copierLigne(l), p.remisePourMille));
    // Un brouillon sans ligne, laissé par une conversion sans proposition (C-71), devient ce contrat : sinon il
    // resterait « À compléter » dans Ventes et son activation compterait le signé deux fois. Le plus récent s'il y en
    // a plusieurs ; les autres restent. Un brouillon qui a déjà des lignes n'est pas touché : la boîte le signale.
    const brouillon = await tx.crmContrat.findFirst({ where: { organisationId: p.organisationId, statut: "BROUILLON", lignes: { none: {} } },
      orderBy: [{ creeLe: "desc" }, { id: "desc" }] });
    let contrat;
    if (brouillon) {
      const repris = await tx.crmContrat.updateMany({ where: { id: brouillon.id, statut: "BROUILLON", majLe: brouillon.majLe, lignes: { none: {} } }, data: {
        statut: "ACTIF", signeLe: maintenant, debuteLe: debuteLe ?? brouillon.debuteLe, propositionId: id,
        engagementMois: p.engagementMois ?? brouillon.engagementMois, preavisMois: p.preavisMois ?? brouillon.preavisMois,
        reference: brouillon.reference ?? `Proposition v${p.version}`, majLe: new Date(Math.max(Date.now(), +brouillon.majLe + 1)),
      } });
      if (!repris.count) throw conflitContrat();
      await tx.crmLigneContrat.createMany({ data: lignes.map((l) => ({ ...l, contratId: brouillon.id })) });
      contrat = await tx.crmContrat.findUniqueOrThrow({ where: { id: brouillon.id }, include: { lignes: { orderBy: { id: "asc" } } } });
    } else {
      contrat = await tx.crmContrat.create({ data: {
        organisationId: p.organisationId, statut: "ACTIF", signeLe: maintenant, debuteLe: debuteLe ?? null,
        engagementMois: p.engagementMois, preavisMois: p.preavisMois, propositionId: id, reference: `Proposition v${p.version}`,
        lignes: { create: lignes },
      }, include: { lignes: { orderBy: { id: "asc" } } } });
    }
    // Les produits signés rejoignent leurs centres (C-90) : l'onglet Centres et la check-list les montrent aussitôt.
    const rattachements = await rattacherProduitsDuContrat(tx, p.organisationId, contrat.lignes, auteurId);
    // Les opportunités ouvertes des produits de la proposition sont gagnées.
    await gagnerOpportunitesOuvertes(tx, { organisationId: p.organisationId, auteurId, maintenant, productIds: p.lignes.map((l) => l.productId) });
    // Avant Signé, l'acceptation convertit : chaque étape manquante est franchie, une à une, dans cette transaction.
    // Déjà cliente, contrat terminé ou en sortie : le contrat est créé et l'étape ne bouge pas.
    const org = await tx.crmOrganisation.findUniqueOrThrow({ where: { id: p.organisationId } });
    const etapesFranchies = cheminVersSigne(org.etape) ? (await convertirEnClient(tx, { organisationId: org.id, auteurId, etapeLue: org.etape })).etapesFranchies : [];
    const etapeChangee = etapesFranchies.length > 0;
    await journaliserStatut(tx, p, "ACCEPTEE", auteurId);
    if (brouillon) {
      await journaliser(tx, { type: "CONTRAT_MODIFIE", organisationId: p.organisationId, contratId: contrat.id, auteurId,
        resume: `Contrat en brouillon activé depuis la version ${p.version}`,
        avant: { statut: "BROUILLON" }, apres: { statut: "ACTIF", propositionId: id, lignes: p.lignes.length } });
    } else {
      await journaliser(tx, { type: "CONTRAT_CREE", organisationId: p.organisationId, contratId: contrat.id, auteurId,
        resume: `Contrat créé depuis la version ${p.version}`, apres: { propositionId: id, lignes: p.lignes.length } });
    }
    const proposition = await tx.crmProposition.findUniqueOrThrow({ where: { id }, include: inclureLignes });
    return { proposition, contrat, etapeChangee, etapesFranchies, brouillonRepris: brouillon !== null,
      rattachementsCrees: rattachements.crees.length, sansCentre: phraseSansCentre(rattachements.sansCentre), idsRattaches: rattachements.crees };
  });
  await evaluerRattachements(resultat.idsRattaches);
  const { idsRattaches: _ids, ...reponse } = resultat;
  return reponse;
}
