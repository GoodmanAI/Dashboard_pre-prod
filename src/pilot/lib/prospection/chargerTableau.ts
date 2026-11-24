import type { CrmEtapeCommerciale, CrmStatutProposition, CrmTypeLigne, CrmUniteVariable } from "@prisma/client";
import { pondere } from "@/pilot/lib/argent";
import { montantDuDossier, type ContratPourMontant, type MontantAffiche, type PropositionPourMontant } from "@/pilot/lib/montants/montantAffiche";
import { prisma } from "@/pilot/lib/prisma";
import { estClient, probabiliteEffective } from "@/pilot/lib/pipeline";
import { nombreDeSites } from "@/pilot/lib/organisations/sites";
import { temperature } from "@/pilot/lib/organisations/temperature";
import { resumeTemperature, type ResumeTemperature } from "@/pilot/lib/organisations/temperatureAffichage";

/** Une carte du tableau Prospects : tout ce que la page montre, sérialisable. */
export type CartePipeline = {
  id: number;
  nom: string;
  type: string;
  etape: CrmEtapeCommerciale;
  responsable: string | null;
  /** Le nombre de sites (C-92) : le saisi, jamais sous le nombre de centres. Null si inconnu. */
  sites: number | null;
  produits: string[];
  /** Le montant mensuel et sa source (signé, proposition ou estimé), ou null (C-70). */
  montant: MontantAffiche | null;
  montantPondereCentimes: number;
  dernierEchangeLe: string | null;
  etapeDepuisLe: string;
  prochaineAction: string | null;
  prochaineActionLe: string | null;
  /** La température du dossier, calculée en mémoire ; null après la signature, perdu ou en pause (lot R). */
  temperature: ResumeTemperature | null;
  /**
   * Pour la carte (lot U), lus avec l'organisation sans requête de plus : le
   * commercial, le RIS de la fiche, le concurrent en place, le gagnant d'une
   * affaire perdue et la date de sortie (AAAA-MM-JJ). Aucun montant de plus.
   */
  responsableId: number | null;
  ris: string | null;
  concurrentId: number | null;
  concurrentGagnantId: number | null;
  dateSortie: string | null;
};

type LignePropositionLue = {
  organisationId: number; version: number; statut: CrmStatutProposition; remisePourMille: number;
  type: CrmTypeLigne | null; montantCentimes: number | null; unite: CrmUniteVariable | null; volumeInclus: number | null;
  /** Geste commercial (lot S) : net à 0 dans le montant affiché. */
  offerte: boolean | null;
};
/** Une ligne d'un contrat actif ou en brouillon, ou une ligne sans montant qui signale un contrat sans ligne. */
type LigneContratLue = { contratId: number; organisationId: number; statut: "ACTIF" | "BROUILLON"; type: CrmTypeLigne | null; montantCentimes: number | null };

/**
 * Le chargeur du tableau Prospects. Un nombre fixe de lectures, quel que soit
 * le nombre de cartes : les organisations et leurs opportunités ouvertes, puis
 * la dernière version envoyée de chaque proposition avec ses lignes, puis les
 * lignes des contrats actifs et la présence d'un brouillon, chacune en une
 * requête pour toutes les cartes (jamais une requête par carte, C-70). Le
 * montant de chaque carte vient de `montantAffiche`, la règle de l'en-tête de
 * la fiche.
 *
 * La dernière version se lit en SQL (DISTINCT ON) : un `take: 1` imbriqué dans
 * un `findMany` fait charger par Prisma toutes les versions de toutes les
 * organisations, puis les coupe en mémoire.
 *
 * La température (lot R) se calcule ici, avec le moteur pur, sur les contacts,
 * les centres et leurs salles lus pour toutes les cartes en même temps.
 *
 * Extrait de la page pour que `npm run mesurer` le compte.
 */
