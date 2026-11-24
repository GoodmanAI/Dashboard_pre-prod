import type { CrmCleEtape, CrmTiers } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";
import { instantSql } from "@/pilot/lib/datesSql";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { definitionEtape } from "./definition";
import { ATTENTE_VIDE, champsAttente, libelleAttente, preparerAttente, verifierAttente, type ChampsAttente } from "./reglesAttentes";

async function modifierAttente(etapeId: number, operation: "declarer" | "relancer" | "lever", auteurId: number, declaration?: ChampsAttente) {
  return transactionJournalisee(async (tx) => {
    const etape = await tx.crmEtapeIntegration.findUnique({ where: { id: etapeId }, include: { centre: true, product: { select: { name: true } } } });
    if (!etape) throw new ErreurMetier("Étape inconnue.", 404);
    verifierAttente(etape, operation);
    const rattachement = await tx.crmCentreProduit.findUniqueOrThrow({ where: { centreId_productId: { centreId: etape.centreId, productId: etape.productId } }, select: { id: true } });
    const avant = champsAttente(etape);
    const apres = operation === "declarer" ? declaration! : operation === "lever" ? ATTENTE_VIDE : { ...avant, derniereRelanceLe: new Date() };
    const ecrites = await tx.crmEtapeIntegration.updateMany({
      where: { id: etapeId, mode: etape.mode, faite: etape.faite, ...avant }, data: apres,
    });
    if (!ecrites.count) throw new ErreurMetier("L'attente vient d'être modifiée. Rechargez la page.", 409);
    const prefixe = operation === "declarer" ? libelleAttente(apres.enAttenteDe!) : operation === "relancer" ? "Relancé :" : "Attente levée :";
    await journaliser(tx, { type: "ATTENTE_TIERS_CHANGEE", auteurId, organisationId: etape.centre.organisationId,
      centreId: etape.centreId, centreProduitId: rattachement.id, etapeIntegrationId: etapeId,
      resume: `${prefixe}${operation === "declarer" ? " ·" : ""} ${definitionEtape(etape.cle, etape.product.name).libelle} · ${etape.centre.nom}`, avant, apres });
    return { ...etape, ...apres };
  });
}
export function declarerAttente(etapeId: number, p: { enAttenteDe: CrmTiers; demandeeLe?: Date; echeanceLe?: Date | null }, auteurId: number) {
  return modifierAttente(etapeId, "declarer", auteurId, preparerAttente(p, new Date()));
}
export function relancer(etapeId: number, auteurId: number) { return modifierAttente(etapeId, "relancer", auteurId); }
export function leverAttente(etapeId: number, auteurId: number) { return modifierAttente(etapeId, "lever", auteurId); }

export type Attente = ChampsAttente & {
  id: number; cle: CrmCleEtape; organisationId: number; organisationNom: string; centreNom: string; produit: string;
};
/** Une lecture SQL, tri stable. Le chef de projet prime sur le commercial. */
export async function listerAttentes({ tiers, aMoi = false, utilisateurId, avant, limite, saut = 0 }: {
  tiers?: CrmTiers; aMoi?: boolean; utilisateurId: number; avant?: Date; limite?: number; saut?: number;
}): Promise<Attente[]> {
  return prisma.$queryRaw<Attente[]>(Prisma.sql`
    SELECT e.id, e.cle, e."enAttenteDe", e."demandeeLe", e."derniereRelanceLe", e."echeanceLe",
      o.id AS "organisationId", o."raisonSocialeNom" AS "organisationNom", c.nom AS "centreNom", p.name AS produit
    FROM "CrmEtapeIntegration" e JOIN "CrmCentre" c ON c.id = e."centreId"
    JOIN "CrmOrganisation" o ON o.id = c."organisationId" JOIN "Product" p ON p.id = e."productId"
    WHERE e."enAttenteDe" IS NOT NULL
      AND (${tiers ?? null}::text IS NULL OR e."enAttenteDe"::text = ${tiers ?? null})
      AND (${!aMoi} OR COALESCE(o."chefDeProjetId", o."responsableId") = ${utilisateurId})
      ${avant ? Prisma.sql`AND COALESCE(e."derniereRelanceLe", e."demandeeLe") < ${instantSql(avant)}` : Prisma.empty}
    ORDER BY e."demandeeLe" ASC NULLS LAST, e.id
    LIMIT ${limite ?? null} OFFSET ${saut}`);
}
export function serialiserAttente(e: Attente) {
  return { ...e, libelle: definitionEtape(e.cle, e.produit).libelle, demandeeLe: e.demandeeLe?.toISOString() ?? null,
    derniereRelanceLe: e.derniereRelanceLe?.toISOString() ?? null, echeanceLe: e.echeanceLe?.toISOString() ?? null };
}
