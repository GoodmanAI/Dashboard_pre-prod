import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { champsChanges } from "@/pilot/lib/evenements/diff";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { sansErreurBrute, traduireErreurBase, type MessagesErreurBase } from "@/pilot/lib/erreursBase";
import { messageTarif, tarifComplet } from "@/pilot/lib/validation/tarif";
import type { creationGrille, creationTarif, modificationGrille, modificationTarif, suppressionGrille, suppressionTarif } from "@/pilot/lib/validation/tarif";
import { PHRASE_ANCIENNE_GRILLE } from "./affichage";
import { lireGrille } from "./lire";
import {
  MESSAGE_DOUBLON_CODE, MESSAGE_DOUBLON_DATE, classerGrilles, messageDateGrille, messageGrilleUtilisee, messageGrilleVide, messageRetraitTarif, messageSuppressionGrille,
  ordreSuivant, peutChangerLaDate, type StatutGrille,
} from "./regles";
import { codeJournal, codePourRole, messageRoleDejaPris, refusProduit, roleDuCode, type RoleTarif } from "./roles";

/**
 * Les écritures des grilles tarifaires et de leurs tarifs (lot S).
 *
 * - **Modifiable tant qu'aucune proposition ne l'utilise.** Sinon 409, avec la
 *   raison. Le chemin normal pour changer un prix est une nouvelle grille datée,
 *   copiée d'une grille existante.
 * - **Écriture conditionnelle** sur `majLe` de la grille (C-26) : chaque écriture
 *   de tarif la fait avancer, le second qui écrit sur une lecture périmée reçoit
 *   409. La ligne de la grille est verrouillée (`FOR UPDATE`) pour que le compte
 *   des propositions et l'écriture se suivent sans qu'une version préremplie
 *   s'intercale : `creerVersion` prend le même verrou en partage.
 * - **Journal** : les six types du lot S. Un événement de grille n'a pas
 *   d'organisation ; `avant` et `apres` portent des identifiants, des montants,
 *   des taux et des dates, jamais les notes ni les libellés (C-27). Le code n'y
 *   va que s'il est un code de référence ou un code opaque `TARIF_<n>`
 *   (`codeJournal`) : un ancien code tiré d'un libellé est du texte saisi.
 * - **Rôle** : un tarif s'ajoute par son rôle, qui fixe son code (`codePourRole`) ;
 *   un rôle de référence n'est qu'une fois dans une grille (409). Le rôle fixe
 *   aussi le produit relié : le sien ou aucun (`refusProduit`, 400).
 * - **Grille passée** : elle ne se modifie plus, même par l'API (409,
 *   `PHRASE_ANCIENNE_GRILLE`), comme une grille utilisée.
 * - **Grille en vigueur** : son dernier tarif ne se retire pas (400,
 *   `messageRetraitTarif`) : elle s'appliquerait sans aucun prix.
 */

type Tx = Prisma.TransactionClient;
const conflit = () => new ErreurMetier("Cette grille vient de changer. Rechargez la page.", 409);
/** Une erreur de la base sort traduite, jamais brute : son message pourrait recopier un libellé ou des notes. */
export const MESSAGES_BASE_GRILLE: MessagesErreurBase = {
  contrainte: "La grille n'a pas pu être enregistrée. Vérifiez les champs saisis.",
  disparu: "La grille ou le tarif vient d'être supprimé. Rechargez la page.",
  conflit: "Cette grille vient de changer. Rechargez la page.",
  panne: "Écriture d'une grille tarifaire impossible : erreur de la base.",
  ecriture: "Écriture d'une grille tarifaire",
};
const transaction = <T>(fn: (tx: Tx) => Promise<T>) => sansErreurBrute(() => transactionJournalisee(fn), MESSAGES_BASE_GRILLE);
const jour = (d: Date) => d.toISOString().slice(0, 10);

