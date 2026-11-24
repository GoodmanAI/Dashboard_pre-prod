import type { CrmTypeDemande } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { debutDuJour } from "@/pilot/lib/dates";
import { peutLirePilot } from "@/pilot/lib/autorisations";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { LIBELLES_DEMANDE, refusAnnuler, refusCreer, refusTraiter, type Refus } from "./regles";

import { lienFiche, notifier, prevenirLesCloches } from "@/pilot/lib/notifications";
type Acteur = { id: number; role: string };
const lever = (refus: Refus) => { if (refus) throw new ErreurMetier(refus.message, refus.statut); };

export type NouvelleDemande = {
  organisationId: number; type: CrmTypeDemande; destinataireId: number;
  echeanceLe?: Date | null; precisions?: string | null; centreProduitId?: number | null; etapeIntegrationId?: number | null;
};

/**
 * Crée une demande. Le résumé du journal nomme le type et le destinataire,
 * jamais les précisions (C-22) : elles restent sur la demande.
 */
export async function creerDemande(p: NouvelleDemande, acteur: Acteur) {
  lever(refusCreer({ destinataireId: p.destinataireId, echeanceLe: p.echeanceLe ?? null }, acteur, debutDuJour(new Date())));
  const [organisation, destinataire] = await Promise.all([
    prisma.crmOrganisation.findUnique({ where: { id: p.organisationId }, select: { id: true, raisonSocialeNom: true } }),
    prisma.user.findUnique({ where: { id: p.destinataireId }, select: { id: true, name: true, role: true, accesPilot: { select: { retireLe: true } } } }),
  ]);
  if (!organisation) throw new ErreurMetier("Client inconnu.", 404);
  if (!destinataire || !peutLirePilot(destinataire.role)) throw new ErreurMetier("Choisissez une personne de l'équipe Lyrae.", 400);
  // Un compte dont l'accès est retiré (C-64) ne verrait jamais la demande.
  if (destinataire.accesPilot?.retireLe) throw new ErreurMetier(`${destinataire.name ?? "Ce collègue"} n'a plus accès à Pilot. Choisissez quelqu'un d'autre.`, 400);
  if (p.centreProduitId) {
    const r = await prisma.crmCentreProduit.findFirst({ where: { id: p.centreProduitId, centre: { organisationId: p.organisationId } }, select: { id: true } });
    if (!r) throw new ErreurMetier("Ce produit n'appartient pas à ce client.", 400);
  }
  return transactionJournalisee(async (tx) => {
    const demande = await tx.crmDemande.create({ data: { ...p, precisions: p.precisions ?? null, echeanceLe: p.echeanceLe ?? null, demandeurId: acteur.id } });
    await journaliser(tx, { type: "DEMANDE_CREEE", organisationId: p.organisationId, auteurId: acteur.id,
      ...(p.centreProduitId ? { centreProduitId: p.centreProduitId } : {}), ...(p.etapeIntegrationId ? { etapeIntegrationId: p.etapeIntegrationId } : {}),
      resume: `Demande à ${destinataire.name ?? "un collègue"} : ${LIBELLES_DEMANDE[p.type]}`,
      apres: { demandeId: demande.id, type: p.type, destinataireId: p.destinataireId, echeanceLe: p.echeanceLe ?? null } });
    // La cloche commune (Dashboard et Pilot) du destinataire.
    await notifier(tx, [{ userId: p.destinataireId, type: "pilot.demande", cle: `demande-${demande.id}`, lien: lienFiche(p.organisationId),
      message: `Nouvelle demande pour vous : ${LIBELLES_DEMANDE[p.type]}, ${organisation.raisonSocialeNom}.` }]);
    return demande;
  }).then((demande) => { prevenirLesCloches(); return demande; });
}

async function lire(id: number) {
  const d = await prisma.crmDemande.findUnique({ where: { id } });
  if (!d) throw new ErreurMetier("Demande inconnue.", 404);
  return d;
}

/** Marque faite, avec une réponse facultative. Écriture conditionnée par le statut lu (C-26). */
export async function traiterDemande(id: number, reponse: string | null, acteur: Acteur) {
  const d = await lire(id);
  lever(refusTraiter(d, acteur));
  return transactionJournalisee(async (tx) => {
    const maintenant = new Date();
    const ecrit = await tx.crmDemande.updateMany({ where: { id, statut: "OUVERTE" }, data: { statut: "FAITE", traiteeLe: maintenant, reponse } });
    if (ecrit.count !== 1) throw new ErreurMetier("Cette demande est déjà traitée. Rechargez la page.", 409);
    await journaliser(tx, { type: "DEMANDE_TRAITEE", organisationId: d.organisationId, auteurId: acteur.id,
      resume: `Demande faite : ${LIBELLES_DEMANDE[d.type]}`, avant: { statut: "OUVERTE" }, apres: { demandeId: id, statut: "FAITE" } });
    return { ...d, statut: "FAITE" as const, traiteeLe: maintenant, reponse };
  });
}

export async function annulerDemande(id: number, acteur: Acteur) {
  const d = await lire(id);
  lever(refusAnnuler(d, acteur));
  return transactionJournalisee(async (tx) => {
    const maintenant = new Date();
    const ecrit = await tx.crmDemande.updateMany({ where: { id, statut: "OUVERTE" }, data: { statut: "ANNULEE", traiteeLe: maintenant } });
    if (ecrit.count !== 1) throw new ErreurMetier("Cette demande est déjà traitée. Rechargez la page.", 409);
    await journaliser(tx, { type: "DEMANDE_TRAITEE", organisationId: d.organisationId, auteurId: acteur.id,
      resume: `Demande annulée : ${LIBELLES_DEMANDE[d.type]}`, avant: { statut: "OUVERTE" }, apres: { demandeId: id, statut: "ANNULEE" } });
    return { ...d, statut: "ANNULEE" as const, traiteeLe: maintenant };
  });
}
