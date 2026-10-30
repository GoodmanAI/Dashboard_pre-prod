export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import {
  PAGE_GROUPS,
  PAGE_LABELS,
  PAGES,
  hasPermission,
  isSubAccount,
  type AccessLevel,
  type PageKey,
} from "@/lib/permissions";
import { ORDRE_PRODUITS, PRODUITS, produitDepuisNom, type SlugProduit } from "@/lib/produits";
import { cheminCentre } from "@/lib/cheminsCentre";
import { cheminSupport, filtreTicketsDuProduit } from "@/lib/supportProduit";

/**
 * GET /api/client/profil (30/10/2026)
 * -----------------------------------------------------------------------------
 * Ce que la page « Mon profil » montre en plus de `/api/client` : le centre et ses
 * produits, les droits du compte, ses connexions récentes, le support, et pour le
 * compte principal (ou le directeur multi-centres) la liste des comptes du client.
 *
 * Tout se lit pour le compte de la SESSION, jamais pour un identifiant passé en
 * paramètre : la route n'en prend aucun. Un sous-compte voit le centre de son compte
 * parent (c'est là que vivent les produits, cf. `/api/users/[userId]/products`), ses
 * propres droits, et pas la liste des comptes.
 *
 * Les connexions viennent de `LoginAttempt`, purgée à 30 jours
 * (`scripts/db-maintenance/purge_login_attempts.sh`) : « aucune connexion » veut
 * dire « aucune depuis 30 jours ». L'adresse IP n'est pas renvoyée.
 *
 * Aucune écriture, aucune donnée patient.
 */

type Niveau = Exclude<AccessLevel, "none">;

type CompteEquipe = {
  id: number;
  nom: string | null;
  email: string;
  genre: "principal" | "directeur" | "centre" | "sous_compte";
  /** `null` = accès complet. */
  droits: { ecriture: number; lecture: number } | null;
  derniereConnexion: string | null;
  bloque: boolean;
  creeLe: string;
};

/** Les pages lisibles par un compte, par groupe, limitées aux produits du centre. */
function droitsDuCompte(
  sujet: { role: string; permissions: unknown },
  produits: SlugProduit[]
) {
  return PAGE_GROUPS.filter((g) => {
    const produit = produitDepuisNom(g.titre);
    return produit === null || produits.includes(produit.slug);
  })
    .map((g) => ({
      titre: g.titre === "Transverse" ? "Commun aux produits" : g.titre,
      pages: g.pages
        .filter((p) => hasPermission(sujet, p, "read"))
        .map((p) => ({
          libelle: PAGE_LABELS[p],
          niveau: (hasPermission(sujet, p, "write") ? "write" : "read") as Niveau,
        })),
    }))
    .filter((g) => g.pages.length > 0);
}