async function verrouillerGrille(tx: Tx, id: number) {
  const lignes = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "CrmGrilleTarifaire" WHERE id = ${id} FOR UPDATE`;
  if (!lignes.length) throw new ErreurMetier("Grille inconnue.", 404);
}

/** Le statut d'une grille à l'instant donné, calculé à la lecture comme sur la page (`classerGrilles`). */
async function statutDe(tx: Tx, id: number, maintenant: Date): Promise<StatutGrille> {
  const toutes = await tx.crmGrilleTarifaire.findMany({ select: { id: true, applicableLe: true } });
  return classerGrilles(toutes, maintenant).find((g) => g.id === id)!.statut;
}

/**
 * Verrouille, puis refuse une grille utilisée (409 et sa raison), une grille
 * passée (409, `PHRASE_ANCIENNE_GRILLE`) ou une lecture périmée (409). La raison
 * passe avant la version périmée : elle dit quoi faire.
 */
async function chargerModifiable(tx: Tx, id: number, majLe: Date, maintenant: Date) {
  await verrouillerGrille(tx, id);
  const actuelle = await tx.crmGrilleTarifaire.findUniqueOrThrow({ where: { id } });
  const raison = messageGrilleUtilisee(await tx.crmProposition.count({ where: { grilleId: id } }));
  if (raison) throw new ErreurMetier(raison, 409);
  const statut = await statutDe(tx, id, maintenant);
  if (statut === "PASSEE") throw new ErreurMetier(PHRASE_ANCIENNE_GRILLE, 409);
  if (+actuelle.majLe !== +majLe) throw conflit();
  return { grille: actuelle, statut };
}

/** La version de la grille avance toujours, même deux écritures dans la même milliseconde. */
async function avancerVersion(tx: Tx, g: { id: number; majLe: Date }, data: Prisma.CrmGrilleTarifaireUpdateManyMutationInput = {}) {
  const ecrites = await tx.crmGrilleTarifaire.updateMany({ where: { id: g.id, majLe: g.majLe }, data: { ...data, majLe: new Date(Math.max(Date.now(), +g.majLe + 1)) } });
  if (!ecrites.count) throw conflit();
}

/** La course que le verrou ne couvre pas : deux grilles créées pour le même jour, rattrapées par l'unicité de la base. */
function erreurDoublon(erreur: unknown, message: string): never {
  if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") throw new ErreurMetier(message, 409);
  throw traduireErreurBase(erreur, MESSAGES_BASE_GRILLE);
}

async function lireApresEcriture(tx: Tx, id: number) {
  return (await lireGrille(tx, id)) ?? (() => { throw new ErreurMetier("Grille inconnue.", 404); })();
}

/** Le code d'un tarif au journal, s'il n'est pas du texte saisi : `{ code }` ou rien. */
const code = (c: string) => { const sur = codeJournal(c); return sur === undefined ? {} : { code: sur }; };

/** Les champs d'un tarif qui ne sont pas du texte libre : on les garde au journal, avec leur valeur. */
const CHAMPS_SURS = ["productId", "type", "base", "montantHtCentimes", "pourMille", "ordre"] as const;
function surs(valeurs: Partial<Record<(typeof CHAMPS_SURS)[number], unknown>>) {
  return Object.fromEntries(CHAMPS_SURS.filter((c) => valeurs[c] !== undefined).map((c) => [c, valeurs[c]]));
}

/* ------------------------------ Grilles ------------------------------ */

/**
 * Crée une grille datée, vide ou copiée d'une grille existante. La date est
 * celle d'aujourd'hui ou d'un jour à venir (`messageDateGrille`) ; un jour n'a
 * qu'une grille. Une grille sans tarif ne se date pas d'aujourd'hui
 * (`messageGrilleVide`) : elle serait aussitôt en vigueur, sans aucun prix.
 */
export async function creerGrille({ applicableLe, notes, copierDe }: z.output<typeof creationGrille>, auteurId: number, maintenant: Date = new Date()) {
  const refus = messageDateGrille(applicableLe, maintenant) ?? (copierDe === undefined ? messageGrilleVide(applicableLe, 0, maintenant) : null);
  if (refus) throw new ErreurMetier(refus, 400);
  try {
    return await transactionJournalisee(async (tx) => {
      let tarifs: Prisma.CrmTarifCreateManyGrilleInput[] = [];
      if (copierDe !== undefined) {
        // Partagé : la source ne change pas pendant qu'on la copie.
        const verrouillee = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "CrmGrilleTarifaire" WHERE id = ${copierDe} FOR SHARE`;
        if (!verrouillee.length) throw new ErreurMetier("La grille à copier n'existe pas.", 404);
        tarifs = (await tx.crmTarif.findMany({ where: { grilleId: copierDe }, orderBy: [{ ordre: "asc" }, { id: "asc" }] }))
          .map(({ productId, libelle, code, type, base, montantHtCentimes, pourMille, ordre }) => ({ productId, libelle, code, type, base, montantHtCentimes, pourMille, ordre }));
        const vide = messageGrilleVide(applicableLe, tarifs.length, maintenant);
        if (vide) throw new ErreurMetier(vide, 400);
      }
      if (await tx.crmGrilleTarifaire.findUnique({ where: { applicableLe }, select: { id: true } })) throw new ErreurMetier(MESSAGE_DOUBLON_DATE, 409);
      const grille = await tx.crmGrilleTarifaire.create({ data: { applicableLe, notes: notes ?? null, creeParId: auteurId } });
      if (tarifs.length) await tx.crmTarif.createMany({ data: tarifs.map((t) => ({ ...t, grilleId: grille.id })) });
      await journaliser(tx, { type: "GRILLE_TARIFAIRE_CREEE", auteurId, resume: "Grille tarifaire créée",
        apres: { grilleId: grille.id, applicableLe: jour(grille.applicableLe), tarifs: tarifs.length, ...(copierDe === undefined ? {} : { copieDe: copierDe }) } });
      return lireApresEcriture(tx, grille.id);
    });
  } catch (erreur) { return erreurDoublon(erreur, MESSAGE_DOUBLON_DATE); }
}

