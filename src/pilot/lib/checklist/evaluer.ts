import { ATTENTE_VIDE } from "./reglesAttentes";
import { type Prisma, type CrmEtapeIntegration } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";
import { evaluerPlusieurs } from "@/pilot/lib/completude/adapter";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { definitionEtape, etapesDuProduit } from "./definition";
import { diffEtapes, SANS_FAITS_PILOT, type FaitsPilot } from "./diff";

// Même verrou pour les passages ponctuels, le bouton et le cron.
export const VERROU_EVALUATION = 72102;
type Rattachement = {
  id: number; centreId: number; productId: number; userProductId: number | null;
  produit: string; centre: string; organisationId: number;
};
export type ComptesEvaluation = {
  rattachements: number; creations: number; cochees: number; regressions: number;
  inchangees: number; dureeMs: number; ignoree: boolean;
};

/** Compare l'état lu, y compris sa date d'évaluation : un passage ancien ne
 * remplace pas les conclusions d'un passage qui vient de finir. */
function condition(e: CrmEtapeIntegration): Prisma.CrmEtapeIntegrationWhereInput {
  return { id: e.id, mode: e.mode, faite: e.faite, faiteLe: e.faiteLe, motif: e.motif, evalueeLe: e.evalueeLe };
}

type Cible = { centreProduitId?: number; organisationId?: number };

