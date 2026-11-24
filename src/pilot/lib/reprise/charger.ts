import { prisma } from "@/pilot/lib/prisma";
import { evaluerPlusieurs } from "@/pilot/lib/completude/adapter";
import { comptesInternes } from "@/pilot/lib/referentiels";
import { ETAPES_REPRISE, grouperComptes, resumeReprise, type LigneAcces } from "./regles";

export type OrganisationReprise = {
  id: number; nom: string; utilisateurId: number | null;
  centres: { id: number; nom: string; produits: number[] }[];
};

/**
 * L'écran « Comptes à relier » en lecture seule, en sept requêtes quel que soit
 * le parc : les accès libres, le registre de complétude (trois, par
 * l'adaptateur), les organisations, les comptes internes et les contrats à saisir.
 * Aucune écriture, ni dans Pilot ni dans les miroirs du Dashboard.
 */
export async function chargerReprise() {
  // Un accès libre : actif, d'un compte client, qu'aucun centre de Pilot ne suit.
  const lignes = await prisma.$queryRaw<LigneAcces[]>`
    SELECT up.id AS "userProductId", up."productId", p.name AS produit,
      u.id AS "userId", u.email, u.name AS nom,
      o.id AS "organisationId", o."raisonSocialeNom" AS "organisationNom",
      e.raison AS "ecarteRaison", e."creeLe" AS "ecarteLe"
    FROM "UserProduct" up
    JOIN "User" u ON u.id = up."userId" AND u.role = 'CLIENT'
    JOIN "Product" p ON p.id = up."productId"
    LEFT JOIN LATERAL (SELECT id, "raisonSocialeNom" FROM "CrmOrganisation"
      WHERE "utilisateurId" = u.id ORDER BY id LIMIT 1) o ON true
    LEFT JOIN "CrmCompteEcarte" e ON e."userId" = u.id
    WHERE up."removedAt" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "CrmCentreProduit" r WHERE r."userProductId" = up.id)
    ORDER BY u.id, up.id`;
  const userIds = [...new Set(lignes.map((l) => l.userId))];
  const [etats, organisations, internes, sansContrat] = await Promise.all([
    evaluerPlusieurs(lignes.map((l) => l.userProductId)),
    prisma.crmOrganisation.findMany({
      where: { OR: [{ utilisateurId: null }, { utilisateurId: { in: userIds } }], etape: { notIn: ["PERDU", "ARRETE"] } },
      select: { id: true, raisonSocialeNom: true, utilisateurId: true,
        centres: { select: { id: true, nom: true, rattachements: { select: { productId: true } } }, orderBy: { nom: "asc" } } },
      orderBy: { raisonSocialeNom: "asc" },
    }),
    comptesInternes(),
    // Sans contrat actif, un client signé compte zéro dans le chiffre d'affaires.
    prisma.crmOrganisation.findMany({
      where: { etape: { in: [...ETAPES_REPRISE] }, contrats: { none: { statut: "ACTIF" } } },
      select: { id: true, raisonSocialeNom: true, etape: true, responsable: { select: { name: true } }, _count: { select: { centres: true } } },
      orderBy: { raisonSocialeNom: "asc" },
    }),
  ]);
  const comptes = grouperComptes(lignes, etats);
  // Un compte relié à un client n'est plus écarté : il a une fiche, ses accès s'y ajoutent.
  const aRelier = comptes.filter((c) => !c.organisation && !c.ecarte);
  const aAjouter = comptes.filter((c) => c.organisation);
  const ecartes = comptes.filter((c) => !c.organisation && c.ecarte);
  return {
    aRelier, aAjouter, ecartes,
    contrats: sansContrat.map((o) => ({ id: o.id, nom: o.raisonSocialeNom, etape: o.etape, responsable: o.responsable?.name ?? null, centres: o._count.centres })),
    organisations: organisations.map((o): OrganisationReprise => ({ id: o.id, nom: o.raisonSocialeNom, utilisateurId: o.utilisateurId,
      centres: o.centres.map((c) => ({ id: c.id, nom: c.nom, produits: c.rattachements.map((r) => r.productId) })) })),
    internes,
    resume: resumeReprise({ comptes: aRelier.length + aAjouter.length, contrats: sansContrat.length }),
  };
}

export type DonneesReprise = Awaited<ReturnType<typeof chargerReprise>>;