export const MESSAGE_DATE_FIGEE = "La date d'une grille en vigueur ou passée ne change plus. Créez une nouvelle grille datée.";

/** Date et notes d'une grille que rien n'utilise. Seule une grille à venir change de date. */
export async function modifierGrille(id: number, { majLe, ...champs }: z.output<typeof modificationGrille>, auteurId: number, maintenant: Date = new Date()) {
  try {
    return await transactionJournalisee(async (tx) => {
      const { grille: actuelle, statut } = await chargerModifiable(tx, id, majLe, maintenant);
      const nouvelleDate = champs.applicableLe !== undefined && +champs.applicableLe !== +actuelle.applicableLe ? champs.applicableLe : undefined;
      if (nouvelleDate) {
        if (!peutChangerLaDate(statut)) throw new ErreurMetier(MESSAGE_DATE_FIGEE, 409);
        const refus = messageDateGrille(nouvelleDate, maintenant) ?? messageGrilleVide(nouvelleDate, await tx.crmTarif.count({ where: { grilleId: id } }), maintenant);
        if (refus) throw new ErreurMetier(refus, 400);
        if (await tx.crmGrilleTarifaire.findFirst({ where: { applicableLe: nouvelleDate, id: { not: id } }, select: { id: true } })) throw new ErreurMetier(MESSAGE_DOUBLON_DATE, 409);
      }
      const diff = champsChanges(actuelle, { applicableLe: nouvelleDate, notes: champs.notes }, ["applicableLe", "notes"]);
      const touches = Object.keys(diff.apres);
      if (!touches.length) return lireApresEcriture(tx, id);
      await avancerVersion(tx, actuelle, diff.apres);
      await journaliser(tx, { type: "GRILLE_TARIFAIRE_MODIFIEE", auteurId, resume: "Grille tarifaire modifiée",
        avant: { grilleId: id, ...(diff.avant.applicableLe ? { applicableLe: jour(diff.avant.applicableLe) } : {}) },
        apres: { grilleId: id, champs: touches, ...(diff.apres.applicableLe ? { applicableLe: jour(diff.apres.applicableLe) } : {}) } });
      return lireApresEcriture(tx, id);
    });
  } catch (erreur) { return erreurDoublon(erreur, MESSAGE_DOUBLON_DATE); }
}

/* ------------------------------ Tarifs ------------------------------ */

