import { prisma } from "@/pilot/lib/prisma";
import { decalerMois } from "./projeter";
import { moyenneDesMoisFiges, variableParLigne } from "./reel";
import type { CrmEtapeCommerciale, CrmStatutProposition, CrmTypeLigne, CrmUniteVariable } from "@prisma/client";
import { estimeSansContrat, type PropositionPourMontant } from "@/pilot/lib/montants/montantAffiche";

type ClientSansContrat = { id: number; raisonSocialeNom: string; etape: CrmEtapeCommerciale; brouillonCentimes: number; opportunitesCentimes: number };
type LigneEstime = { organisationId: number; version: number; statut: CrmStatutProposition; remisePourMille: number;
  type: CrmTypeLigne | null; montantCentimes: number | null; unite: CrmUniteVariable | null; volumeInclus: number | null; offerte: boolean | null };

/**
 * Onze SELECT explicites, même sans données. Aucun contact ni champ de notes.
 * Le huitième lit les douze derniers mois figés : leur total pour la
 * comparaison au réel, et la part variable des trois derniers pour la projection.
 * Le neuvième et le dixième lisent les clients sans contrat actif et ce qui sert
 * à les estimer (C-92) : le brouillon et les opportunités en sommes, puis la
 * dernière proposition et la dernière acceptée avec leurs lignes. Onze lectures,
 * quel que soit le nombre de clients. La onzième lit les formations uniques des dossiers (C-95).
 * L'estimé reste à part : ni la projection, ni le réel figé, ni l'export ne le comptent.
 */
