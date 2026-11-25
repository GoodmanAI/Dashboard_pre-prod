import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { champsChanges } from "@/pilot/lib/evenements/diff";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { sansErreurBrute, traduireErreurBase, type MessagesErreurBase } from "@/pilot/lib/erreursBase";
import type { creationConcurrent, creationReleve, modificationConcurrent, modificationReleve, suppressionReleve } from "@/pilot/lib/validation/concurrent";
import { MESSAGE_DOUBLON, messageSuppressionRefusee, trouverDoublon } from "./regles";

/**
 * Les écritures des concurrents et de leurs relevés (lot R). Chaque écriture
 * passe par le journal, qui ne porte jamais l'offre, les notes, les conditions,
 * la source, ni le nom saisi : le résumé vient des libellés du code, la cible
 * est un identifiant, les champs de texte libre ne sont que nommés (C-27).
 * Un événement de concurrent n'a pas d'organisation, comme ceux des apporteurs.
 */

type Tx = Prisma.TransactionClient;
const VERROU_NOMS = 72301;
const conflit = () => new ErreurMetier("Ce concurrent vient de changer. Rechargez la page.", 409);
/** Une erreur de la base sort traduite, jamais brute : son message pourrait recopier l'offre, les notes ou la source. */
export const MESSAGES_BASE_CONCURRENT: MessagesErreurBase = {
  contrainte: "Le concurrent n'a pas pu être enregistré. Vérifiez les champs saisis.",
  disparu: "Le concurrent ou le relevé vient d'être supprimé. Rechargez la page.",
  conflit: "Ce concurrent vient de changer. Rechargez la page.",
  panne: "Écriture d'un concurrent impossible : erreur de la base.",
  ecriture: "Écriture d'un concurrent",
};
const transaction = <T>(fn: (tx: Tx) => Promise<T>) => sansErreurBrute(() => transactionJournalisee(fn), MESSAGES_BASE_CONCURRENT);

