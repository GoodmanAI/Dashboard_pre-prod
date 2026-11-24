import { prisma } from "@/pilot/lib/prisma";
import { chronologie } from "@/pilot/lib/evenements/lire";
import { utilisateurCourant } from "@/pilot/lib/session";
import { comptesInternes, comptesDashboard, produits, userProductsLibres } from "@/pilot/lib/referentiels";
import { optionsConcurrents } from "@/pilot/lib/concurrents/options";
import type { CrmIssueCyclePoc } from "@prisma/client";

type LectureCyclePoc = { clos: boolean; debuteLe: Date | null; prolongeLe: Date | null; issue: CrmIssueCyclePoc | null };

/** Nombre de lectures borné par les relations, jamais par les contacts ou centres. */
export async function chargerFiche(id: number) {
  const [utilisateur, org, historique, comptes, clients, catalogue, comptesProduits, jalons, concurrents, cyclesPoc] = await Promise.all([
    utilisateurCourant(),
    prisma.crmOrganisation.findUnique({
      where: { id },
      include: {
        responsable: { select: { name: true } }, chefDeProjet: { select: { name: true } },
        utilisateur: { select: { email: true } },
        // L'apport d'affaires (C-63) : le nom de l'apporteur suffit à la fiche.
        apport: { select: { apporteur: { select: { nom: true } } } },
        // Le barème de température (lot R) : l'auteur du forçage, lu avec la fiche.
        temperatureForceePar: { select: { name: true } },
        vagues: { orderBy: { numero: "asc" } },
        evenements: { where: { type: "DATE_PROMISE_CHANGEE" }, select: { centreProduitId: true, avant: true, apres: true }, orderBy: [{ surveneuLe: "asc" }, { id: "asc" }] },
        contacts: { orderBy: [{ principal: "desc" }, { nom: "asc" }] },
        centres: {
          include: {
            rattachements: { include: { product: true, userProduct: { select: { user: { select: { email: true } } } } } },
            etapesIntegration: true,
            // Le barème de température compte les salles saisies dans les centres : un décompte, jamais une requête par centre.
            _count: { select: { salles: true } },
            // Les salles du centre, clé de facturation (C-90) : montrées et gérées dans l'onglet Centres.
            salles: { select: { id: true, libelle: true, modalite: true }, orderBy: [{ ordre: "asc" }, { id: "asc" }] },
          },
          orderBy: { nom: "asc" },
        },
        contrats: { include: { lignes: true } },
        propositions: { orderBy: { version: "desc" }, include: { lignes: { orderBy: { id: "asc" } }, contrat: { select: { id: true } } } },
        opportunites: true,
        echanges: { where: { statut: "REALISE", type: { not: "JALON" } }, orderBy: [{ surveneuLe: "desc" }, { id: "desc" }], take: 1,
          select: { type: true, surveneuLe: true, compteRendu: true } },
      },
    }),
    chronologie(id), comptesInternes(), comptesDashboard(), produits(), userProductsLibres(),
    prisma.crmEchange.findMany({ where: { organisationId: id, type: "JALON" }, orderBy: [{ surveneuLe: "asc" }, { id: "asc" }],
      select: { id: true, statut: true, surveneuLe: true, compteRendu: true, aLaChargeDe: true } }),
    // Les concurrents proposés par les sélecteurs de la fiche, lus une fois.
    optionsConcurrents(),
    // Une lecture fixe, même sans cycle : état du courant et dernier précédent clos.
    prisma.$queryRaw<LectureCyclePoc[]>`SELECT
      EXISTS(SELECT 1 FROM "CrmCyclePoc" courant WHERE courant.id = o."pocCycleId") AS clos,
      h."debuteLe", h."prolongeLe", h.issue
      FROM "CrmOrganisation" o
      LEFT JOIN LATERAL (
        SELECT c."debuteLe", c."prolongeLe", c.issue FROM "CrmCyclePoc" c
        WHERE c."organisationId" = o.id AND c.id IS DISTINCT FROM o."pocCycleId"
        ORDER BY c."decideLe" DESC, c.id DESC LIMIT 1
      ) h ON true WHERE o.id = ${id}`,
  ]);
  const precedent = cyclesPoc[0];
  return { utilisateur, org, historique, comptes, clients, catalogue, comptesProduits, jalons, concurrents,
    pocCycleOuvert: !!org?.pocCycleId && precedent?.clos === false,
    pocPrecedent: precedent?.debuteLe && precedent.issue ? { debuteLe: precedent.debuteLe, prolongeLe: precedent.prolongeLe, issue: precedent.issue } : null };
}
