import type { CrmReleveConcurrent } from "@prisma/client";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { prisma } from "@/pilot/lib/prisma";
import { compterParConcurrent, lienAvecConcurrent } from "./effectif";
import { marquerEnVigueur } from "./regles";

/** Le plus récent d'abord, comme l'index de la base : par date du relevé, puis par identifiant. */
const PLUS_RECENT_D_ABORD = [{ releveLe: "desc" }, { id: "desc" }] as const;

/**
 * La liste : chaque concurrent avec son relevé en vigueur et trois comptes, en
 * trois lectures quel que soit le nombre de concurrents. Le relevé en vigueur
 * est lu à part, un par concurrent (`DISTINCT ON`, dans l'ordre de l'index) :
 * un `take: 1` imbriqué ferait charger par Prisma tous les relevés de tous les
 * concurrents avant d'en garder un. Les comptes suivent la règle unique de
 * `effectif.ts`, appliquée en mémoire aux organisations liées (trois entiers et
 * une étape par ligne) : « en place chez » ne compte ni un client de Lyrae, ni
 * une affaire perdue, comptée à part, ni un établissement gagné par un autre.
 * Aucun établissement n'est compté deux fois. La fiche les détaille.
 */
export async function listerConcurrents() {
  const [concurrents, enVigueur, liees] = await Promise.all([
    prisma.crmConcurrent.findMany({
      orderBy: { nom: "asc" },
      include: { _count: { select: { releves: true } } },
    }),
    prisma.$queryRaw<CrmReleveConcurrent[]>`
      SELECT DISTINCT ON ("concurrentId") * FROM "CrmReleveConcurrent"
      ORDER BY "concurrentId", "releveLe" DESC, id DESC`,
    prisma.crmOrganisation.findMany({
      where: { OR: [{ concurrentId: { not: null } }, { concurrentGagnantId: { not: null } }] },
      select: { etape: true, concurrentId: true, concurrentGagnantId: true },
    }),
  ]);
  const vigueurDe = new Map(enVigueur.map((r) => [r.concurrentId, r]));
  const comptes = compterParConcurrent(liees);
  return concurrents.map(({ _count, ...c }) => ({
    ...c,
    enVigueur: vigueurDe.get(c.id) ?? null,
    nombreReleves: _count.releves,
    centresEquipes: comptes.get(c.id)?.enPlace ?? 0,
    affairesPerdues: comptes.get(c.id)?.perdues ?? 0,
  }));
}

/**
 * La fiche d'un concurrent : ses relevés du plus récent au plus ancien, le
 * premier marqué « en vigueur » (calculé ici, jamais stocké), les organisations
 * qui le désignent comme solution en place, avec leur étape (les clients de
 * Lyrae compris : l'écran les range sous « Passés chez Lyrae »), et les affaires
 * perdues contre lui. Le partage suit `lienAvecConcurrent` : une affaire perdue
 * contre lui n'est listée que parmi les affaires perdues, et un établissement
 * qu'un autre concurrent a gagné n'est plus listé chez lui, pas plus qu'un dossier
 * perdu sans gagnant ou un contrat terminé. Une seule lecture,
 * sans requête par ligne. Aucune donnée patient : des noms d'organisations.
 */
export async function lireConcurrent(id: number) {
  const concurrent = await prisma.crmConcurrent.findUnique({
    where: { id },
    include: {
      releves: { orderBy: [...PLUS_RECENT_D_ABORD] },
      organisationsEnPlace: {
        select: { id: true, raisonSocialeNom: true, etape: true, concurrentId: true, concurrentGagnantId: true },
        orderBy: [{ raisonSocialeNom: "asc" }, { id: "asc" }],
      },
      affairesGagnees: { select: { id: true, raisonSocialeNom: true, etape: true, dateSortie: true }, orderBy: [{ dateSortie: "desc" }, { id: "desc" }] },
    },
  });
  if (!concurrent) throw new ErreurMetier("Concurrent inconnu.", 404);
  const { releves, organisationsEnPlace, affairesGagnees, ...reste } = concurrent;
  // Le lien vient de `lienAvecConcurrent` : l'écran range « en place » et « passés chez Lyrae » d'après lui, sans règle à part.
  const centresEquipes = organisationsEnPlace.flatMap(({ id: organisationId, raisonSocialeNom, etape, concurrentId, concurrentGagnantId }) => {
    const lien = lienAvecConcurrent({ etape, concurrentId, concurrentGagnantId }, id);
    return lien === "en_place" || lien === "passe_chez_lyrae" ? [{ id: organisationId, raisonSocialeNom, etape, lien }] : [];
  });
  return { ...reste, releves: marquerEnVigueur(releves), centresEquipes, affairesPerdues: affairesGagnees };
}
