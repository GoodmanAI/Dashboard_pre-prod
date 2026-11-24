import type { Prisma } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";
import { instantSql } from "@/pilot/lib/datesSql";
import { decalerMois } from "@/pilot/lib/ca/projeter";
import { evaluerPlusieurs } from "@/pilot/lib/completude/adapter";
import type { DonneesAlertes, DestinataireParDefaut, RattachementAlertes } from "./types";

/**
 * 11 lectures Pilot groupées + 3 de l'adaptateur = 14 requêtes, indépendamment
 * du nombre d'organisations et de centres (11 sans aucun accès Dashboard).
 * Les deux dernières disent qui agit (C-91) : les alertes confiées à la main, et
 * le destinataire par défaut, le directeur général sinon le premier super-administrateur.
 * Les champs seuls sont chargés ; les régressions sont bornées à une par case
 * toujours vide et les acquittements aux décisions encore courantes.
 * L'historique des dates doit rester complet pour compter tous les reports.
 */
export async function chargerDonneesAlertes(maintenant: Date, organisationId?: number, client: Prisma.TransactionClient = prisma): Promise<DonneesAlertes> {
  const orgId = organisationId ?? null;
  const [organisations, rattachements, etapes, datesPromises, regressions, contrats, acquittements, propositions, attributions, parDefaut, facturations] = await Promise.all([
    client.crmOrganisation.findMany({ where: { id: organisationId }, select: {
      id: true, raisonSocialeNom: true, etape: true, etapeDepuisLe: true, creeLe: true,
      prochaineActionLe: true, reveilLe: true, decisionAttendueLe: true, dernierEchangeLe: true,
      responsableId: true, chefDeProjetId: true, pocCycleId: true, pocDebuteLe: true, pocProlongeLe: true,
      // Un client sans contrat actif appelle « contrat à saisir » (C-92) : compté dans la même lecture.
      _count: { select: { contrats: { where: { statut: "ACTIF" } } } },
    }, orderBy: { id: "asc" } }),
    client.$queryRaw<Omit<RattachementAlertes, "etat">[]>`SELECT r.id, c."organisationId", r."centreId", c.nom AS "centreNom",
      r."productId", p.name AS produit, r."userProductId", r."datePromise", r."datePromiseInitiale",
      r."miseEnProductionLe", r."suiviRenforceJusquAu"
      FROM "CrmCentreProduit" r JOIN "CrmCentre" c ON c.id = r."centreId" JOIN "Product" p ON p.id = r."productId"
      WHERE (${orgId}::integer IS NULL OR c."organisationId" = ${orgId}) ORDER BY r.id`,
    client.crmEtapeIntegration.findMany({ where: { centre: { organisationId } }, select: {
      id: true, centreId: true, productId: true, cle: true, mode: true, faite: true, creeLe: true,
      enAttenteDe: true, demandeeLe: true, derniereRelanceLe: true, echeanceLe: true,
    } }),
    client.crmEvenement.findMany({ where: { organisationId, type: "DATE_PROMISE_CHANGEE" },
      select: { centreProduitId: true, surveneuLe: true, avant: true, apres: true }, orderBy: [{ surveneuLe: "asc" }, { id: "asc" }] }),
    client.$queryRaw<DonneesAlertes["regressions"]>`SELECT DISTINCT ON (e.id) e.id AS "etapeIntegrationId", j."surveneuLe", j.avant
      FROM "CrmEvenement" j JOIN "CrmEtapeIntegration" e ON e.id = j."etapeIntegrationId"
      JOIN "CrmCentre" c ON c.id = e."centreId"
      WHERE j.type = 'ETAPE_INTEGRATION_REGRESSION' AND NOT e.faite AND e.mode = 'AUTOMATIQUE'
        AND (${orgId}::integer IS NULL OR c."organisationId" = ${orgId})
      ORDER BY e.id, j."surveneuLe" DESC, j.id DESC`,
    client.crmContrat.findMany({ where: { organisationId, statut: "ACTIF", OR: [{ renouvelleLe: { not: null } }, { engagementMois: { not: null } }] },
      select: { id: true, organisationId: true, statut: true, renouvelleLe: true, signeLe: true, debuteLe: true, engagementMois: true, preavisMois: true, reference: true } }),
    client.$queryRaw<DonneesAlertes["acquittements"]>`SELECT a.id, a."cleAlerte", a."organisationId", a."jusquAu", a.raison, u.name AS auteur
      FROM "CrmAcquittement" a LEFT JOIN "User" u ON u.id = a."auteurId"
      WHERE a."jusquAu" > ${instantSql(maintenant)} AND (${orgId}::integer IS NULL OR a."organisationId" = ${orgId})`,
    client.$queryRaw<DonneesAlertes["propositions"]>`SELECT DISTINCT ON ("organisationId")
      id, "organisationId", version, statut, "valideJusquAu", "repondueLe"
      FROM "CrmProposition" WHERE (${orgId}::integer IS NULL OR "organisationId" = ${orgId})
      ORDER BY "organisationId", version DESC`,
    client.$queryRaw<NonNullable<DonneesAlertes["attributions"]>>`SELECT a."organisationId", a."cleGroupe", a."attribueeAId",
      u.name AS nom, d.departement, p.name AS par
      FROM "CrmAttributionAlerte" a JOIN "User" u ON u.id = a."attribueeAId"
      LEFT JOIN "CrmDepartementCompte" d ON d."userId" = a."attribueeAId" LEFT JOIN "User" p ON p.id = a."parId"
      WHERE (${orgId}::integer IS NULL OR a."organisationId" = ${orgId})`,
    // Un directeur général dont l'accès est retiré ne reçoit plus rien : le super-administrateur prend le relais.
    client.$queryRaw<DestinataireParDefaut[]>`SELECT u.id, u.name AS nom, d.departement, (g."userId" IS NOT NULL) AS designe
      FROM "User" u LEFT JOIN "CrmDirecteurGeneral" g ON g."userId" = u.id
      LEFT JOIN "CrmAccesPilot" a ON a."userId" = u.id LEFT JOIN "CrmDepartementCompte" d ON d."userId" = u.id
      WHERE a."retireLe" IS NULL AND (g."userId" IS NOT NULL AND u.role IN ('ADMIN', 'SUPER_ADMIN') OR u.role = 'SUPER_ADMIN')
      ORDER BY designe DESC, u.id LIMIT 1`,
    // Une seule lecture de faits, sans montant transmis aux alertes ni au navigateur.
    client.$queryRaw<NonNullable<DonneesAlertes["facturations"]>>`SELECT o.id AS "organisationId", p."debuteLe" AS "premierPocLe",
      (p."debuteLe" IS NOT NULL AND f."organisationId" IS NULL) AS "formationAbsente",
      (p."debuteLe" IS NOT NULL AND f."montantCentimes" IS NULL) AS "prixARenseigner", f."factureEmiseLe",
      (f."montantCentimes" IS NOT NULL AND f."comptabiliseeLe" IS NULL AND EXISTS (
        SELECT 1 FROM "CrmCaMensuel" m WHERE m.cle = to_char(f."debuteLe", 'YYYY-MM') || '|' || o.id::text || '|0|0')) AS regularisation,
      (f."montantCentimes" IS NOT NULL AND f."comptabiliseeLe" IS NULL AND f."debuteLe" < ${instantSql(decalerMois(maintenant, 0))} AND NOT EXISTS (
        SELECT 1 FROM "CrmCaMensuel" m WHERE m.cle = to_char(f."debuteLe", 'YYYY-MM') || '|' || o.id::text || '|0|0')) AS rattrapage,
      EXISTS(SELECT 1 FROM "CrmEtapeIntegration" e JOIN "CrmCentre" c ON c.id = e."centreId"
        WHERE c."organisationId" = o.id AND e.cle = 'TOP_FACTURATION' AND e.faite) AS "topFacturation",
      (SELECT MIN(c."debuteLe") FROM "CrmContrat" c WHERE c."organisationId" = o.id AND c.statut = 'BROUILLON') AS "premierMoisPayantLe"
      FROM "CrmOrganisation" o LEFT JOIN "CrmFormationPoc" f ON f."organisationId" = o.id
      LEFT JOIN LATERAL (SELECT x."debuteLe" FROM (
        SELECT h."debuteLe" FROM "CrmCyclePoc" h WHERE h."organisationId" = o.id
        UNION ALL SELECT o."pocDebuteLe" WHERE o."pocDebuteLe" IS NOT NULL
      ) x ORDER BY x."debuteLe" LIMIT 1) p ON true
      WHERE (${orgId}::integer IS NULL OR o.id = ${orgId})`,
  ]);
  const etats = await evaluerPlusieurs(rattachements.flatMap((r) => r.userProductId === null ? [] : [r.userProductId]));
  return { facturations, organisations: organisations.map(({ _count, ...o }) => ({ ...o, contratActif: _count.contrats > 0 })), etapes, datesPromises, regressions, contrats, acquittements, propositions, attributions, parDefaut: parDefaut[0] ?? null,
    rattachements: rattachements.map((r) => ({ ...r, etat: r.userProductId === null ? null : etats.get(r.userProductId) ?? null })) };
}