export async function chargerDonneesCa(maintenant = new Date()) {
  const ouvertes = { gagneeLe: null, perdueLe: null };
  const [contrats, lignes, opportunites, produits, organisations, scenarios, choix, figees, sansContrat, lignesEstime, formations] = await Promise.all([
    prisma.crmContrat.findMany({ where: { statut: { not: "BROUILLON" } }, select: {
      id: true, organisationId: true, statut: true, debuteLe: true, signeLe: true, termineLe: true,
    }, orderBy: { id: "asc" } }),
    prisma.crmLigneContrat.findMany({ where: { contrat: { statut: { not: "BROUILLON" } } }, select: {
      id: true, contratId: true, type: true, montantCentimes: true, productId: true, centreId: true,
    }, orderBy: { id: "asc" } }),
    prisma.crmOpportunite.findMany({ where: ouvertes, select: {
      id: true, organisationId: true, productId: true, libelle: true, montantMensuelCentimes: true,
      montantMiseEnServiceCentimes: true, probabilite: true, probabiliteForcee: true,
      categoriePrevision: true, demarrageAttenduLe: true, gagneeLe: true, perdueLe: true,
    }, orderBy: { id: "asc" } }),
    prisma.product.findMany({ where: { opportunites: { some: ouvertes } }, select: { id: true, name: true } }),
    prisma.crmOrganisation.findMany({ where: { opportunites: { some: ouvertes } }, select: { id: true, raisonSocialeNom: true, etape: true } }),
    prisma.crmScenario.findMany({ select: { id: true, nom: true, majLe: true }, orderBy: { nom: "asc" } }),
    prisma.crmScenarioOpportunite.findMany({ select: { scenarioId: true, opportuniteId: true, cochee: true, demarrageDecaleLe: true }, orderBy: { opportuniteId: "asc" } }),
    prisma.$queryRaw<Array<{ mois: Date; organisationId: number; productId: number | null; centreId: number | null; variableCentimes: number; totalCentimes: number }>>`
      SELECT mois, "organisationId", "productId", "centreId", "variableCentimes",
        ("recurrentCentimes" + "variableCentimes" + "miseEnServiceCentimes")::integer AS "totalCentimes"
      FROM "CrmCaMensuel" WHERE mois IN (SELECT DISTINCT mois FROM "CrmCaMensuel" ORDER BY mois DESC LIMIT 12)
      ORDER BY mois, id`,
    prisma.$queryRaw<ClientSansContrat[]>`
      SELECT o.id, o."raisonSocialeNom", o.etape,
        COALESCE((SELECT SUM(l."montantCentimes") FROM "CrmLigneContrat" l JOIN "CrmContrat" c ON c.id = l."contratId"
          WHERE c."organisationId" = o.id AND c.statut = 'BROUILLON' AND l.type = 'ABONNEMENT'), 0)::integer AS "brouillonCentimes",
        COALESCE((SELECT SUM(p."montantMensuelCentimes") FROM "CrmOpportunite" p
          WHERE p."organisationId" = o.id AND p."gagneeLe" IS NULL AND p."perdueLe" IS NULL), 0)::integer AS "opportunitesCentimes"
      FROM "CrmOrganisation" o
      WHERE o.etape IN ('SIGNE', 'EN_INTEGRATION', 'EN_PRODUCTION')
        AND NOT EXISTS (SELECT 1 FROM "CrmContrat" c WHERE c."organisationId" = o.id AND c.statut = 'ACTIF')`,
    prisma.$queryRaw<LigneEstime[]>`
      SELECT d."organisationId", d.version, d.statut::text AS statut, d."remisePourMille",
        l.type::text AS type, l."montantCentimes", l.unite::text AS unite, l."volumeInclus", l.offerte
      FROM (
        (SELECT DISTINCT ON (p."organisationId") p.id, p."organisationId", p.version, p.statut, p."remisePourMille"
         FROM "CrmProposition" p JOIN "CrmOrganisation" o ON o.id = p."organisationId"
         WHERE p.statut <> 'BROUILLON' AND o.etape IN ('SIGNE', 'EN_INTEGRATION', 'EN_PRODUCTION')
         ORDER BY p."organisationId", p.version DESC)
        UNION
        (SELECT DISTINCT ON (p."organisationId") p.id, p."organisationId", p.version, p.statut, p."remisePourMille"
         FROM "CrmProposition" p JOIN "CrmOrganisation" o ON o.id = p."organisationId"
         WHERE p.statut = 'ACCEPTEE' AND o.etape IN ('SIGNE', 'EN_INTEGRATION', 'EN_PRODUCTION')
         ORDER BY p."organisationId", p.version DESC)
      ) d
      LEFT JOIN "CrmLigneProposition" l ON l."propositionId" = d.id`,
    prisma.crmFormationPoc.findMany({ select: { debuteLe: true, montantCentimes: true }, orderBy: { organisationId: "asc" } }),
  ]);
  // Une ou deux versions par client, chacune avec ses lignes.
  const versions = new Map<number, Map<number, PropositionPourMontant>>();
  for (const l of lignesEstime) {
    const parVersion = versions.get(l.organisationId) ?? new Map<number, PropositionPourMontant>();
    versions.set(l.organisationId, parVersion);
    let p = parVersion.get(l.version);
    if (!p) parVersion.set(l.version, p = { version: l.version, statut: l.statut, remisePourMille: l.remisePourMille, lignes: [] });
    if (l.type !== null && l.montantCentimes !== null) p.lignes.push({ type: l.type, montantCentimes: l.montantCentimes, unite: l.unite, volumeInclus: l.volumeInclus, offerte: l.offerte });
  }
  const parContrat = new Map<number, typeof lignes>();
  for (const l of lignes) { const groupe = parContrat.get(l.contratId) ?? []; groupe.push(l); parContrat.set(l.contratId, groupe); }
  const parScenario = new Map<number, typeof choix>();
  for (const l of choix) { const groupe = parScenario.get(l.scenarioId) ?? []; groupe.push(l); parScenario.set(l.scenarioId, groupe); }
  const nomsProduits = new Map(produits.map((p) => [p.id, p.name]));
  const orgs = new Map(organisations.map((o) => [o.id, o]));
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  const moyenne = moyenneDesMoisFiges(figees);
  // Une ligne sans produit (lot S) a sa clé de réel, produit `0` : sa moyenne figée lui revient.
  const variable = variableParLigne(contrats.map((c) => ({ ...c, lignes: parContrat.get(c.id) ?? [] })), moyenne.parCle, decalerMois(maintenant, 0));
  const reel = new Map<string, number>();
  for (const f of figees) reel.set(f.mois.toISOString(), (reel.get(f.mois.toISOString()) ?? 0) + f.totalCentimes);
  return {
    formations: formations.map((f) => ({ ...f, debuteLe: f.debuteLe.toISOString() })),
    contrats: contrats.map(({ organisationId, ...c }) => { void organisationId; return { ...c, debuteLe: iso(c.debuteLe), signeLe: iso(c.signeLe), termineLe: iso(c.termineLe),
      lignes: (parContrat.get(c.id) ?? []).map(({ id, type, montantCentimes }) => ({ id, type, montantCentimes })) }; }),
    opportunites: opportunites.map((o) => ({ ...o, demarrageAttenduLe: iso(o.demarrageAttenduLe), gagneeLe: iso(o.gagneeLe), perdueLe: iso(o.perdueLe),
      produit: nomsProduits.get(o.productId)!, organisationNom: orgs.get(o.organisationId)!.raisonSocialeNom, etape: orgs.get(o.organisationId)!.etape })),
    scenarios: scenarios.map((s) => ({ ...s, majLe: s.majLe.toISOString(), opportunites: (parScenario.get(s.id) ?? [])
      .map(({ opportuniteId, cochee, demarrageDecaleLe }) => ({ opportuniteId, cochee, demarrageDecaleLe: iso(demarrageDecaleLe) })) })),
    variableMensuelleParLigne: [...variable] as Array<[number, number]>, variableDisponible: figees.length > 0,
    /** Nombre de mois figés derrière la moyenne de la part variable, de 0 à 3. */
    moisMoyenne: moyenne.mois.length,
    /** Les douze derniers mois figés au plus, du plus ancien au plus récent. */
    reel: [...reel].map(([mois, totalCentimes]) => ({ mois, totalCentimes })),
    /** Les clients sans contrat actif et leur estimé mensuel (C-92), le plus gros d'abord. */
    contratsASaisir: sansContrat.flatMap((o) => {
      const e = estimeSansContrat({ client: true,
        contrats: [{ statut: "BROUILLON", lignes: [{ type: "ABONNEMENT", montantCentimes: o.brouillonCentimes }] }],
        propositions: [...(versions.get(o.id)?.values() ?? [])],
        opportunites: [{ montantMensuelCentimes: o.opportunitesCentimes, gagneeLe: null, perdueLe: null }] });
      return e ? [{ organisationId: o.id, nom: o.raisonSocialeNom, etape: o.etape, centimes: e.centimes, origine: e.origine }] : [];
    }).sort((a, b) => b.centimes - a.centimes || a.nom.localeCompare(b.nom, "fr")),
  };
}
export type DonneesCa = Awaited<ReturnType<typeof chargerDonneesCa>>;
export type ScenarioCa = DonneesCa["scenarios"][number];
