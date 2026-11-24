import type { z } from "zod";
import type { CrmOpportunite, Prisma } from "@prisma/client";
import type { creationOpportunite, contenuOpportunite, conclusionOpportunite } from "@/pilot/lib/validation/opportunite";
import { transactionJournalisee, journaliser } from "@/pilot/lib/evenements/journaliser";
import { champsChanges } from "@/pilot/lib/evenements/diff";
import { verrouillerOrganisation } from "@/pilot/lib/organisations/comptes";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { PROBABILITE_PAR_ETAPE } from "@/pilot/lib/pipeline";
import { moisAttendu, type BilanOpportunites } from "./regles";

const conflit = () => new ErreurMetier("Cette opportunité vient de changer. Rechargez la page.", 409);
async function produitExistant(tx: Prisma.TransactionClient, id: number) {
  if (!await tx.product.findUnique({ where: { id }, select: { id: true } })) throw new ErreurMetier("Produit inconnu.", 400);
}
async function chargerSousVerrou(tx: Prisma.TransactionClient, id: number) {
  const initiale = await tx.crmOpportunite.findUnique({ where: { id } });
  if (!initiale) throw new ErreurMetier("Opportunité inconnue.", 404);
  await verrouillerOrganisation(tx, initiale.organisationId);
  const o = await tx.crmOpportunite.findUnique({ where: { id } });
  if (!o || +o.majLe !== +initiale.majLe) throw conflit();
  return o;
}
async function ecrire(tx: Prisma.TransactionClient, o: CrmOpportunite, data: Prisma.CrmOpportuniteUpdateManyMutationInput) {
  const resultat = await tx.crmOpportunite.updateMany({ where: { id: o.id, majLe: o.majLe, gagneeLe: null, perdueLe: null },
    data: { ...data, majLe: new Date(Math.max(Date.now(), +o.majLe + 1)) } });
  if (!resultat.count) throw conflit();
}
/**
 * Crée une opportunité dans la transaction reçue, avec son événement
 * OPPORTUNITE_CREEE : la route des opportunités et la saisie rapide d'un
 * prospect passent par ici, jamais par une copie. La probabilité par défaut est
 * celle de l'étape de l'organisation (C-44). Le verrou de l'organisation, s'il
 * en faut un, est pris par l'appelant.
 */
export async function creerOpportuniteDansTransaction(tx: Prisma.TransactionClient, champs: z.output<typeof creationOpportunite>, auteurId: number) {
  const org = await tx.crmOrganisation.findUniqueOrThrow({ where: { id: champs.organisationId }, select: { etape: true } });
  await produitExistant(tx, champs.productId);
  const defaut = PROBABILITE_PAR_ETAPE[org.etape];
  const o = await tx.crmOpportunite.create({ data: { ...champs, demarrageAttenduLe: moisAttendu(champs.demarrageAttenduLe ?? null),
    probabilite: champs.probabilite ?? defaut, probabiliteForcee: champs.probabilite !== undefined && champs.probabilite !== defaut } });
  await journaliser(tx, { type: "OPPORTUNITE_CREEE", organisationId: o.organisationId, opportuniteId: o.id, auteurId,
    resume: "Opportunité créée", apres: { productId: o.productId, montantMensuelCentimes: o.montantMensuelCentimes,
      montantMiseEnServiceCentimes: o.montantMiseEnServiceCentimes, probabilite: o.probabilite, probabiliteForcee: o.probabiliteForcee,
      categoriePrevision: o.categoriePrevision, demarrageAttenduLe: o.demarrageAttenduLe } });
  return o;
}
export async function creerOpportunite(champs: z.output<typeof creationOpportunite>, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    await verrouillerOrganisation(tx, champs.organisationId);
    return creerOpportuniteDansTransaction(tx, champs, auteurId);
  });
}
/**
 * Marque gagnées, dans la transaction reçue, les opportunités ouvertes d'une
 * organisation pour les produits donnés : ceux d'un contrat actif. Une seule
 * écriture groupée, conditionnelle (encore ouvertes), puis un événement
 * « Opportunité gagnée » par opportunité. L'appelant tient le verrou de
 * l'organisation, que prend toute écriture de `gagneeLe` ou `perdueLe` : si le
 * compte ne correspond pas, quelque chose a échappé au verrou, et on refuse
 * plutôt que de journaliser à l'aveugle. L'acceptation d'une proposition,
 * l'activation d'un contrat en brouillon et une ligne posée sur un contrat
 * actif partagent ce code (C-39, C-71). Sans produit, rien n'est gagné. Rend le
 * nombre d'opportunités gagnées.
 */
