export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import { NOMS_PRODUITS, ORDRE_PRODUITS, PRODUITS, produitDepuisNom } from "@/lib/produits";

/**
 * Affiliation d'un client aux produits (admin uniquement).
 *
 * Étape 4 du chantier multi-produit. Un compte client peut porter LyraeTalk,
 * LyraeKonnect, ou les deux.
 *
 * **Le retrait ne supprime jamais la ligne `UserProduct`** : il pose
 * `removedAt`. La ligne porte l'identifiant (`userProductId`) utilisé comme clé
 * de jointure par LyraeTalk, AI2Xplore et `KonnectTenantMapping`, et tout ce qui
 * y pend — appels, tickets, mappings d'examens, configuration — disparaîtrait en
 * cascade. Réaffilier plus tard remet simplement `removedAt` à `null` et
 * l'historique réapparaît intact.
 *
 * Seuls les produits du catalogue `src/lib/produits.ts` sont manipulables.
 * `LyraeExplain`, retiré du dashboard mais toujours en base, n'est ni listé ni
 * affiliable — sans pour autant être supprimé de la base.
 *
 *  GET    /api/admin/clients/{id}/products
 *    → le catalogue, avec l'état d'affiliation du client pour chacun.
 *    → { userId, rows: [{ slug, nom, libelle, productId, userProductId,
 *                         affilie, assignedAt, removedAt, tenantId }] }
 *      `tenantId` n'est renseigné que pour LyraeKonnect.
 *
 *  POST   /api/admin/clients/{id}/products    body : { productId }
 *    → affilie, ou réactive une affiliation retirée.
 *
 *  DELETE /api/admin/clients/{id}/products?productId=<n>
 *    → retire (pose `removedAt`). Idempotent.
 */

type LigneProduit = {
  slug: string;
  nom: string;
  libelle: string;
  productId: number;
  userProductId: number | null;
  affilie: boolean;
  assignedAt: string | null;
  removedAt: string | null;
  tenantId: string | null;
};

/** Le client existe-t-il et est-il bien un CLIENT ? */
async function chargerClient(id: number) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const client = await chargerClient(id);
  if (!client) {
    return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  }

  const [produits, affiliations] = await Promise.all([
    prisma.product.findMany({
      where: { name: { in: NOMS_PRODUITS } },
      select: { id: true, name: true },
    }),
    prisma.userProduct.findMany({
      where: { userId: id },
      select: { id: true, productId: true, assignedAt: true, removedAt: true },
    }),
  ]);

  // Le tenant Konnect vit dans une table hors schema.prisma : on ne le lit que
  // si une affiliation Konnect existe, pour éviter une requête inutile.
  const affiliationKonnect = (() => {
    const produitKonnect = produits.find((p) => produitDepuisNom(p.name)?.slug === "konnect");
    if (!produitKonnect) return null;
    return affiliations.find((a) => a.productId === produitKonnect.id) ?? null;
  })();

  let tenantKonnect: string | null = null;
  if (affiliationKonnect) {
    const res = await prisma.$queryRaw<{ tenantId: string }[]>`
      SELECT "tenantId"::text FROM "KonnectTenantMapping"
       WHERE "userProductId" = ${affiliationKonnect.id} LIMIT 1
    `;
    tenantKonnect = res[0]?.tenantId ?? null;
  }

  // On itère sur le catalogue et non sur la base : l'ordre d'affichage est
  // stable, et un produit absent de `Product` apparaît explicitement comme
  // non installé plutôt que de disparaître en silence.
  const rows: LigneProduit[] = ORDRE_PRODUITS.map((slug) => {
    const produit = PRODUITS[slug];
    const enBase = produits.find((p) => produitDepuisNom(p.name)?.slug === slug);
    const affiliation = enBase
      ? affiliations.find((a) => a.productId === enBase.id) ?? null
      : null;

    return {
      slug,
      nom: produit.nom,
      libelle: produit.libelle,
      productId: enBase?.id ?? -1,
      userProductId: affiliation?.id ?? null,
      affilie: affiliation != null && affiliation.removedAt == null,
      assignedAt: affiliation?.assignedAt?.toISOString() ?? null,
      removedAt: affiliation?.removedAt?.toISOString() ?? null,
      tenantId: slug === "konnect" ? tenantKonnect : null,
    };
  });

  return NextResponse.json({
    userId: client.id,
    userName: client.name,
    userEmail: client.email,
    rows,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const productId = Number(body?.productId);
  if (!Number.isFinite(productId)) {
    return NextResponse.json({ error: "productId requis" }, { status: 400 });
  }

  const client = await chargerClient(id);
  if (!client) {
    return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  }
  if (client.role !== "CLIENT") {
    return NextResponse.json(
      { error: "Seuls les comptes CLIENT portent des produits." },
      { status: 403 }
    );
  }

  const produit = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true },
  });
  if (!produit) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }
  // Garde-fou : on n'affilie que des produits du catalogue. Sans ce contrôle,
  // un productId arbitraire ressusciterait LyraeExplain, retiré du dashboard.
  if (!produitDepuisNom(produit.name)) {
    return NextResponse.json(
      { error: `Le produit "${produit.name}" n'est pas au catalogue.` },
      { status: 400 }
    );
  }

  // Upsert et non create : une affiliation retirée existe toujours en base et
  // occupe la contrainte unique (userId, productId). La réactiver, c'est
  // remettre `removedAt` à null — surtout pas créer une seconde ligne.
  const affiliation = await prisma.userProduct.upsert({
    where: { userId_productId: { userId: id, productId } },
    update: { removedAt: null },
    create: { userId: id, productId },
    select: { id: true, assignedAt: true, removedAt: true },
  });

  auditLog("account", "affilier-produit", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "user", id: client.id, label: client.email },
    metadata: {
      produit: produit.name,
      productId,
      userProductId: affiliation.id,
    },
  });

  return NextResponse.json({
    userProductId: affiliation.id,
    productId,
    produit: produit.name,
    affilie: true,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const productIdParam = req.nextUrl.searchParams.get("productId");
  const productId = productIdParam ? Number(productIdParam) : NaN;
  if (!Number.isFinite(productId)) {
    return NextResponse.json(
      { error: "Missing or invalid productId query param" },
      { status: 400 }
    );
  }

  const affiliation = await prisma.userProduct.findUnique({
    where: { userId_productId: { userId: id, productId } },
    select: { id: true, removedAt: true, product: { select: { name: true } } },
  });
  if (!affiliation) {
    return NextResponse.json({ error: "Affiliation introuvable" }, { status: 404 });
  }
  if (affiliation.removedAt) {
    // Déjà retirée : on répond 200 sans rien changer, pour que l'appel reste
    // idempotent (double clic, rejeu).
    return NextResponse.json({
      userProductId: affiliation.id,
      affilie: false,
      removedAt: affiliation.removedAt.toISOString(),
    });
  }

  const maj = await prisma.userProduct.update({
    where: { id: affiliation.id },
    data: { removedAt: new Date() },
    select: { id: true, removedAt: true },
  });

  auditLog("account", "retirer-produit", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "user", id },
    metadata: {
      produit: affiliation.product.name,
      productId,
      userProductId: affiliation.id,
    },
  });

  return NextResponse.json({
    userProductId: maj.id,
    affilie: false,
    removedAt: maj.removedAt?.toISOString() ?? null,
  });
}