/** Sérialise les créations et les renommages : le nom se compare sans la casse, ce que l'unicité de la base ne sait pas faire. */
async function verrouillerLesNoms(tx: Tx) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(${VERROU_NOMS}::integer, 0)`;
}
/** Exclusif : la suppression et la modification attendent les écritures qui s'appuient sur ce concurrent. */
async function verrouillerConcurrent(tx: Tx, id: number) {
  const lignes = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "CrmConcurrent" WHERE id = ${id} FOR UPDATE`;
  if (!lignes.length) throw new ErreurMetier("Concurrent inconnu.", 404);
}
/** Partagé : plusieurs relevés s'ajoutent ensemble, aucun ne s'ajoute à un concurrent qu'on supprime. */
async function verrouillerPourReleve(tx: Tx, id: number) {
  const lignes = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "CrmConcurrent" WHERE id = ${id} FOR SHARE`;
  if (!lignes.length) throw new ErreurMetier("Concurrent inconnu.", 404);
}
/** La course que le verrou ne couvre pas : deux noms exactement identiques, rattrapés par l'unicité de la base. */
function erreurNom(erreur: unknown): never {
  if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") throw new ErreurMetier(MESSAGE_DOUBLON, 409);
  throw traduireErreurBase(erreur, MESSAGES_BASE_CONCURRENT);
}
async function refuserDoublon(tx: Tx, nom: string, sauf?: number) {
  const existants = await tx.crmConcurrent.findMany({ select: { id: true, nom: true } });
  if (trouverDoublon(existants, nom, sauf)) throw new ErreurMetier(MESSAGE_DOUBLON, 409);
}

/** Les champs d'un relevé qui ne sont ni du texte libre : on les garde au journal, avec leur valeur. */
const CHAMPS_RELEVE_SURS = ["releveLe", "prixSalleMoisCentimes", "prixInstallationCentimes"] as const;
function surs(valeurs: Partial<Record<(typeof CHAMPS_RELEVE_SURS)[number], unknown>>) {
  return Object.fromEntries(CHAMPS_RELEVE_SURS.filter((c) => valeurs[c] !== undefined).map((c) => [c, valeurs[c]]));
}

/* ----------------------------- Concurrents ----------------------------- */

export async function creerConcurrent({ premierReleve, ...champs }: z.output<typeof creationConcurrent>, auteurId: number) {
  try {
    return await transactionJournalisee(async (tx) => {
      await verrouillerLesNoms(tx);
      await refuserDoublon(tx, champs.nom);
      const concurrent = await tx.crmConcurrent.create({ data: { ...champs, creeParId: auteurId } });
      await journaliser(tx, { type: "CONCURRENT_CREE", auteurId, resume: "Concurrent créé", apres: { concurrentId: concurrent.id, type: concurrent.type } });
      if (premierReleve) {
        const releve = await tx.crmReleveConcurrent.create({ data: { ...premierReleve, concurrentId: concurrent.id, creeParId: auteurId } });
        await journaliser(tx, { type: "RELEVE_CONCURRENT_AJOUTE", auteurId, resume: "Relevé de prix ajouté",
          apres: { concurrentId: concurrent.id, releveId: releve.id, ...surs(releve) } });
      }
      return concurrent;
    });
  } catch (erreur) { return erreurNom(erreur); }
}

export async function modifierConcurrent(id: number, { majLe, ...champs }: z.output<typeof modificationConcurrent>, auteurId: number) {
  try {
    return await transactionJournalisee(async (tx) => {
      if (champs.nom !== undefined) await verrouillerLesNoms(tx);
      await verrouillerConcurrent(tx, id);
      const actuel = await tx.crmConcurrent.findUniqueOrThrow({ where: { id } });
      if (+actuel.majLe !== +majLe) throw conflit();
      if (champs.nom !== undefined && champs.nom !== actuel.nom) await refuserDoublon(tx, champs.nom, id);
      const diff = champsChanges(actuel, champs, Object.keys(champs) as (keyof typeof champs)[]);
      const touches = Object.keys(diff.apres);
      if (!touches.length) return actuel;
      const ecrites = await tx.crmConcurrent.updateMany({ where: { id, majLe: actuel.majLe },
        data: { ...diff.apres, majLe: new Date(Math.max(Date.now(), +actuel.majLe + 1)) } });
      if (!ecrites.count) throw conflit();
      const type = diff.apres.type === undefined ? {} : { type: diff.apres.type };
      await journaliser(tx, { type: "CONCURRENT_MODIFIE", auteurId, resume: "Concurrent modifié",
        avant: { concurrentId: id, ...(diff.avant.type === undefined ? {} : { type: diff.avant.type }) },
        apres: { concurrentId: id, champs: touches, ...type } });
      return tx.crmConcurrent.findUniqueOrThrow({ where: { id } });
    });
  } catch (erreur) { return erreurNom(erreur); }
}

/**
 * Refusée tant qu'une organisation désigne ce concurrent, en place ou gagnant :
 * le lien se perdrait en silence (clé étrangère `SET NULL`). Sans lien, le
 * concurrent part avec ses relevés (suppression en cascade).
 */
export async function supprimerConcurrent(id: number, auteurId: number) {
  return transaction(async (tx) => {
    await verrouillerConcurrent(tx, id);
    const liees = await tx.crmOrganisation.count({ where: { OR: [{ concurrentId: id }, { concurrentGagnantId: id }] } });
    if (liees) throw new ErreurMetier(messageSuppressionRefusee(liees), 409);
    const releves = await tx.crmReleveConcurrent.count({ where: { concurrentId: id } });
    await tx.crmConcurrent.delete({ where: { id } });
    await journaliser(tx, { type: "CONCURRENT_SUPPRIME", auteurId, resume: "Concurrent supprimé", avant: { concurrentId: id, releves } });
    return { supprime: true };
  });
}

/* ----------------------------- Relevés ----------------------------- */

export async function ajouterReleve(concurrentId: number, champs: z.output<typeof creationReleve>, auteurId: number) {
  return transaction(async (tx) => {
    await verrouillerPourReleve(tx, concurrentId);
    const releve = await tx.crmReleveConcurrent.create({ data: { ...champs, concurrentId, creeParId: auteurId } });
    await journaliser(tx, { type: "RELEVE_CONCURRENT_AJOUTE", auteurId, resume: "Relevé de prix ajouté",
      apres: { concurrentId, releveId: releve.id, ...surs(releve) } });
    return releve;
  });
}

const releveChange = () => new ErreurMetier("Ce relevé vient de changer. Rechargez la page.", 409);

/**
 * Corrige un relevé lu à la version `majLe` (C-26). Si quelqu'un l'a corrigé
 * depuis, quel que soit le champ, le second reçoit 409 : l'écran renvoyait des
 * valeurs périmées. Un relevé supprimé entre-temps répond 404. Rien de changé :
 * rien n'est écrit.
 */
export async function modifierReleve(concurrentId: number, releveId: number, { majLe, ...champs }: z.output<typeof modificationReleve>, auteurId: number) {
  return transaction(async (tx) => {
    const actuel = await tx.crmReleveConcurrent.findFirst({ where: { id: releveId, concurrentId } });
    if (!actuel) throw new ErreurMetier("Relevé inconnu.", 404);
    if (+actuel.majLe !== +majLe) throw releveChange();
    const diff = champsChanges(actuel, champs, Object.keys(champs) as (keyof typeof champs)[]);
    const touches = Object.keys(diff.apres);
    if (!touches.length) return actuel;
    // La version avance toujours, même deux écritures dans la même milliseconde.
    const ecrites = await tx.crmReleveConcurrent.updateMany({ where: { id: releveId, concurrentId, majLe: actuel.majLe },
      data: { ...diff.apres, majLe: new Date(Math.max(Date.now(), +actuel.majLe + 1)) } });
    if (!ecrites.count) throw releveChange();
    await journaliser(tx, { type: "RELEVE_CONCURRENT_MODIFIE", auteurId, resume: "Relevé de prix modifié",
      avant: { concurrentId, releveId, ...surs(diff.avant) }, apres: { concurrentId, releveId, champs: touches, ...surs(diff.apres) } });
    return tx.crmReleveConcurrent.findUniqueOrThrow({ where: { id: releveId } });
  });
}

/** Supprime un relevé. `majLe` donné : seulement s'il n'a pas changé depuis la lecture de l'écran, sinon 409. */
export async function supprimerReleve(concurrentId: number, releveId: number, { majLe }: z.output<typeof suppressionReleve>, auteurId: number) {
  return transaction(async (tx) => {
    const supprimes = await tx.crmReleveConcurrent.deleteMany({ where: { id: releveId, concurrentId, ...(majLe ? { majLe } : {}) } });
    if (!supprimes.count) {
      const existe = await tx.crmReleveConcurrent.count({ where: { id: releveId, concurrentId } });
      throw existe ? releveChange() : new ErreurMetier("Relevé inconnu.", 404);
    }
    await journaliser(tx, { type: "RELEVE_CONCURRENT_SUPPRIME", auteurId, resume: "Relevé de prix supprimé", avant: { concurrentId, releveId } });
    return { supprime: true };
  });
}
