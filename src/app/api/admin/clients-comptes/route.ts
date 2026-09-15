export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import { isSubAccount, type PermissionsMap } from "@/lib/permissions";
import { ORDRE_PRODUITS, produitDepuisNom, type SlugProduit } from "@/lib/produits";
import { lireEtEvaluer } from "@/lib/completude/lecture";
import type { StatutCentre } from "@/lib/centreStatut";

/**
 * Les clients, leurs produits et leurs comptes, en un seul appel.
 *
 * **Pourquoi cette route existe** (15/09/2026, lot 3). Reconstituer « un client avec ses
 * produits ET ses comptes » demandait trois appels par client :
 * `/api/admin/clients/:id/products`, `/api/admin/users?managerId=:id`, et
 * `/api/completude`. Sur un parc de vingt clients, cela fait soixante allers-retours
 * pour afficher un tableau. Les trois routes restent en place et gardent leur usage :
 * celle-ci ne fait que la jointure, et elle ne remplace rien.
 *
 * **Elle est en lecture seule, et volontairement.** Créer, modifier et révoquer passent
 * par les routes qui le font déjà, avec leurs gardes (SUPER_ADMIN pour les comptes,
 * ADMIN pour les produits). Ajouter ici des verbes d'écriture aurait dupliqué ces gardes
 * à un second endroit, ce qui est la façon la plus sûre de les faire diverger.
 *
 * ⚠️ **Elle expose l'annuaire du parc** : noms, identifiants de connexion, rattachements.
 * D'où `requireAdmin`. C'est exactement ce qui manquait à `/api/konnect-installation`
 * jusqu'au 14/09/2026, où `requireAuth` seul laissait n'importe quel client lire la
 * liste de tous les autres.
 */

type CompteExpose = {
  id: number;
  nom: string | null;
  identifiant: string;
  centreRole: string | null;
  isSecretary: boolean;
  managerId: number | null;
  /** Le compte est-il un sous-compte (parent + permissions propres) ? */
  estSousCompte: boolean;
  /** `null` = accès complet du rôle. Sinon, le détail page par page. */
  permissions: PermissionsMap | null;
  /** Compte verrouillé par l'anti-force brute, jusqu'à cette date. */
  verrouilleJusqua: string | null;
  creeLe: string;
};

type ProduitExpose = {
  slug: string;
  libelle: string;
  /**
   * L'identifiant de l'AFFILIATION (`UserProduct.id`). C'est lui qui identifie le
   * centre dans tout l'ecosysteme (`userProductId` du glossaire).
   */
  userProductId: number;
  /**
   * L'identifiant du PRODUIT au catalogue (`Product.id`). Distinct du precedent, et
   * c'est celui qu'attendent `POST` et `DELETE /api/admin/clients/:id/products`.
   *
   * Les deux sont des entiers et se confondent a la lecture : passer l'un pour
   * l'autre vise un produit qui n'existe pas, ou pire, le mauvais. Constate le
   * 15/09/2026, et invisible a l'apercu visuel puisqu'il n'appelle aucune API.
   */
  productId: number;
  affilieLe: string;
  /**
   * Où en est la mise en service de ce produit chez ce client.
   *
   * Le registre de complétude (`src/lib/completude/`) le calcule déjà pour les deux
   * pages d'installation. `lireEtEvaluer()` évalue **tout le parc en un appel**, donc
   * l'ajouter ici ne coûte qu'une requête de plus au total, pas une par client.
   */
  statut: StatutCentre;
  bloquants: number;
  degrades: number;
  satisfaites: number;
  total: number;
};

export type LigneClientComptes = {
  userId: number;
  nom: string | null;
  identifiant: string;
  centreRole: string | null;
  produits: ProduitExpose[];
  comptes: CompteExpose[];
};

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  const slugDemande = req.nextUrl.searchParams.get("produit");

  // Le verdict de complétude pour tout le parc, en un appel. Indexé par
  // `userProductId`, qui est la clé du couple client × produit.
  const evalues = await lireEtEvaluer();
  const parUserProduct = new Map(evalues.map((e) => [e.userProductId, e]));

  // Tous les comptes CLIENT, avec leurs produits affiliés. `removedAt: null` est ce qui
  // distingue un produit encore actif d'un produit retiré : la ligne n'est jamais
  // supprimée, pour garder la trace de l'affiliation passée.
  const clients = await prisma.user.findMany({
    where: { role: "CLIENT" },
    select: {
      id: true,
      name: true,
      email: true,
      centreRole: true,
      isSecretary: true,
      managerId: true,
      permissions: true,
      lockedUntil: true,
      createdAt: true,
      userProducts: {
        where: { removedAt: null },
        select: {
          id: true,
          assignedAt: true,
          productId: true,
          product: { select: { name: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // Un compte rattaché à un parent n'est pas un client de plus : c'est un accès de
  // plus au même client. On range donc chaque compte sous son parent, et seuls les
  // comptes sans parent ouvrent une ligne.
  const parId = new Map(clients.map((c) => [c.id, c]));

  const exposerCompte = (c: (typeof clients)[number]): CompteExpose => ({
    id: c.id,
    nom: c.name,
    identifiant: c.email,
    centreRole: c.centreRole,
    isSecretary: c.isSecretary,
    managerId: c.managerId,
    estSousCompte: isSubAccount({
      role: "CLIENT",
      permissions: c.permissions,
      managerId: c.managerId,
    }),
    permissions: (c.permissions as PermissionsMap | null) ?? null,
    verrouilleJusqua: c.lockedUntil ? c.lockedUntil.toISOString() : null,
    creeLe: c.createdAt.toISOString(),
  });

  const lignes: LigneClientComptes[] = [];

  for (const client of clients) {
    if (client.managerId !== null && parId.has(client.managerId)) continue;

    const produits: ProduitExpose[] = [];
    for (const up of client.userProducts) {
      const produit = produitDepuisNom(up.product.name);
      // Liste blanche sur le catalogue : un produit archivé (LyraeExplain) a encore
      // des lignes en base, il n'a pas à remonter dans un écran d'exploitation.
      if (!produit) continue;
      const evalue = parUserProduct.get(up.id);
      produits.push({
        slug: produit.slug,
        libelle: produit.libelle,
        userProductId: up.id,
        productId: up.productId,
        affilieLe: up.assignedAt.toISOString(),
        // Un produit tout juste affilié n'a pas encore de ligne de configuration, donc
        // pas d'évaluation. « En intégration, rien de renseigné » est la vérité de ce
        // cas, et c'est ce qu'il faut montrer plutôt qu'une case vide.
        statut: evalue?.statut ?? "integration",
        bloquants: evalue?.completude.bloquants ?? 0,
        degrades: evalue?.completude.degrades ?? 0,
        satisfaites: evalue?.completude.satisfaites ?? 0,
        total: evalue?.completude.total ?? 0,
      });
    }
    produits.sort(
      (a, b) =>
        ORDRE_PRODUITS.indexOf(a.slug as SlugProduit) -
        ORDRE_PRODUITS.indexOf(b.slug as SlugProduit)
    );

    if (slugDemande && !produits.some((p) => p.slug === slugDemande)) continue;

    const rattaches = clients.filter((c) => c.managerId === client.id);

    lignes.push({
      userId: client.id,
      nom: client.name,
      identifiant: client.email,
      centreRole: client.centreRole,
      produits,
      comptes: [exposerCompte(client), ...rattaches.map(exposerCompte)],
    });
  }

  return NextResponse.json({ lignes });
}