/**
 * Un produit qui n'existe pas ne se rattache pas : une fausse piste vaut moins
 * que « Produit inconnu ». Un rôle de produit n'accepte que le sien, ou aucun
 * (`refusProduit`) ; une autre prestation et le connecteur RIS restent libres.
 */
async function verifierProduit(tx: Tx, productId: number | null | undefined, role: RoleTarif) {
  if (productId == null) return;
  const produit = await tx.product.findUnique({ where: { id: productId }, select: { name: true } });
  if (!produit) throw new ErreurMetier("Produit inconnu.", 400);
  const refus = refusProduit(role, produit.name);
  if (refus) throw new ErreurMetier(refus, 400);
}

/**
 * Ajoute un tarif par son rôle. Le code vient du rôle, jamais du libellé : un
 * rôle de référence déjà présent est refusé (409), une autre prestation reçoit
 * le code opaque suivant, unique dans la grille (verrouillée).
 */
export async function ajouterTarif(grilleId: number, { majLe, role, ...champs }: z.output<typeof creationTarif>, auteurId: number, maintenant: Date = new Date()) {
  try {
    return await transactionJournalisee(async (tx) => {
      const { grille } = await chargerModifiable(tx, grilleId, majLe, maintenant);
      await verifierProduit(tx, champs.productId, role);
      const existants = await tx.crmTarif.findMany({ where: { grilleId }, select: { code: true, ordre: true } });
      const nouveauCode = codePourRole(role, existants.map((t) => t.code));
      if (existants.some((t) => t.code === nouveauCode)) throw new ErreurMetier(messageRoleDejaPris(role), 409);
      const tarif = await tx.crmTarif.create({ data: {
        grilleId, code: nouveauCode, libelle: champs.libelle, productId: champs.productId ?? null, type: champs.type, base: champs.base,
        montantHtCentimes: champs.montantHtCentimes ?? null, pourMille: champs.pourMille ?? null, ordre: champs.ordre ?? ordreSuivant(existants.map((t) => t.ordre)),
      } });
      await avancerVersion(tx, grille);
      await journaliser(tx, { type: "TARIF_AJOUTE", auteurId, resume: "Tarif ajouté", apres: { grilleId, tarifId: tarif.id, ...code(tarif.code), ...surs(tarif) } });
      return { tarifId: tarif.id, grille: await lireApresEcriture(tx, grilleId) };
    });
  } catch (erreur) { return erreurDoublon(erreur, MESSAGE_DOUBLON_CODE); }
}

/**
 * Corrige un tarif. Le tarif entier est revalidé après la fusion : changer la
 * base vers un pourcentage retire le montant, vers une autre base retire le
 * taux, sauf si la requête les donne (une base qui change ne laisse pas de
 * champ qui n'a plus de sens). Rien de changé : rien n'est écrit.
 */
export async function modifierTarif(grilleId: number, tarifId: number, { majLe, ...champs }: z.output<typeof modificationTarif>, auteurId: number, maintenant: Date = new Date()) {
  return transaction(async (tx) => {
    const { grille } = await chargerModifiable(tx, grilleId, majLe, maintenant);
    const actuel = await tx.crmTarif.findFirst({ where: { id: tarifId, grilleId } });
    if (!actuel) throw new ErreurMetier("Tarif inconnu.", 404);
    const fusion = { ...actuel, ...Object.fromEntries(Object.entries(champs).filter(([, v]) => v !== undefined)) };
    if (champs.base !== undefined && champs.base !== actuel.base) {
      if (champs.base === "POURCENTAGE" && champs.montantHtCentimes === undefined) fusion.montantHtCentimes = null;
      if (champs.base !== "POURCENTAGE" && champs.pourMille === undefined) fusion.pourMille = null;
    }
    const { id: _id, grilleId: _g, ...tarif } = fusion; void _id; void _g;
    const analyse = tarifComplet.safeParse(tarif);
    if (!analyse.success) throw new ErreurMetier(messageTarif(analyse.error), 400);
    // Le tarif entier, comme le type et la base : le produit doit convenir au rôle, même s'il n'est pas dans la requête.
    await verifierProduit(tx, analyse.data.productId, roleDuCode(actuel.code));
    const modifiables = ["libelle", "productId", "type", "base", "montantHtCentimes", "pourMille", "ordre"] as const;
    const diff = champsChanges(actuel, { ...analyse.data, ordre: analyse.data.ordre ?? actuel.ordre }, modifiables);
    const touches = Object.keys(diff.apres);
    if (!touches.length) return { grille: await lireApresEcriture(tx, grilleId) };
    const ecrites = await tx.crmTarif.updateMany({ where: { id: tarifId, grilleId }, data: diff.apres });
    if (!ecrites.count) throw new ErreurMetier("Tarif inconnu.", 404);
    await avancerVersion(tx, grille);
    await journaliser(tx, { type: "TARIF_MODIFIE", auteurId, resume: "Tarif modifié",
      avant: { grilleId, tarifId, ...code(actuel.code), ...surs(diff.avant) }, apres: { grilleId, tarifId, ...code(actuel.code), champs: touches, ...surs(diff.apres) } });
    return { grille: await lireApresEcriture(tx, grilleId) };
  });
}