async function evaluer(cible: Cible = {}, maintenant = new Date()): Promise<ComptesEvaluation> {
  const debut = Date.now();
  const { centreProduitId = null, organisationId = null } = cible;
  // Six lectures SQL au total, indépendamment du nombre de rattachements.
  const rattachements = await prisma.$queryRaw<Rattachement[]>`SELECT r.id, r."centreId", r."productId", r."userProductId",
    p.name AS produit, c.nom AS centre, c."organisationId"
    FROM "CrmCentreProduit" r JOIN "Product" p ON p.id = r."productId" JOIN "CrmCentre" c ON c.id = r."centreId"
    JOIN "CrmOrganisation" o ON o.id = c."organisationId"
    WHERE o.etape::text NOT IN ('ARRETE', 'PERDU', 'EN_SOMMEIL', 'POC_NON_TRANSFORME')
      AND (${centreProduitId}::integer IS NULL OR r.id = ${centreProduitId})
      AND (${organisationId}::integer IS NULL OR c."organisationId" = ${organisationId}) ORDER BY r.id`;
  const idsOrganisations = [...new Set(rattachements.map((r) => r.organisationId))];
  const [existantes, etats, organisations] = await Promise.all([
    prisma.crmEtapeIntegration.findMany({ where: { OR: rattachements.map((r) => ({ centreId: r.centreId, productId: r.productId })) } }),
    evaluerPlusieurs(rattachements.flatMap((r) => r.userProductId === null ? [] : [r.userProductId])),
    // Lot V (C-85) : ce que Pilot constate seul, sur ses propres fiches.
    prisma.crmOrganisation.findMany({ where: { id: { in: idsOrganisations } },
      select: { id: true, chefDeProjetId: true, contacts: { where: { facturation: true }, select: { id: true }, take: 1 } } }),
  ]);
  const faitsParOrganisation = new Map<number, FaitsPilot>(organisations.map((o) =>
    [o.id, { contactFacturation: o.contacts.length > 0, chefDeProjet: o.chefDeProjetId !== null }]));
  const parRattachement = new Map<string, CrmEtapeIntegration[]>();
  for (const e of existantes) {
    const cle = `${e.centreId}:${e.productId}`;
    const lignes = parRattachement.get(cle) ?? [];
    lignes.push(e); parRattachement.set(cle, lignes);
  }
  const differences = rattachements.map((r) => ({ r, diff: diffEtapes({
    definitions: etapesDuProduit(r.produit), etat: r.userProductId === null ? null : etats.get(r.userProductId) ?? null,
    existantes: parRattachement.get(`${r.centreId}:${r.productId}`) ?? [], maintenant,
    faitsPilot: faitsParOrganisation.get(r.organisationId) ?? SANS_FAITS_PILOT,
  }) }));
  const comptes: ComptesEvaluation = { rattachements: rattachements.length, creations: 0, cochees: 0, regressions: 0, inchangees: 0, dureeMs: 0, ignoree: false };
  await transactionJournalisee(async (tx) => {
    // Le passage du parc cède la place s'il en trouve un autre : le suivant le
    // rattrapera. Un passage ponctuel, lui, attend son tour : il suit un geste
    // humain (cocher, rattacher) dont l'écran attend le résultat tout de suite.
    if (centreProduitId === null && organisationId === null) {
      const [verrou] = await tx.$queryRaw<{ obtenu: boolean }[]>`SELECT pg_try_advisory_xact_lock(${VERROU_EVALUATION}::integer, 0) AS obtenu`;
      if (!verrou.obtenu) { comptes.ignoree = true; return; }
    } else {
      // SELECT 1 FROM : la fonction renvoie void, que Prisma ne sait pas lire.
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(${VERROU_EVALUATION}::integer, 0)`;
    }
    const creations = differences.flatMap(({ r, diff }) => diff.creations.map((e) => ({ ...e, centreId: r.centreId, productId: r.productId })));
    if (creations.length) {
      // INSERT groupé avec RETURNING : les ids des événements sont connus sans
      // lecture supplémentaire, et une création manuelle concurrente est gardée.
      const creees = await tx.crmEtapeIntegration.createManyAndReturn({ data: creations, skipDuplicates: true });
      comptes.creations = creees.length;
      for (const e of creees.filter((e) => e.mode === "AUTOMATIQUE" && e.faite)) {
        const r = rattachements.find((r) => r.centreId === e.centreId && r.productId === e.productId)!;
        await journaliser(tx, { type: "ETAPE_INTEGRATION_COCHEE", auteurId: null,
          organisationId: r.organisationId, centreId: r.centreId, centreProduitId: r.id, etapeIntegrationId: e.id,
          resume: `Coché : ${definitionEtape(e.cle, r.produit).libelle} · ${r.centre} · ${r.produit}`,
          avant: { faite: false, faiteLe: null }, apres: { faite: true, faiteLe: maintenant } });
        comptes.cochees++;
      }
    }
    const idsInchanges = new Set(differences.flatMap(({ diff }) => diff.inchangees));
    const inchangees = existantes.filter((e) => idsInchanges.has(e.id));
    if (inchangees.length) {
      comptes.inchangees = (await tx.crmEtapeIntegration.updateMany({
        where: { mode: { in: ["AUTOMATIQUE", "MIXTE"] }, OR: inchangees.map(condition) }, data: { evalueeLe: maintenant },
      })).count;
    }
    for (const { r, diff } of differences) for (const { existante, data } of diff.misesAJour) {
      // Cochée par l'évaluateur, l'étape n'attend plus personne : l'attente déclarée s'efface (C-86).
      const ecrites = await tx.crmEtapeIntegration.updateMany({
        where: { AND: [condition(existante), { mode: { in: ["AUTOMATIQUE", "MIXTE"] } }] },
        data: { ...data, ...(!existante.faite && data.faite === true ? ATTENTE_VIDE : {}) },
      });
      if (!ecrites.count) continue;
      const regression = diff.regressions.find((e) => e.id === existante.id);
      const cochee = !existante.faite && data.faite === true;
      if (!regression && !cochee) continue;
      await journaliser(tx, {
        type: regression ? "ETAPE_INTEGRATION_REGRESSION" : "ETAPE_INTEGRATION_COCHEE", auteurId: null,
        organisationId: r.organisationId, centreId: r.centreId, centreProduitId: r.id, etapeIntegrationId: existante.id,
        resume: `${regression ? "Régression" : "Coché"} : ${definitionEtape(existante.cle, r.produit).libelle} · ${r.centre} · ${r.produit}`,
        avant: regression?.avant ?? { faite: false, faiteLe: existante.faiteLe },
        apres: regression?.apres ?? { faite: true, faiteLe: maintenant },
      });
      if (regression) comptes.regressions++; else comptes.cochees++;
    }
  }, { timeout: 60000 });
  return { ...comptes, dureeMs: Date.now() - debut };
}

export function evaluerParc({ maintenant = new Date() }: { maintenant?: Date } = {}) { return evaluer({}, maintenant); }

/** Signature conservée pour les appels ponctuels après commit. */
export async function evaluerCentre(centreProduitId: number): Promise<number> {
  const comptes = await evaluer({ centreProduitId });
  return comptes.creations + comptes.cochees + comptes.regressions;
}

export async function evaluerSansEchouer(centreProduitId: number) {
  try { await evaluerCentre(centreProduitId); }
  catch (erreur) {
    console.error(JSON.stringify({ niveau: "erreur", message: "Évaluation de la check-list échouée après modification",
      centreProduitId, cause: erreur instanceof Error ? erreur.name : "inconnue", ts: new Date().toISOString() }));
  }
}

/**
 * Après un geste sur la fiche du compte (contact facturation, chef de projet) :
 * ses étapes constatées par Pilot se mettent à jour tout de suite, sans attendre
 * le passage du parc. Un échec ne défait jamais le geste, déjà enregistré.
 */
export async function evaluerOrganisationSansEchouer(organisationId: number) {
  try { await evaluer({ organisationId }); }
  catch (erreur) {
    console.error(JSON.stringify({ niveau: "erreur", message: "Évaluation de la check-list échouée après modification du compte",
      organisationId, cause: erreur instanceof Error ? erreur.name : "inconnue", ts: new Date().toISOString() }));
  }
}