export async function chargerTableauProspects({ equipe, utilisateurId }: { equipe: boolean; utilisateurId: number }): Promise<CartePipeline[]> {
  const organisations = await prisma.crmOrganisation.findMany({
    where: equipe ? {} : { OR: [{ responsableId: utilisateurId }, { chefDeProjetId: utilisateurId }] },
    include: {
      responsable: { select: { id: true, name: true } },
      opportunites: {
        where: { gagneeLe: null, perdueLe: null },
        include: { product: { select: { name: true } } },
      },
      _count: { select: { centres: true } },
      // Le barème de température (lot R) : le rôle des contacts, et les RIS et les salles des centres.
      // Les salles et les équipements de la fiche viennent avec ses colonnes (`include` les lit toutes).
      // Une lecture par relation pour toutes les cartes, jamais une requête par carte.
      contacts: { select: { roleDecision: true } },
      centres: { select: { ris: true, _count: { select: { salles: true } } } },
    },
    orderBy: { majLe: "desc" },
  });
  if (!organisations.length) return [];
  const ids = organisations.map((o) => o.id);

  const [lignesPropositions, lignesContrats] = await Promise.all([
    // Par organisation, la dernière version qui n'est pas un brouillon et la dernière acceptée (souvent la même).
    // La première dit la négociation (C-70) ; les deux servent l'estimé d'un client sans contrat actif (C-92).
    prisma.$queryRaw<LignePropositionLue[]>`
      SELECT d."organisationId", d.version, d.statut::text AS statut, d."remisePourMille",
        l.type::text AS type, l."montantCentimes", l.unite::text AS unite, l."volumeInclus", l.offerte
      FROM (
        (SELECT DISTINCT ON ("organisationId") id, "organisationId", version, statut, "remisePourMille"
         FROM "CrmProposition"
         WHERE "organisationId" = ANY(${ids}::int[]) AND statut <> 'BROUILLON'
         ORDER BY "organisationId", version DESC)
        UNION
        (SELECT DISTINCT ON ("organisationId") id, "organisationId", version, statut, "remisePourMille"
         FROM "CrmProposition"
         WHERE "organisationId" = ANY(${ids}::int[]) AND statut = 'ACCEPTEE'
         ORDER BY "organisationId", version DESC)
      ) d
      LEFT JOIN "CrmLigneProposition" l ON l."propositionId" = d.id`,
    // Les lignes des contrats actifs et en brouillon ; un contrat sans ligne rend une ligne vide, qui dit qu'il existe (C-71).
    prisma.$queryRaw<LigneContratLue[]>`
      SELECT c.id AS "contratId", c."organisationId", c.statut::text AS statut, l.type::text AS type, l."montantCentimes"
      FROM "CrmContrat" c LEFT JOIN "CrmLigneContrat" l ON l."contratId" = c.id
      WHERE c.statut IN ('ACTIF', 'BROUILLON') AND c."organisationId" = ANY(${ids}::int[])`,
  ]);

  // Une ou deux versions par organisation, chacune avec ses lignes.
  const propositions = new Map<number, Map<number, PropositionPourMontant>>();
  for (const l of lignesPropositions) {
    const versions = propositions.get(l.organisationId) ?? new Map<number, PropositionPourMontant>();
    propositions.set(l.organisationId, versions);
    let p = versions.get(l.version);
    if (!p) versions.set(l.version, p = { version: l.version, statut: l.statut, remisePourMille: l.remisePourMille, lignes: [] });
    if (l.type !== null && l.montantCentimes !== null) p.lignes.push({ type: l.type, montantCentimes: l.montantCentimes, unite: l.unite, volumeInclus: l.volumeInclus, offerte: l.offerte });
  }
  // Les contrats actifs et en brouillon de chaque organisation, avec leurs lignes : un contrat sans ligne y figure, vide.
  type ContratLu = { statut: "ACTIF" | "BROUILLON"; lignes: ContratPourMontant["lignes"][number][] };
  const contrats = new Map<number, Map<number, ContratLu>>();
  for (const l of lignesContrats) {
    const parContrat = contrats.get(l.organisationId) ?? new Map<number, ContratLu>();
    contrats.set(l.organisationId, parContrat);
    let c = parContrat.get(l.contratId);
    if (!c) parContrat.set(l.contratId, c = { statut: l.statut, lignes: [] });
    if (l.type !== null && l.montantCentimes !== null) c.lignes.push({ type: l.type, montantCentimes: l.montantCentimes });
  }

  const maintenant = new Date();
  return organisations.map((o) => {
    return {
      id: o.id,
      nom: o.raisonSocialeNom,
      type: o.type,
      etape: o.etape,
      responsable: o.responsable?.name ?? null,
      sites: nombreDeSites(o.nombreSites, o._count.centres),
      produits: Array.from(new Set(o.opportunites.map((x) => x.product.name))),
      montant: montantDuDossier({ client: estClient(o.etape), contrats: [...(contrats.get(o.id)?.values() ?? [])],
        propositions: [...(propositions.get(o.id)?.values() ?? [])], opportunites: o.opportunites }),
      montantPondereCentimes: o.opportunites.reduce((total, opp) => total + pondere(opp.montantMensuelCentimes, probabiliteEffective(opp, o.etape)), 0),
      dernierEchangeLe: o.dernierEchangeLe?.toISOString() ?? null,
      etapeDepuisLe: o.etapeDepuisLe.toISOString(),
      prochaineAction: o.prochaineAction,
      prochaineActionLe: o.prochaineActionLe?.toISOString() ?? null,
      temperature: resumeTemperature(temperature({ ...o, centres: o.centres.map((c) => ({ ris: c.ris, salles: c._count.salles })) }, maintenant)),
      responsableId: o.responsableId,
      ris: o.ris,
      concurrentId: o.concurrentId,
      concurrentGagnantId: o.concurrentGagnantId,
      dateSortie: o.dateSortie?.toISOString().slice(0, 10) ?? null,
    };
  });
}