/** Retire un tarif. Le dernier tarif d'une grille qui s'applique déjà reste (400) : elle n'aurait plus aucun prix. */
export async function supprimerTarif(grilleId: number, tarifId: number, { majLe }: z.output<typeof suppressionTarif>, auteurId: number, maintenant: Date = new Date()) {
  return transaction(async (tx) => {
    const { grille } = await chargerModifiable(tx, grilleId, majLe, maintenant);
    const actuel = await tx.crmTarif.findFirst({ where: { id: tarifId, grilleId } });
    if (!actuel) throw new ErreurMetier("Tarif inconnu.", 404);
    const refus = messageRetraitTarif(grille.applicableLe, await tx.crmTarif.count({ where: { grilleId } }), maintenant);
    if (refus) throw new ErreurMetier(refus, 400);
    await tx.crmTarif.delete({ where: { id: tarifId } });
    await avancerVersion(tx, grille);
    await journaliser(tx, { type: "TARIF_SUPPRIME", auteurId, resume: "Tarif supprimé", avant: { grilleId, tarifId, ...code(actuel.code), ...surs(actuel) } });
    return { grille: await lireApresEcriture(tx, grilleId) };
  });
}

/**
 * Supprime une grille à venir que rien n'utilise (une erreur de saisie, une
 * hausse abandonnée), avec ses tarifs. Une grille utilisée, en vigueur ou passée
 * reste : 409 et la raison (`messageSuppressionGrille`). La clé étrangère des
 * propositions (RESTRICT) la garde aussi en base.
 */
export async function supprimerGrille(id: number, { majLe }: z.output<typeof suppressionGrille>, auteurId: number, maintenant: Date = new Date()) {
  return transaction(async (tx) => {
    await verrouillerGrille(tx, id);
    const actuelle = await tx.crmGrilleTarifaire.findUniqueOrThrow({ where: { id }, include: { _count: { select: { tarifs: true, propositions: true } } } });
    const utilisee = messageGrilleUtilisee(actuelle._count.propositions);
    if (utilisee) throw new ErreurMetier(utilisee, 409);
    if (+actuelle.majLe !== +majLe) throw conflit();
    const toutes = await tx.crmGrilleTarifaire.findMany({ select: { id: true, applicableLe: true } });
    const refus = messageSuppressionGrille(classerGrilles(toutes, maintenant).find((g) => g.id === id)!.statut, actuelle._count.propositions);
    if (refus) throw new ErreurMetier(refus, 409);
    const supprimees = await tx.crmGrilleTarifaire.deleteMany({ where: { id, majLe: actuelle.majLe } });
    if (!supprimees.count) throw conflit();
    await journaliser(tx, { type: "GRILLE_TARIFAIRE_SUPPRIMEE", auteurId, resume: "Grille tarifaire supprimée",
      avant: { grilleId: id, applicableLe: jour(actuelle.applicableLe), tarifs: actuelle._count.tarifs } });
    return { grilleId: id };
  });
}
