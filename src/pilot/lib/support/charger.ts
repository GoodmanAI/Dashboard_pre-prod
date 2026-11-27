import type { Prisma } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";
import type { StatutSujet } from "./regles";

/** Les lectures des écrans du support (25/11/2026). Dates en ISO, noms résolus. */
const choixLigne = {
  id: true, titre: true, statut: true, statutDepuisLe: true, creeLe: true, majLe: true, organisationId: true, auteurId: true, ticketId: true,
  organisation: { select: { raisonSocialeNom: true, responsableId: true, responsable: { select: { name: true } } } },
  _count: { select: { messages: true } },
} satisfies Prisma.CrmSujetSupportSelect;

function enLigne(s: Prisma.CrmSujetSupportGetPayload<{ select: typeof choixLigne }>) {
  return {
    id: s.id, titre: s.titre, statut: s.statut as StatutSujet, statutDepuisLe: s.statutDepuisLe.toISOString(), creeLe: s.creeLe.toISOString(),
    majLe: s.majLe.toISOString(), organisationId: s.organisationId, client: s.organisation.raisonSocialeNom,
    commercial: s.organisation.responsable?.name ?? null, messages: s._count.messages, ticketId: s.ticketId,
  };
}
export type LigneSujet = ReturnType<typeof enLigne>;

export type VueSupport = "les-miens" | "tous";

/** Les sujets d'une vue : ouverts (à transmettre d'abord), puis les 30 derniers résolus. « Les miens » : mes clients et mes sujets. */
export async function chargerSujets(vue: VueSupport, utilisateurId: number) {
  const qui: Prisma.CrmSujetSupportWhereInput = vue === "les-miens"
    ? { OR: [{ organisation: { responsableId: utilisateurId } }, { auteurId: utilisateurId }] } : {};
  const [ouverts, resolus] = await Promise.all([
    prisma.crmSujetSupport.findMany({ where: { ...qui, statut: { not: "RESOLU" } }, select: choixLigne, orderBy: { majLe: "desc" }, take: 300 }),
    prisma.crmSujetSupport.findMany({ where: { ...qui, statut: "RESOLU" }, select: choixLigne, orderBy: { majLe: "desc" }, take: 30 }),
  ]);
  return { ouverts: ouverts.map(enLigne), resolus: resolus.map(enLigne) };
}

/** Les sujets d'un client, pour sa fiche : tous ceux qui ne sont pas résolus, puis les 5 derniers résolus. */
export async function sujetsDuClient(organisationId: number) {
  const [ouverts, resolus] = await Promise.all([
    prisma.crmSujetSupport.findMany({ where: { organisationId, statut: { not: "RESOLU" } }, select: choixLigne, orderBy: { majLe: "desc" }, take: 50 }),
    prisma.crmSujetSupport.findMany({ where: { organisationId, statut: "RESOLU" }, select: choixLigne, orderBy: { majLe: "desc" }, take: 5 }),
  ]);
  return [...ouverts, ...resolus].map(enLigne);
}

/** Un sujet et son fil, du plus ancien au plus récent. Null s'il n'existe pas. */
export async function chargerSujet(id: number) {
  const s = await prisma.crmSujetSupport.findUnique({
    where: { id },
    select: {
      ...choixLigne, auteur: { select: { name: true } },
      messages: { orderBy: { creeLe: "asc" }, select: { id: true, noteInterne: true, aDireAuClient: true, creeLe: true, auteurId: true, auteur: { select: { name: true } } } },
    },
  });
  if (!s) return null;
  return {
    ...enLigne(s), auteur: s.auteur?.name ?? null,
    fil: s.messages.map((m) => ({ id: m.id, noteInterne: m.noteInterne, aDireAuClient: m.aDireAuClient, creeLe: m.creeLe.toISOString(), auteurId: m.auteurId, auteur: m.auteur?.name ?? "Compte supprimé" })),
  };
}
export type SujetDetaille = NonNullable<Awaited<ReturnType<typeof chargerSujet>>>;

/** Les clients à proposer à l'ouverture d'un sujet, par nom. */
export async function clientsPourSujet() {
  return prisma.crmOrganisation.findMany({ select: { id: true, raisonSocialeNom: true }, orderBy: { raisonSocialeNom: "asc" }, take: 2000 })
    .then((l) => l.map((o) => ({ id: o.id, nom: o.raisonSocialeNom })));
}

/** Pour la pastille du menu : les sujets à transmettre de mes clients. */
export async function aTransmettrePourMoi(utilisateurId: number) {
  return prisma.crmSujetSupport.count({ where: { statut: "A_TRANSMETTRE", organisation: { responsableId: utilisateurId } } });
}
