import { CrmTiers, type CrmCleEtape } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";
import { instantSql } from "@/pilot/lib/datesSql";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutLirePilot, peutEvaluer } from "@/pilot/lib/autorisations";
import { etapesSuivies, definitionEtape } from "./definition";
import { prerequisDeploiement } from "./prerequis";
import { estimerRattachement } from "@/pilot/lib/integration/estimation";

export type FiltresIntegration = { organisationId?: string; vagueId?: string; centreProduitId?: string; chefDeProjetId?: string; productId?: string; tiers?: string; aMoi?: string; page?: string };
export function lireTiers(tiers?: string) { return Object.values(CrmTiers).find((t) => t === tiers); }
const id = (v?: string) => v && /^\d+$/.test(v) && Number(v) > 0 && Number(v) <= 2147483647 ? Number(v) : null;
export const numeroPage = (v?: string) => Math.min(id(v) ?? 1, 1000000);
const TAILLE = 50;
type Rattachement = { centreProduitId: number; centreId: number; productId: number; produit: string; centreNom: string;
  organisationId: number; organisationNom: string; etape: string; ris: string | null; commercialEdl: boolean; vagueId: number | null; vagueNumero: number | null; vagueNom: string | null; datePromise: Date | null; userProductId: number | null;
  miseEnProductionLe: Date | null; suiviRenforceJusquAu: Date | null };