/** Nombre de pages en écriture et en lecture seule, pour la liste des comptes. */
function resumeDroits(sujet: { role: string; permissions: unknown; managerId: number | null }) {
  if (!isSubAccount(sujet)) return null;
  let ecriture = 0;
  let lecture = 0;
  for (const p of Object.values(PAGES) as PageKey[]) {
    if (hasPermission(sujet, p, "write")) ecriture++;
    else if (hasPermission(sujet, p, "read")) lecture++;
  }
  return { ecriture, lecture };
}

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const sessionUserId = Number(auth.session.user.id);

  const moi = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: {
      id: true,
      email: true,
      role: true,
      centreRole: true,
      permissions: true,
      managerId: true,
      createdAt: true,
    },
  });
  if (!moi) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  if (moi.role !== "CLIENT") {
    return NextResponse.json({ error: "Réservé aux comptes clients" }, { status: 403 });
  }

  const sousCompte = isSubAccount(moi);
  const centreId = sousCompte ? (moi.managerId as number) : moi.id;

  const [centre, connexions, echecs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: centreId },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        postalCode: true,
        country: true,
        userProducts: {
          where: { removedAt: null },
          select: { id: true, assignedAt: true, product: { select: { name: true } } },
        },
        userNumbers: {
          where: { removedAt: null },
          select: { number: true },
          orderBy: { assignedAt: "asc" },
        },
      },
    }),
    prisma.loginAttempt.findMany({
      where: { email: moi.email.toLowerCase(), success: true },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { createdAt: true },
    }),
    prisma.loginAttempt.count({
      where: { email: moi.email.toLowerCase(), success: false },
    }),
  ]);
  if (!centre) return NextResponse.json({ error: "Centre introuvable" }, { status: 404 });

  // ── Produits du centre ─────────────────────────────────────────────────────
  const produits = ORDRE_PRODUITS.flatMap((slug) => {
    const up = centre.userProducts.find(
      (u) => produitDepuisNom(u.product.name)?.slug === slug
    );
    if (!up) return [];
    return [
      {
        slug,
        libelle: PRODUITS[slug].libelle,
        description: PRODUITS[slug].description,
        icone: PRODUITS[slug].logos.symbole,
        depuis: up.assignedAt.toISOString(),
        accueil: cheminCentre(centre.id, slug),
      },
    ];
  });
  const slugs = produits.map((p) => p.slug);

  // ── Support : tickets encore ouverts, par produit ──────────────────────────
  const peutSupport = hasPermission(moi, PAGES.TICKETS, "read");
  const support = peutSupport
    ? await Promise.all(
        produits.map(async (p) => ({
          slug: p.slug,
          libelle: p.libelle,
          chemin: cheminSupport(centre.id, p.slug),
          ouverts: await prisma.ticket.count({
            where: {
              userId: centre.id,
              status: { in: ["PENDING", "IN_PROGRESS"] },
              ...filtreTicketsDuProduit(p.slug),
            },
          }),
        }))
      )
    : [];

  // ── Comptes du client (compte principal ou directeur seulement) ────────────
  let equipe: { centre: string; comptes: CompteEquipe[] }[] | null = null;
  if (!sousCompte) {
    const select = {
      id: true,
      name: true,
      email: true,
      role: true,
      centreRole: true,
      permissions: true,
      managerId: true,
      lockedUntil: true,
      createdAt: true,
    } as const;
    const niveau1 = await prisma.user.findMany({
      where: { managerId: moi.id },
      select,
      orderBy: { createdAt: "asc" },
    });
    const centresGeres = niveau1.filter((u) => !isSubAccount(u));
    const niveau2 = centresGeres.length
      ? await prisma.user.findMany({
          where: { managerId: { in: centresGeres.map((c) => c.id) } },
          select,
          orderBy: { createdAt: "asc" },
        })
      : [];
    const moiComplet = await prisma.user.findUnique({ where: { id: moi.id }, select });

    const tous = [moiComplet!, ...niveau1, ...niveau2];
    const dernieres = await prisma.loginAttempt.groupBy({
      by: ["email"],
      where: { success: true, email: { in: tous.map((u) => u.email.toLowerCase()) } },
      _max: { createdAt: true },
    });
    const derniereDe = new Map(
      dernieres.map((d) => [d.email ?? "", d._max.createdAt?.toISOString() ?? null])
    );
    const maintenant = Date.now();
    const versCompte = (
      u: (typeof tous)[number],
      genre: CompteEquipe["genre"]
    ): CompteEquipe => ({
      id: u.id,
      nom: u.name,
      email: u.email,
      genre,
      droits: resumeDroits(u),
      derniereConnexion: derniereDe.get(u.email.toLowerCase()) ?? null,
      bloque: !!u.lockedUntil && u.lockedUntil.getTime() > maintenant,
      creeLe: u.createdAt.toISOString(),
    });

    equipe = [
      {
        centre: centre.name ?? "Votre compte",
        comptes: [
          versCompte(moiComplet!, moi.centreRole === "ADMIN_USER" ? "directeur" : "principal"),
          ...niveau1.filter((u) => isSubAccount(u)).map((u) => versCompte(u, "sous_compte")),
        ],
      },
      ...centresGeres.map((c) => ({
        centre: c.name ?? c.email,
        comptes: [
          versCompte(c, "centre"),
          ...niveau2
            .filter((u) => u.managerId === c.id)
            .map((u) => versCompte(u, isSubAccount(u) ? "sous_compte" : "centre")),
        ],
      })),
    ];
  }

  return NextResponse.json({
    compte: {
      sousCompte,
      creeLe: moi.createdAt.toISOString(),
    },
    centre: {
      id: centre.id,
      nom: centre.name,
      adresse: [centre.address, [centre.postalCode, centre.city].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", "),
      numeros: centre.userNumbers.map((n) => n.number),
    },
    produits,
    droits: sousCompte ? droitsDuCompte(moi, slugs) : null,
    securite: {
      connexions: connexions.map((c) => c.createdAt.toISOString()),
      refusees30j: echecs,
    },
    support,
    equipe,
  });
}
