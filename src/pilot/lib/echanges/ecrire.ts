import type { CrmEchange, Prisma } from "@prisma/client";
import type { z } from "zod";
import type { saisieEchange, modificationEchange } from "@/pilot/lib/validation/echange";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { debutDuJour } from "@/pilot/lib/dates";
import { journaliser } from "@/pilot/lib/evenements/journaliser";
import { resumeEchange } from "./libelles";

export function verifierDateRendezVous(le: Date, maintenant: Date) {
  if (le < debutDuJour(maintenant)) throw new ErreurMetier("Un rendez-vous se planifie aujourd'hui ou plus tard.", 400);
}

/** Un jalon franchi est une étape du plan de signature, pas un contact : il n'avance rien (C-41). */
export async function avancerDernierContact(tx: Prisma.TransactionClient, e: Pick<CrmEchange, "type" | "statut" | "organisationId" | "contactId" | "surveneuLe">) {
  if (e.statut !== "REALISE" || e.type === "JALON") return;
  await tx.crmOrganisation.updateMany({
    where: { id: e.organisationId, OR: [{ dernierEchangeLe: null }, { dernierEchangeLe: { lt: e.surveneuLe } }] },
    data: { dernierEchangeLe: e.surveneuLe },
  });
  if (e.contactId != null) await tx.crmContact.updateMany({
    where: { id: e.contactId, OR: [{ dernierContactLe: null }, { dernierContactLe: { lt: e.surveneuLe } }] },
    data: { dernierContactLe: e.surveneuLe },
  });
}

/** Appelée sous le verrou de l'organisation, par la saisie et par « Fait avec suite ». */
export async function saisirDansTransaction(tx: Prisma.TransactionClient, p: z.output<typeof saisieEchange> & { auteurId: number }, maintenant: Date) {
  if (p.type === "JALON") {
    if (p.aLaChargeDe !== "CLIENT" && p.aLaChargeDe !== "LYRAE") throw new ErreurMetier("Une étape clé est à la charge de Lyrae ou du client.", 400);
    if (!p.compteRendu?.trim()) throw new ErreurMetier("Indiquez le nom de l'étape clé.", 400);
  } else if (p.aLaChargeDe != null) throw new ErreurMetier("Le champ À la charge de est réservé aux étapes clés.", 400);
  if (p.statut === "PLANIFIE") {
    verifierDateRendezVous(p.surveneuLe, maintenant);
    if (p.prochaineAction != null || p.prochaineActionLe != null) {
      throw new ErreurMetier("Un rendez-vous planifié ne porte pas de prochaine action.", 400);
    }
  }
  if (p.contactId != null && !await tx.crmContact.findFirst({ where: { id: p.contactId, organisationId: p.organisationId }, select: { id: true } })) {
    throw new ErreurMetier("Contact inconnu pour cette organisation.", 404);
  }
  const echange = await tx.crmEchange.create({ data: p });
  await avancerDernierContact(tx, echange);
  await journaliser(tx, { type: "ECHANGE_SAISI", organisationId: p.organisationId, echangeId: echange.id, auteurId: p.auteurId,
    resume: p.statut === "PLANIFIE" ? (p.type === "JALON" ? "Étape clé planifiée" : "Rendez-vous planifié") : resumeEchange(p.type),
    apres: { type: p.type, statut: p.statut, surveneuLe: p.surveneuLe } });
  return echange;
}

/**
 * Un rendez-vous confirmé après coup garde sa date prévue : confirmer mercredi la
 * démo de lundi ne la déplace pas à mercredi. Réalisé en avance, il prend la
 * date de la confirmation, jamais une date future.
 */
export async function modifierDansTransaction(tx: Prisma.TransactionClient, e: CrmEchange,
  p: Exclude<z.output<typeof modificationEchange>, { operation: "corriger" }>, auteurId: number, maintenant: Date) {
  if (e.statut !== "PLANIFIE") throw new ErreurMetier("Ce rendez-vous n'est plus planifié.", 409);
  if (p.operation === "replanifier") verifierDateRendezVous(p.le, maintenant);
  const data = p.operation === "realiser"
    ? { statut: "REALISE" as const, surveneuLe: e.surveneuLe < maintenant ? e.surveneuLe : maintenant, compteRendu: e.type === "JALON" ? e.compteRendu : p.compteRendu, prochaineAction: p.prochaineAction, prochaineActionLe: p.prochaineActionLe }
    : p.operation === "annuler" ? { statut: "ANNULE" as const } : { surveneuLe: p.le };
  const ecriture = await tx.crmEchange.updateMany({ where: { id: e.id, statut: "PLANIFIE", surveneuLe: e.surveneuLe }, data });
  if (!ecriture.count) throw new ErreurMetier("Ce rendez-vous n'est plus planifié.", 409);
  const modifie = await tx.crmEchange.findUniqueOrThrow({ where: { id: e.id } });
  await avancerDernierContact(tx, modifie);
  const resumes = e.type === "JALON"
    ? { realiser: "Étape clé franchie", annuler: "Étape clé annulée", replanifier: "Étape clé replanifiée" }
    : { realiser: "Rendez-vous réalisé", annuler: "Rendez-vous annulé", replanifier: "Rendez-vous replanifié" };
  await journaliser(tx, { type: "ECHANGE_MODIFIE", organisationId: e.organisationId, echangeId: e.id, auteurId,
    resume: resumes[p.operation], avant: { statut: e.statut, surveneuLe: e.surveneuLe },
    apres: { statut: modifie.statut, surveneuLe: modifie.surveneuLe } });
  return modifie;
}

/** Pourquoi ce compte ne corrige pas cet échange, ou null : son auteur ou le super-administrateur (C-86). */
export function refusCorrection(e: Pick<CrmEchange, "auteurId" | "type">, acteur: { id: number; role: string }, compteRendu: string | null): string | null {
  if (acteur.role !== "SUPER_ADMIN" && e.auteurId !== acteur.id) return "Seul l'auteur de cet échange, ou le super-administrateur, peut corriger son texte.";
  if (e.type === "JALON" && !compteRendu?.trim()) return "Indiquez le nom de l'étape clé.";
  return null;
}

/** Corrige le texte d'un échange. Le journal dit qui et quand, jamais le texte, ni l'ancien ni le nouveau. */
export async function corrigerCompteRendu(tx: Prisma.TransactionClient, e: CrmEchange, compteRendu: string | null, acteur: { id: number; role: string }) {
  const refus = refusCorrection(e, acteur, compteRendu);
  if (refus) throw new ErreurMetier(refus, refus.startsWith("Seul") ? 403 : 400);
  const texte = compteRendu?.trim() || null;
  if (texte === e.compteRendu) return e;
  const modifie = await tx.crmEchange.update({ where: { id: e.id }, data: { compteRendu: texte } });
  await journaliser(tx, { type: "ECHANGE_MODIFIE", organisationId: e.organisationId, echangeId: e.id, auteurId: acteur.id,
    resume: e.type === "JALON" ? "Nom de l'étape clé corrigé" : "Compte rendu corrigé" });
  return modifie;
}
