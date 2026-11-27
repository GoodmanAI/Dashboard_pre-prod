import { Prisma, type CrmEtapeCommerciale } from "@prisma/client";
import { suitLaMiseEnService } from "@/pilot/lib/pipeline";
import type { StatutCentre } from "@/lib/centreStatut";

/**
 * Le statut d'un centre au Dashboard (table `CentreStatut` : intégration, production,
 * arrêté), écrit par Pilot seul depuis le 27/11/2026 (décision d'Enzo, plan
 * lyrae/plans/2026-11-separation-dashboard-pilot.md, lot L5). Le Dashboard ne fait plus
 * que le lire : il décide des alertes de complétude qu'il affiche.
 *
 * La règle, par produit rattaché à un compte du Dashboard :
 *   - la fiche ne suit plus de mise en service (arrêtée, perdue, en pause, POC non
 *     transformé) : `arrete` ;
 *   - sinon, la case « Passage en production » du centre est cochée : `production` ;
 *   - sinon : `integration`.
 *
 * Appelée dans la transaction du geste qui peut la changer : cocher ou décocher le
 * passage en production, changer l'étape de la fiche, rattacher un compte.
 */
export function statutAttendu(etape: CrmEtapeCommerciale, passageFait: boolean): StatutCentre {
  if (!suitLaMiseEnService(etape)) return "arrete";
  return passageFait ? "production" : "integration";
}

export type Cible = { organisationId: number } | { centreProduitIds: number[] };

export type StatutAEcrire = { userProductId: number; statut: StatutCentre };

/** Les statuts que Pilot attend pour les comptes rattachés de la cible. */
export async function statutsAttendus(tx: Prisma.TransactionClient, cible: Cible): Promise<StatutAEcrire[]> {
  const where: Prisma.CrmCentreProduitWhereInput =
    "organisationId" in cible
      ? { centre: { organisationId: cible.organisationId }, userProductId: { not: null } }
      : { id: { in: cible.centreProduitIds }, userProductId: { not: null } };
  const lignes = await tx.crmCentreProduit.findMany({
    where,
    select: {
      userProductId: true, centreId: true, productId: true,
      centre: { select: { organisation: { select: { etape: true } } } },
    },
  });
  if (!lignes.length) return [];
  const faites = await tx.crmEtapeIntegration.findMany({
    where: { cle: "PASSAGE_PRODUCTION", faite: true, OR: lignes.map((l) => ({ centreId: l.centreId, productId: l.productId })) },
    select: { centreId: true, productId: true },
  });
  const passage = new Set(faites.map((f) => `${f.centreId}:${f.productId}`));
  return lignes.map((l) => ({
    userProductId: l.userProductId as number,
    statut: statutAttendu(l.centre.organisation.etape, passage.has(`${l.centreId}:${l.productId}`)),
  }));
}

/**
 * Écrit les statuts attendus. `depuis` n'est redaté que si le statut change, comme la
 * route du Dashboard le faisait. Rend les comptes dont le statut a changé.
 */
export async function ecrireStatuts(tx: Prisma.TransactionClient, statuts: StatutAEcrire[], auteurId: number | null): Promise<number[]> {
  const changes: number[] = [];
  for (const s of statuts) {
    const r = await tx.$queryRaw<Array<{ change: boolean }>>`
      WITH avant AS (SELECT "statut" FROM "CentreStatut" WHERE "userProductId" = ${s.userProductId})
      INSERT INTO "CentreStatut" ("userProductId", "statut", "majPar")
      VALUES (${s.userProductId}, ${s.statut}, ${auteurId})
      ON CONFLICT ("userProductId") DO UPDATE SET
        "statut" = EXCLUDED."statut",
        "majPar" = EXCLUDED."majPar",
        "depuis" = CASE WHEN "CentreStatut"."statut" IS DISTINCT FROM EXCLUDED."statut" THEN NOW() ELSE "CentreStatut"."depuis" END,
        "updatedAt" = NOW()
      WHERE "CentreStatut"."statut" IS DISTINCT FROM EXCLUDED."statut"
      RETURNING (SELECT "statut" FROM avant) IS DISTINCT FROM ${s.statut} AS change`;
    if (r[0]?.change) changes.push(s.userProductId);
  }
  return changes;
}

/** Le geste complet : calcule puis écrit, dans la transaction de l'appelant. */
export async function synchroniserStatutsDashboard(tx: Prisma.TransactionClient, cible: Cible, auteurId: number | null): Promise<number[]> {
  return ecrireStatuts(tx, await statutsAttendus(tx, cible), auteurId);
}