/** Chargeur commun à l'écran et à la mesure. Aucune écriture, aucun appel au registre. */
export async function chargerIntegrations(filtres: FiltresIntegration = {}) {
  const utilisateur = await utilisateurCourant();
  exiger(peutLirePilot(utilisateur.role));
  const page = numeroPage(filtres.page);
  const tiers = lireTiers(filtres.tiers) ?? null;
  const [rattachements, derniere, chefs, produits, regressions, sansCentreSuivi] = await Promise.all([
    prisma.$queryRaw<Rattachement[]>`SELECT r.id AS "centreProduitId", r."centreId", r."productId", p.name AS produit,
      o.etape, COALESCE(NULLIF(c.ris, ''), o.ris) AS ris,
      (NULLIF(BTRIM(a."risCommercial"), '') IS NOT NULL OR EXISTS (SELECT 1 FROM "CrmContact" ct WHERE ct."organisationId" = o.id AND LOWER(BTRIM(ct.metier)) = 'commercial edl')) AS "commercialEdl", c.nom AS "centreNom", o.id AS "organisationId", o."raisonSocialeNom" AS "organisationNom", r."datePromise", r."userProductId", r."vagueId", v.numero AS "vagueNumero", v.nom AS "vagueNom",
      r."miseEnProductionLe", r."suiviRenforceJusquAu"
      FROM "CrmCentreProduit" r JOIN "CrmCentre" c ON c.id = r."centreId"
      JOIN "CrmOrganisation" o ON o.id = c."organisationId" JOIN "Product" p ON p.id = r."productId"
      LEFT JOIN "CrmVague" v ON v.id = r."vagueId"
      LEFT JOIN "CrmApport" a ON a."organisationId" = o.id
      WHERE o.etape::text NOT IN ('ARRETE', 'PERDU', 'EN_SOMMEIL', 'POC_NON_TRANSFORME')
        AND (${id(filtres.organisationId)}::integer IS NULL OR o.id = ${id(filtres.organisationId)})
        AND (${id(filtres.centreProduitId)}::integer IS NULL OR r.id = ${id(filtres.centreProduitId)})
        AND (${id(filtres.chefDeProjetId)}::integer IS NULL OR o."chefDeProjetId" = ${id(filtres.chefDeProjetId)})
        AND (${id(filtres.vagueId)}::integer IS NULL OR r."vagueId" = ${id(filtres.vagueId)})
        AND (${id(filtres.productId)}::integer IS NULL OR r."productId" = ${id(filtres.productId)})
        AND (${filtres.aMoi !== "1"} OR COALESCE(o."chefDeProjetId", o."responsableId") = ${utilisateur.id})
        AND (${tiers}::text IS NULL OR EXISTS(SELECT 1 FROM "CrmEtapeIntegration" e WHERE e."centreId" = c.id
          AND e."productId" = r."productId" AND e."enAttenteDe"::text = ${tiers}))
      ORDER BY r.id LIMIT ${TAILLE + 1} OFFSET ${(page - 1) * TAILLE}`,
    prisma.crmEtapeIntegration.aggregate({ _max: { evalueeLe: true } }),
    prisma.user.findMany({ where: { role: { in: ["SUPER_ADMIN", "ADMIN"] } }, select: { id: true, name: true }, orderBy: { id: "asc" } }),
    prisma.product.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.$queryRaw<Array<{ etapeId: number; centreProduitId: number; organisationId: number; cle: CrmCleEtape; centre: string; produit: string; faiteLe: string | null }>>`
      SELECT DISTINCT ON (e.id) e.id AS "etapeId", r.id AS "centreProduitId", c."organisationId", e.cle,
        c.nom AS centre, p.name AS produit, j.avant->>'faiteLe' AS "faiteLe"
      FROM "CrmEvenement" j JOIN "CrmEtapeIntegration" e ON e.id = j."etapeIntegrationId"
      JOIN "CrmCentre" c ON c.id = e."centreId" JOIN "Product" p ON p.id = e."productId"
      JOIN "CrmCentreProduit" r ON r."centreId" = e."centreId" AND r."productId" = e."productId"
      JOIN "CrmOrganisation" o ON o.id = c."organisationId"
      WHERE j.type = 'ETAPE_INTEGRATION_REGRESSION' AND j."surveneuLe" >= ${instantSql(new Date(Date.now() - 14 * 86400000))} AND NOT e.faite
        AND o.etape::text NOT IN ('ARRETE', 'PERDU', 'EN_SOMMEIL', 'POC_NON_TRANSFORME')
        AND (${id(filtres.organisationId)}::integer IS NULL OR o.id = ${id(filtres.organisationId)})
        AND (${id(filtres.chefDeProjetId)}::integer IS NULL OR o."chefDeProjetId" = ${id(filtres.chefDeProjetId)})
        AND (${id(filtres.vagueId)}::integer IS NULL OR r."vagueId" = ${id(filtres.vagueId)})
        AND (${id(filtres.productId)}::integer IS NULL OR r."productId" = ${id(filtres.productId)})
        AND (${filtres.aMoi !== "1"} OR COALESCE(o."chefDeProjetId", o."responsableId") = ${utilisateur.id})
        AND (${tiers}::text IS NULL OR EXISTS(SELECT 1 FROM "CrmEtapeIntegration" a WHERE a."centreId" = c.id
          AND a."productId" = r."productId" AND a."enAttenteDe"::text = ${tiers}))
      ORDER BY e.id, j."surveneuLe" DESC, j.id DESC LIMIT 50`,
    // Une lecture fixe : les dossiers à préparer existent avant leur premier produit installé.
    prisma.$queryRaw<Array<{ organisationId: number; nom: string; ris: string | null; commercialEdl: boolean; etape: string }>>`
      SELECT o.id AS "organisationId", o."raisonSocialeNom" AS nom, o.ris, o.etape,
        (NULLIF(BTRIM(a."risCommercial"), '') IS NOT NULL OR EXISTS (SELECT 1 FROM "CrmContact" ct WHERE ct."organisationId" = o.id AND LOWER(BTRIM(ct.metier)) = 'commercial edl')) AS "commercialEdl"
      FROM "CrmOrganisation" o LEFT JOIN "CrmApport" a ON a."organisationId" = o.id
      WHERE o.etape::text IN ('EN_POC', 'SIGNE', 'EN_INTEGRATION')
        AND NOT EXISTS (SELECT 1 FROM "CrmCentre" c JOIN "CrmCentreProduit" r ON r."centreId" = c.id WHERE c."organisationId" = o.id)
        AND (${id(filtres.organisationId)}::integer IS NULL OR o.id = ${id(filtres.organisationId)})
        AND (${id(filtres.chefDeProjetId)}::integer IS NULL OR o."chefDeProjetId" = ${id(filtres.chefDeProjetId)})
        AND (${filtres.aMoi !== "1"} OR COALESCE(o."chefDeProjetId", o."responsableId") = ${utilisateur.id})
        AND ${!id(filtres.productId) && !id(filtres.centreProduitId) && !id(filtres.vagueId) && !tiers}
      ORDER BY o.id LIMIT ${TAILLE + 1} OFFSET ${(page - 1) * TAILLE}`,
  ]);
  const visibles = rattachements.slice(0, TAILLE);
  const existantes = await prisma.crmEtapeIntegration.findMany({ where: { OR: visibles.map((r) => ({ centreId: r.centreId, productId: r.productId })) } });
  const parCle = new Map(existantes.map((e) => [`${e.centreId}:${e.productId}:${e.cle}`, e]));
  const maintenant = new Date();
  // La date réaliste se calcule sur les lignes déjà lues : aucune requête par ligne.
  const lignes = visibles.map(({ miseEnProductionLe, suiviRenforceJusquAu, ...r }) => {
    const ligneDe = (cle: CrmCleEtape) => parCle.get(`${r.centreId}:${r.productId}:${cle}`);
    const definitions = etapesSuivies(r.produit, (cle) => ligneDe(cle) !== undefined);
    // Les étapes qui partent de la mise en service attendent la case qui la déclare (C-85).
    const passage = ligneDe("PASSAGE_PRODUCTION");
    const serviceLe = passage?.faite ? passage.faiteLe : null;
    return { ...r, prerequis: prerequisDeploiement({ ris: r.ris, commercialEdl: r.commercialEdl, produit: r.produit, cases: definitions.map((d) => ({ cle: d.cle, faite: ligneDe(d.cle)?.faite ?? false })) }),
    enCours: !!r.userProductId || definitions.some((d) => ligneDe(d.cle)?.faite && !["CONTACTS_FACTURATION", "RESPONSABLE_DESIGNE", "BON_COMMANDE_EDL"].includes(d.cle)), datePromise: r.datePromise?.toISOString() ?? null, provisionne: r.userProductId !== null,
    estimation: estimerRattachement({ produit: r.produit, datePromise: r.datePromise, miseEnProductionLe, suiviRenforceJusquAu, maintenant,
      lignes: definitions.flatMap((def) => ligneDe(def.cle) ?? []) }),
    cases: definitions.map((def) => {
      const e = ligneDe(def.cle);
      const apresService = def.depart === "MISE_EN_SERVICE";
      return { ...def, id: e?.id ?? null,
        attendMiseEnService: apresService && !passage?.faite,
        prevueLe: apresService && serviceLe ? new Date(serviceLe.getTime() + def.dureeAttendueJours * 86400000).toISOString() : null, faite: e?.faite ?? false, faiteLe: e?.faiteLe?.toISOString() ?? null,
        motif: e ? e.motif : "Pas encore vérifiée", commentaire: e?.commentaire ?? null,
        enAttenteDe: e?.enAttenteDe ?? null, demandeeLe: e?.demandeeLe?.toISOString() ?? null,
        derniereRelanceLe: e?.derniereRelanceLe?.toISOString() ?? null, echeanceLe: e?.echeanceLe?.toISOString() ?? null,
        ouverteDepuisJours: e ? Math.floor((Date.now() - e.creeLe.getTime()) / 86400000) : 0 };
    }),
  }; });
  const vagues = [...new Map(visibles.filter((r) => r.vagueId !== null).map((r) => [r.vagueId!, { id: r.vagueId!, libelle: r.organisationNom + " · Vague " + r.vagueNumero + (r.vagueNom ? " · " + r.vagueNom : "") }])).values()];
  return { lignes, chefs, produits, vagues, page, suite: rattachements.length > TAILLE || sansCentreSuivi.length > TAILLE,
    aPreparer: sansCentreSuivi.slice(0, TAILLE).map((o) => ({ ...o, prerequis: prerequisDeploiement({ ris: o.ris, commercialEdl: o.commercialEdl, produit: "", cases: [] }) })),
    derniereEvaluation: derniere._max.evalueeLe?.toISOString() ?? null, peutEvaluer: peutEvaluer(utilisateur),
    regressions: regressions.map((r) => ({ ...r, libelle: definitionEtape(r.cle, r.produit).libelle })) };
}
export type DonneesIntegrations = Awaited<ReturnType<typeof chargerIntegrations>>;
export type LigneIntegration = DonneesIntegrations["lignes"][number];
export type CaseIntegration = LigneIntegration["cases"][number];
