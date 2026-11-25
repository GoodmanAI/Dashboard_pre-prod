import { prisma } from "@/pilot/lib/prisma";
import { lireGrilleEnVigueur } from "@/pilot/lib/tarifs/grille";
import { lignesFacturation } from "@/lib/sallesFactureesLecture";
import { facturerLignes, prixDesSalles, type AbonnementsContrat } from "./calcul";
import { produitDepuisNom } from "@/lib/produits";

/**
 * Ce que l'écran Facturation lit : les salles cochées au Dashboard (une ligne par
 * client et par site), le prix de la grille de Pilot, et les formations de POC
 * dont la facture n'est pas encore émise (C-95). Trois lectures en parallèle.
 */
export async function chargerFacturation() {
  const [grille, salles, formations, contrats] = await Promise.all([
    lireGrilleEnVigueur(),
    lignesFacturation(),
    prisma.crmFormationPoc.findMany({
      where: { factureEmiseLe: null },
      select: { organisationId: true, debuteLe: true, montantCentimes: true, organisation: { select: { raisonSocialeNom: true } } },
      orderBy: { debuteLe: "asc" },
    }),
    abonnementsDesContrats(),
  ]);
  const prix = prixDesSalles(grille);
  return {
    grilleDu: grille.applicableLe,
    prix,
    ...facturerLignes(salles, prix, contrats),
    formations: formations.map((f) => ({
      organisationId: f.organisationId,
      nom: f.organisation.raisonSocialeNom,
      debuteLe: f.debuteLe.toISOString().slice(0, 10),
      montantCentimes: f.montantCentimes,
    })),
  };
}

/**
 * Les abonnements Talk et Konnect des contrats actifs, au net, par compte du Dashboard
 * (25/11/2026) : la fiche Pilot est reliée à ce compte par la reprise (`utilisateurId`).
 * Une ligne d'abonnement sans produit, ou d'un autre produit, ne compte pas ici.
 */
async function abonnementsDesContrats(): Promise<AbonnementsContrat> {
  const lignes = await prisma.crmLigneContrat.findMany({
    where: { type: "ABONNEMENT", productId: { not: null }, contrat: { statut: "ACTIF", organisation: { utilisateurId: { not: null } } } },
    select: { montantCentimes: true, product: { select: { name: true } }, contrat: { select: { organisation: { select: { utilisateurId: true } } } } },
  });
  const parClient: AbonnementsContrat = new Map();
  for (const l of lignes) {
    const userId = l.contrat.organisation.utilisateurId;
    const slug = produitDepuisNom(l.product?.name)?.slug;
    if (userId === null || (slug !== "talk" && slug !== "konnect")) continue;
    const c = parClient.get(userId) ?? {};
    c[slug] = (c[slug] ?? 0) + l.montantCentimes;
    parClient.set(userId, c);
  }
  return parClient;
}
