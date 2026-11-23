import type { Prisma } from "@prisma/client";
import { exiger, peutModifierLesMontants, peutVoirCa, type Acteur } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { verrouillerOrganisation } from "@/pilot/lib/organisations/comptes";
import { lireGrilleEnVigueurVerrouillee } from "@/pilot/lib/tarifs/grille";
import { debutDuJour } from "@/pilot/lib/dates";
import { premierPoc, prixFormation, type CycleFacturation } from "./calendrier";

/** Sous le verrou du dossier. Un nouveau cycle ne recrée jamais une formation. */
export async function assurerFormationPoc(tx: Prisma.TransactionClient, organisationId: number, courant: CycleFacturation, auteurId: number) {
  if (await tx.crmFormationPoc.findUnique({ where: { organisationId } })) return;
  const cycles = await tx.crmCyclePoc.findMany({ where: { organisationId }, select: { id: true, debuteLe: true, prolongeLe: true } });
  const premier = premierPoc([...cycles, courant])!;
  const prix = prixFormation(await lireGrilleEnVigueurVerrouillee(tx, premier.debuteLe));
  await tx.crmFormationPoc.create({ data: { organisationId, cycleId: premier.id, debuteLe: premier.debuteLe, ...prix } });
  await journaliser(tx, { type: "FORMATION_POC_CREEE", organisationId, auteurId, resume: "Formation du premier POC enregistrée",
    apres: { cycleId: premier.id, debuteLe: premier.debuteLe, ...prix } });
}

export type ModificationFormation = { montantCentimes?: number; factureEmiseLe?: Date };
export function refusModificationFormation(f: { montantCentimes: number | null; debuteLe: Date; factureEmiseLe: Date | null }, p: ModificationFormation, maintenant: Date): string | null {
  if (p.montantCentimes !== undefined && (!Number.isInteger(p.montantCentimes) || p.montantCentimes < 0 || p.montantCentimes > 2147483647)) return "Le prix doit être un nombre entier de centimes positif ou nul.";
  if (p.montantCentimes !== undefined && f.montantCentimes !== null) return "Le prix de cette formation est déjà conservé. Il ne se réécrit pas.";
  if (p.factureEmiseLe) {
    if (f.factureEmiseLe) return "La facture de formation est déjà déclarée émise.";
    if (f.montantCentimes === null && p.montantCentimes === undefined) return "Renseignez le prix avant de déclarer la facture émise.";
    if (!Number.isFinite(+p.factureEmiseLe) || debutDuJour(p.factureEmiseLe) < f.debuteLe || debutDuJour(p.factureEmiseLe) > debutDuJour(maintenant)) return "La date de facture doit être comprise entre le début du POC et aujourd'hui.";
  }
  return null;
}

export async function modifierFormationPoc(organisationId: number, p: ModificationFormation, acteur: Acteur & { id: number }, maintenant = new Date()) {
  exiger(peutVoirCa(acteur) && peutModifierLesMontants(acteur));
  return transactionJournalisee(async (tx) => {
    await verrouillerOrganisation(tx, organisationId);
    const f = await tx.crmFormationPoc.findUnique({ where: { organisationId } });
    if (!f) throw new ErreurMetier("Aucune formation de POC sur ce dossier. Enregistrez d'abord le début du POC.", 404);
    const refus = refusModificationFormation(f, p, maintenant);
    if (refus) throw new ErreurMetier(refus, 409);
    const data = { ...(p.montantCentimes !== undefined ? { montantCentimes: p.montantCentimes } : {}),
      ...(p.factureEmiseLe ? { factureEmiseLe: debutDuJour(p.factureEmiseLe) } : {}) };
    await tx.crmFormationPoc.update({ where: { organisationId }, data });
    if (p.montantCentimes !== undefined) await journaliser(tx, { type: "FORMATION_POC_PRIX_RENSEIGNE", organisationId, auteurId: acteur.id,
      resume: "Prix de formation renseigné", avant: { montantCentimes: null }, apres: { cycleId: f.cycleId, montantCentimes: p.montantCentimes } });
    if (p.factureEmiseLe) await journaliser(tx, { type: "FORMATION_POC_FACTURE_EMISE", organisationId, auteurId: acteur.id,
      resume: "Facture de formation déclarée émise", apres: { cycleId: f.cycleId, factureEmiseLe: data.factureEmiseLe! } });
    return { enregistre: true };
  });
}
