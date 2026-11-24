import type { Prisma } from "@prisma/client";
import { journaliser } from "@/pilot/lib/evenements/journaliser";
import { evaluerSansEchouer } from "@/pilot/lib/checklist/evaluer";

type Ligne = { productId: number | null; centreId: number | null };

/**
 * Les produits qu'un contrat signé ajoute aux centres (C-90), calcul pur.
 * Une ligne d'un produit sur un centre le rattache à ce centre. Une ligne
 * d'un produit pour toute l'organisation le rattache au centre unique s'il n'y
 * en a qu'un ; sinon on ne devine pas, et la ligne est rendue dans `sansCentre`
 * pour que l'écran dise quoi faire. Un rattachement qui existe déjà ne bouge pas.
 */
export function produitsARattacher(lignes: readonly Ligne[], centres: readonly number[], existants: readonly { centreId: number; productId: number }[]) {
  const vus = new Set(existants.map((e) => `${e.centreId}:${e.productId}`));
  const aCreer: { centreId: number; productId: number }[] = [];
  const sansCentre = new Set<number>();
  for (const l of lignes) {
    if (l.productId === null) continue;
    const centreId = l.centreId ?? (centres.length === 1 ? centres[0] : null);
    if (centreId === null || !centres.includes(centreId)) { sansCentre.add(l.productId); continue; }
    const cle = `${centreId}:${l.productId}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    aCreer.push({ centreId, productId: l.productId });
  }
  // Un produit rattaché ailleurs par une autre ligne n'est plus « sans centre ».
  for (const r of [...existants, ...aCreer]) sansCentre.delete(r.productId);
  return { aCreer, sansCentre: [...sansCentre] };
}

/**
 * Rattache aux centres les produits d'un contrat, dans la transaction qui le
 * signe ou l'active (C-90) : l'onglet Centres et la check-list de mise en
 * service les montrent aussitôt. Rend les rattachements créés, à évaluer après
 * le commit (`evaluerRattachements`), et les produits restés sans centre.
 */
export async function rattacherProduitsDuContrat(tx: Prisma.TransactionClient, organisationId: number, lignes: readonly Ligne[], auteurId: number) {
  const centres = await tx.crmCentre.findMany({ where: { organisationId }, select: { id: true, nom: true }, orderBy: { id: "asc" } });
  const existants = await tx.crmCentreProduit.findMany({ where: { centre: { organisationId } }, select: { centreId: true, productId: true } });
  const { aCreer, sansCentre } = produitsARattacher(lignes, centres.map((c) => c.id), existants);
  const noms = new Map((await tx.product.findMany({ where: { id: { in: [...aCreer.map((r) => r.productId), ...sansCentre] } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]));
  const crees: number[] = [];
  for (const r of aCreer) {
    const cree = await tx.crmCentreProduit.create({ data: r });
    const centre = centres.find((c) => c.id === r.centreId)!;
    await journaliser(tx, { type: "RATTACHEMENT_CREE", organisationId, centreId: r.centreId, centreProduitId: cree.id, auteurId,
      resume: `Produit ajouté par le contrat : ${noms.get(r.productId) ?? "produit"} · ${centre.nom}`, apres: { productId: r.productId } });
    crees.push(cree.id);
  }
  return { crees, sansCentre: sansCentre.map((id) => noms.get(id) ?? "Produit") };
}

/** Après le commit : une panne du registre ne refuse pas la signature (même règle que `rattacherProduit`). */
export async function evaluerRattachements(ids: readonly number[]) {
  for (const id of ids) await evaluerSansEchouer(id);
}

/** La phrase pour les produits qu'on n'a pas pu placer : plusieurs centres, ligne sans centre. */
export function phraseSansCentre(produits: readonly string[]): string | null {
  if (!produits.length) return null;
  return `${produits.join(", ")} : ${produits.length > 1 ? "lignes" : "ligne"} sans centre et plusieurs centres. Ajoutez le produit au bon centre dans l'onglet Centres.`;
}
