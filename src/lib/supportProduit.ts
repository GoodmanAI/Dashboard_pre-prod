import type { Prisma } from "@prisma/client";
import { cheminCentre } from "@/lib/cheminsCentre";
import { ORDRE_PRODUITS, PRODUITS, produitDepuisNom, type SlugProduit } from "@/lib/produits";

/**
 * Le support, produit par produit (28/10/2026).
 *
 * Le support vivait hors du chemin d'un centre (`/client/ticket`, `/admin/ticket`) :
 * sans produit dans l'URL, l'écran retombait sur LyraeTalk, ses couleurs et son
 * menu, même ouvert depuis Konnect. Il vit maintenant sous chaque produit,
 * `/client/c/{userId}/{produit}/support`, et chaque produit ne montre que ses
 * tickets.
 *
 * Un ticket appartient au produit de son `userProductId`. Les tickets sans
 * affiliation sont ceux d'avant ce découpage, tous ouverts depuis LyraeTalk : ils
 * restent à LyraeTalk.
 */

/** Le produit d'un ticket, d'après le nom du produit de son affiliation. */
export function produitDuTicket(nomProduit: string | null | undefined): SlugProduit {
  return produitDepuisNom(nomProduit)?.slug ?? "talk";
}

/** `?produit=` d'une requête : un slug connu, sinon `null` (aucun filtre). */
export function lireProduitParam(valeur: string | null | undefined): SlugProduit | null {
  return ORDRE_PRODUITS.find((slug) => slug === valeur) ?? null;
}

/** Le filtre Prisma des tickets d'un produit. */
export function filtreTicketsDuProduit(slug: SlugProduit): Prisma.TicketWhereInput {
  const parNom: Prisma.TicketWhereInput = {
    userProduct: { product: { name: { equals: PRODUITS[slug].nom, mode: "insensitive" } } },
  };
  return slug === "talk" ? { OR: [{ userProductId: null }, parNom] } : parNom;
}

/** L'adresse du support d'un produit, ou d'un de ses tickets. */
export function cheminSupport(userId: number, produit: SlugProduit, ticketId?: number): string {
  return cheminCentre(userId, produit, ticketId ? `support/${ticketId}` : "support");
}
