import type { CrmCleEtape, CrmTiers, CrmTypeEchange } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";
import { calculerAlertesDuParc } from "@/pilot/lib/alertes";
import { peutConfierAlertes } from "@/pilot/lib/alertes/attribuer";
import { ETAPES_COMMERCIALES } from "@/pilot/lib/pipeline";
import { debutDuJour, dansJours } from "@/pilot/lib/dates";
import { instantSql } from "@/pilot/lib/datesSql";
import { estimerRattachement, trierParEcart } from "@/pilot/lib/integration/estimation";
import { utilisateurCourant } from "@/pilot/lib/session";
import { listerAttentes, serialiserAttente } from "@/pilot/lib/checklist/attentes";

// Une page présente 50 lignes par bloc. Les pages suivantes gardent le même
// nombre de requêtes. La 51e ligne indique qu'il reste une suite.
export const TAILLE_PAGE = 50;
export async function construireAujourdhui(equipe = false, page = 1, maintenant = new Date()) {
  const utilisateur = await utilisateurCourant();
  const filtre = equipe ? {} : { OR: [{ responsableId: utilisateur.id }, { chefDeProjetId: utilisateur.id }] };
  const responsable = equipe ? null : utilisateur.id;
  const debut = debutDuJour(maintenant);
  const demain = dansJours(maintenant, 1);
  const finRdv = dansJours(maintenant, 8);
  const finPromesses = dansJours(maintenant, 15);
  const saut = (page - 1) * TAILLE_PAGE;
  const [compteurs, actions, rendezVous, sansAction, alertes, promesses, attentes, peutConfier] = await Promise.all([
    prisma.crmOrganisation.groupBy({ by: ["etape"], where: filtre, _count: { _all: true } }),
    prisma.$queryRaw<{ id: number; raisonSocialeNom: string; prochaineAction: string | null; nature: "action" | "reveil"; le: Date }[]>`
      WITH dossiers AS (
        SELECT id, "raisonSocialeNom", etape, "prochaineAction", "prochaineActionLe", "reveilLe"
        FROM "CrmOrganisation"
        WHERE (${responsable}::integer IS NULL OR "responsableId" = ${responsable} OR "chefDeProjetId" = ${responsable})
      )
      SELECT id, "raisonSocialeNom", "prochaineAction", 'action' AS nature, "prochaineActionLe" AS le
        FROM dossiers WHERE "prochaineActionLe" < ${instantSql(demain)}
          -- Un dossier perdu, arrêté ou en sommeil n'a plus d'action à suivre ;
          -- le réveil d'un dossier en sommeil a sa propre ligne ci-dessous.
          AND etape NOT IN ('PERDU', 'ARRETE', 'EN_SOMMEIL')
      UNION ALL
      SELECT id, "raisonSocialeNom", "prochaineAction", 'reveil' AS nature, "reveilLe" AS le
        FROM dossiers WHERE etape = 'EN_SOMMEIL' AND "reveilLe" < ${instantSql(demain)}
      ORDER BY le, id, nature LIMIT ${TAILLE_PAGE + 1} OFFSET ${saut}`,
    // Le libellé n'est lu que pour un jalon : le compte rendu d'un rendez-vous ne s'affiche pas ici.
    prisma.$queryRaw<{ id: number; organisationId: number; nom: string; type: CrmTypeEchange; surveneuLe: Date; libelle: string | null; aLaChargeDe: CrmTiers | null }[]>`
      SELECT e.id, e."organisationId", o."raisonSocialeNom" AS nom, e.type, e."surveneuLe",
        CASE WHEN e.type = 'JALON' THEN e."compteRendu" END AS libelle, e."aLaChargeDe"
      FROM "CrmEchange" e JOIN "CrmOrganisation" o ON o.id = e."organisationId"
      WHERE e.statut = 'PLANIFIE' AND e."surveneuLe" < ${instantSql(finRdv)}
        AND (${responsable}::integer IS NULL OR o."responsableId" = ${responsable} OR o."chefDeProjetId" = ${responsable})
      ORDER BY e."surveneuLe", e.id LIMIT ${TAILLE_PAGE + 1} OFFSET ${saut}`,
    prisma.crmOrganisation.findMany({
      where: { ...filtre, etape: { in: ETAPES_COMMERCIALES }, prochaineActionLe: null },
      select: { id: true, raisonSocialeNom: true, prochaineAction: true }, orderBy: { id: "asc" }, take: TAILLE_PAGE + 1, skip: saut,
    }),
    calculerAlertesDuParc({ maintenant, utilisateurId: equipe ? undefined : utilisateur.id }).then(({ actives }) =>
      actives.filter((a) => !["action-en-retard", "sans-prochaine-action", "reveil", "attente-sans-relance"].includes(a.type))),
    // Les cases viennent avec la ligne, en JSON, dates en millisecondes UTC : la
    // date réaliste se calcule sans requête de plus. Le tri par écart se fait
    // après le calcul : la fenêtre de 14 jours est lue en entier, puis paginée,
    // comme les alertes.
    prisma.$queryRaw<{ id: number; organisationId: number; nom: string; centre: string; produit: string; datePromise: Date; etapes: EtapeJson[] }[]>`
      SELECT r.id, o.id AS "organisationId", o."raisonSocialeNom" AS nom, c.nom AS centre, p.name AS produit, r."datePromise",
        COALESCE((SELECT json_agg(json_build_object('cle', e.cle, 'faite', e.faite, 'enAttenteDe', e."enAttenteDe",
            'creeLe', floor(extract(epoch FROM e."creeLe") * 1000)::bigint, 'echeanceLe', floor(extract(epoch FROM e."echeanceLe") * 1000)::bigint))
          FROM "CrmEtapeIntegration" e WHERE e."centreId" = c.id AND e."productId" = r."productId"), '[]'::json) AS etapes
      FROM "CrmCentreProduit" r JOIN "CrmCentre" c ON c.id = r."centreId"
      JOIN "CrmOrganisation" o ON o.id = c."organisationId" JOIN "Product" p ON p.id = r."productId"
      WHERE r."datePromise" >= ${instantSql(debut)} AND r."datePromise" < ${instantSql(finPromesses)}
        AND (${responsable}::integer IS NULL OR o."responsableId" = ${responsable} OR o."chefDeProjetId" = ${responsable})
      ORDER BY r."datePromise", r.id`,
    listerAttentes({ utilisateurId: utilisateur.id, aMoi: !equipe, avant: dansJours(maintenant, -7), limite: TAILLE_PAGE + 1, saut }),
    peutConfierAlertes(utilisateur),
  ]);
  const suite = [actions, rendezVous, sansAction, attentes].some((l) => l.length > TAILLE_PAGE)
    || alertes.length > saut + TAILLE_PAGE || promesses.length > saut + TAILLE_PAGE;
  const estimees = trierParEcart(promesses.map(({ etapes, ...r }) => {
    const estimation = estimerRattachement({ produit: r.produit, datePromise: r.datePromise, maintenant,
      lignes: etapes.map((e) => ({ cle: e.cle, faite: e.faite, enAttenteDe: e.enAttenteDe, creeLe: new Date(Number(e.creeLe)),
        echeanceLe: e.echeanceLe === null ? null : new Date(Number(e.echeanceLe)) })) });
    return { ...r, datePromise: r.datePromise.toISOString(), estimation,
      bloquantes: estimation.manquantes.length, ecartJours: estimation.ecartJours!, dateRealiste: estimation.dateRealiste };
  }));
  return { utilisateurId: utilisateur.id, peutConfier, compteurs, page, suite, debut: debut.toISOString(), demain: demain.toISOString(),
    attentes: attentes.slice(0, TAILLE_PAGE).map(serialiserAttente),
    actions: actions.slice(0, TAILLE_PAGE).map((o) => ({ ...o, le: o.le.toISOString() })),
    rendezVous: rendezVous.slice(0, TAILLE_PAGE).map((e) => ({ ...e, surveneuLe: e.surveneuLe.toISOString() })),
    sansAction: sansAction.slice(0, TAILLE_PAGE), alertes: alertes.slice(saut, saut + TAILLE_PAGE),
    promesses: estimees.slice(saut, saut + TAILLE_PAGE).map(({ estimation, ...r }) => ({ ...r, etapeCritique: estimation.etapeCritique })),
  };
}
type EtapeJson = { cle: CrmCleEtape; faite: boolean; enAttenteDe: CrmTiers | null; creeLe: number | string; echeanceLe: number | string | null };
export type AujourdHui = Awaited<ReturnType<typeof construireAujourdhui>>;
