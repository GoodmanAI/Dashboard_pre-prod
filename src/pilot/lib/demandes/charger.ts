import type { Prisma } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";

const choix = {
  id: true, organisationId: true, type: true, precisions: true, statut: true, echeanceLe: true, creeLe: true, traiteeLe: true, reponse: true,
  centreProduitId: true, demandeurId: true, destinataireId: true,
  organisation: { select: { raisonSocialeNom: true } },
  demandeur: { select: { name: true } }, destinataire: { select: { name: true } },
} satisfies Prisma.CrmDemandeSelect;

/** Une demande prête à afficher : dates en ISO, noms résolus. */
function enLigne(d: Prisma.CrmDemandeGetPayload<{ select: typeof choix }>) {
  return {
    id: d.id, organisationId: d.organisationId, organisationNom: d.organisation.raisonSocialeNom, type: d.type, precisions: d.precisions,
    statut: d.statut, echeanceLe: d.echeanceLe?.toISOString() ?? null, creeLe: d.creeLe.toISOString(), traiteeLe: d.traiteeLe?.toISOString() ?? null,
    reponse: d.reponse, demandeurId: d.demandeurId, destinataireId: d.destinataireId,
    demandeur: d.demandeur?.name ?? "Compte supprimé", destinataire: d.destinataire.name ?? "Sans nom",
  };
}
export type LigneDemande = ReturnType<typeof enLigne>;

// Ouvertes d'abord, par échéance (sans échéance en dernier), puis les plus récentes.
const ordre: Prisma.CrmDemandeOrderByWithRelationInput[] = [{ statut: "asc" }, { echeanceLe: { sort: "asc", nulls: "last" } }, { creeLe: "desc" }];

export type VueDemandes = "pour-moi" | "envoyees" | "toutes";

/** Les demandes d'une vue : ouvertes, puis les 30 dernières traitées. Deux requêtes. */
export async function chargerDemandes(vue: VueDemandes, utilisateurId: number) {
  const qui: Prisma.CrmDemandeWhereInput = vue === "pour-moi" ? { destinataireId: utilisateurId } : vue === "envoyees" ? { demandeurId: utilisateurId } : {};
  const [ouvertes, traitees] = await Promise.all([
    prisma.crmDemande.findMany({ where: { ...qui, statut: "OUVERTE" }, select: choix, orderBy: ordre, take: 200 }),
    prisma.crmDemande.findMany({ where: { ...qui, statut: { not: "OUVERTE" } }, select: choix, orderBy: { traiteeLe: "desc" }, take: 30 }),
  ]);
  return { ouvertes: ouvertes.map(enLigne), traitees: traitees.map(enLigne) };
}

/** Les demandes ouvertes d'un client, pour sa fiche. */
export async function demandesOuvertesDuClient(organisationId: number) {
  return (await prisma.crmDemande.findMany({ where: { organisationId, statut: "OUVERTE" }, select: choix, orderBy: ordre, take: 50 })).map(enLigne);
}

/** Pour Aujourd'hui et Mon compte : ce qu'on attend de moi, et le compte de ce que j'ai demandé. */
export async function demandesDuJour(utilisateurId: number) {
  const [pourMoi, envoyeesOuvertes] = await Promise.all([
    prisma.crmDemande.findMany({ where: { destinataireId: utilisateurId, statut: "OUVERTE" }, select: choix, orderBy: ordre, take: 50 }),
    prisma.crmDemande.count({ where: { demandeurId: utilisateurId, statut: "OUVERTE" } }),
  ]);
  return { pourMoi: pourMoi.map(enLigne), envoyeesOuvertes };
}