export async function gagnerOpportunitesOuvertes(tx: Prisma.TransactionClient, { organisationId, auteurId, maintenant, productIds }: {
  /** Une ligne sans produit (lot S) ne gagne aucune opportunité : ses `null` sont ignorés. */
  organisationId: number; auteurId: number; maintenant: Date; productIds: readonly (number | null)[];
}): Promise<number> {
  const produits = [...new Set(productIds.filter((id): id is number => id !== null))];
  if (!produits.length) return 0;
  const ids = (await tx.crmOpportunite.findMany({ where: {
    organisationId, gagneeLe: null, perdueLe: null, productId: { in: produits },
  }, select: { id: true }, orderBy: { id: "asc" } })).map((o) => o.id);
  if (!ids.length) return 0;
  const resultat = await tx.crmOpportunite.updateMany({ where: { id: { in: ids }, gagneeLe: null, perdueLe: null }, data: { gagneeLe: maintenant } });
  if (resultat.count !== ids.length) throw new ErreurMetier("Une opportunité vient de changer. Rechargez la page.", 409);
  for (const opportuniteId of ids) {
    await journaliser(tx, { type: "OPPORTUNITE_MODIFIEE", organisationId, opportuniteId, auteurId,
      resume: "Opportunité gagnée", avant: { gagneeLe: null }, apres: { gagneeLe: maintenant } });
  }
  return ids.length;
}
/**
 * Ce que l'écran dit après coup (C-71) : combien d'opportunités viennent d'être
 * gagnées, et celles qui restent ouvertes pour l'organisation, avec leur produit
 * et leur abonnement mensuel. Une lecture, sous le verrou de l'appelant.
 */
export async function bilanOpportunites(tx: Prisma.TransactionClient, organisationId: number, gagnees: number): Promise<BilanOpportunites> {
  const ouvertes = await tx.crmOpportunite.findMany({ where: { organisationId, gagneeLe: null, perdueLe: null },
    select: { montantMensuelCentimes: true, product: { select: { name: true } } }, orderBy: { id: "asc" } });
  return { gagnees, ouvertes: ouvertes.map((o) => ({ produit: o.product.name, montantMensuelCentimes: o.montantMensuelCentimes })) };
}
export async function modifierOpportunite(id: number, { revenirALEtape, ...champs }: z.output<typeof contenuOpportunite>, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    const o = await chargerSousVerrou(tx, id);
    if (o.gagneeLe || o.perdueLe) throw new ErreurMetier("Une opportunité gagnée ou perdue ne change plus.", 400);
    if (revenirALEtape && champs.probabilite !== undefined) throw new ErreurMetier("Choisissez une probabilité ou le retour à l'étape.", 400);
    const data: Partial<CrmOpportunite> = { ...champs };
    if (champs.demarrageAttenduLe !== undefined) data.demarrageAttenduLe = moisAttendu(champs.demarrageAttenduLe);
    if (champs.probabilite !== undefined) data.probabiliteForcee = true;
    if (revenirALEtape) {
      const org = await tx.crmOrganisation.findUniqueOrThrow({ where: { id: o.organisationId } });
      data.probabilite = PROBABILITE_PAR_ETAPE[org.etape]; data.probabiliteForcee = false;
    }
    const diff = champsChanges(o, data, ["productId", "libelle", "montantMensuelCentimes", "montantMiseEnServiceCentimes",
      "demarrageAttenduLe", "categoriePrevision", "probabilite", "probabiliteForcee"]);
    if (!Object.keys(diff.apres).length) return o;
    if (diff.apres.productId !== undefined) await produitExistant(tx, diff.apres.productId);
    await ecrire(tx, o, diff.apres);
    await journaliser(tx, { type: "OPPORTUNITE_MODIFIEE", organisationId: o.organisationId, opportuniteId: id, auteurId, resume: "Opportunité modifiée", ...diff });
    return tx.crmOpportunite.findUniqueOrThrow({ where: { id } });
  });
}
export async function conclureOpportunite(id: number, { issue, raisonPerte }: z.output<typeof conclusionOpportunite>, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    const o = await chargerSousVerrou(tx, id);
    if (o.gagneeLe || o.perdueLe) throw new ErreurMetier("Cette opportunité est déjà gagnée ou perdue. Rechargez la page.", 409);
    if (issue === "perdue" && (!raisonPerte?.trim() || raisonPerte.trim().length > 500)) throw new ErreurMetier("La raison de perte doit compter de 1 à 500 caractères.", 400);
    const maintenant = new Date();
    const dates = issue === "gagnee" ? { gagneeLe: maintenant } : { perdueLe: maintenant };
    await ecrire(tx, o, { ...dates, ...(issue === "perdue" ? { raisonPerte: raisonPerte!.trim() } : {}) });
    await journaliser(tx, { type: "OPPORTUNITE_MODIFIEE", organisationId: o.organisationId, opportuniteId: id, auteurId,
      resume: issue === "gagnee" ? "Opportunité gagnée" : "Opportunité perdue", avant: issue === "gagnee" ? { gagneeLe: null } : { perdueLe: null }, apres: dates });
    return tx.crmOpportunite.findUniqueOrThrow({ where: { id } });
  });
}
