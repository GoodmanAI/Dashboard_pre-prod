import type { CrmStatutContrat } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutLirePilot } from "@/pilot/lib/autorisations";
import { evaluerPlusieurs } from "@/pilot/lib/completude/adapter";
import { PRODUIT_DESK, PRODUIT_NOSHOW } from "@/pilot/lib/checklist/definition";
import { renouvellementContrat } from "@/pilot/lib/contrats/regles";
import { enSuiviRenforce } from "@/pilot/lib/integration/suiviRenforce";
import { adoptionDesk } from "./desk";
import { production, resumeParc, santeCentre, trierParGravite } from "./sante";
import { ticketsOuverts } from "./tickets";
import { usageParSemaine } from "./usage";

export type FiltresParc = { vue?: string };
type Rattachement = {
  id: number; centreId: number; centreNom: string; productId: number; produit: string; userProductId: number | null;
  miseEnProductionLe: Date | null; suiviRenforceJusquAu: Date | null; productionDeclaree: boolean;
  organisationId: number; organisationNom: string; volumeAppelsEstime: number | null; utilisateurId: number | null;
};
type Contrat = {
  id: number; organisationId: number; organisationNom: string; reference: string | null; statut: CrmStatutContrat;
  signeLe: Date | null; debuteLe: Date | null; engagementMois: number | null; preavisMois: number | null; renouvelleLe: Date | null;
};

/**
 * Chargeur de l'écran Parc, également appelé par la mesure. Lecture seule.
 * Session, puis rattachements (avec la case PASSAGE_PRODUCTION) et contrats
 * actifs en parallèle, puis les trois lectures de l'adaptateur de complétude
 * et l'usage par semaine en parallèle : 7 requêtes quel que soit le parc, 3
 * quand aucun rattachement visible n'a d'accès Dashboard. Les tickets et Desk
 * ne lisent rien tant qu'ils ne sont pas branchés.
 *
 * « À moi » : les organisations dont l'utilisateur est le commercial ou le chef
 * de projet. `?vue=equipe` montre tout le parc.
 */
export async function chargerParc(filtres: FiltresParc = {}) {
  const utilisateur = await utilisateurCourant();
  exiger(peutLirePilot(utilisateur.role));
  const equipe = filtres.vue === "equipe";
  const moi = equipe ? null : utilisateur.id;
  const maintenant = new Date();
  const [rattachements, contrats] = await Promise.all([
    prisma.$queryRaw<Rattachement[]>`SELECT r.id, r."centreId", c.nom AS "centreNom", r."productId", p.name AS produit, r."userProductId",
      r."miseEnProductionLe", r."suiviRenforceJusquAu", o.id AS "organisationId", o."raisonSocialeNom" AS "organisationNom",
      o."volumeAppelsEstime", o."utilisateurId",
      EXISTS(SELECT 1 FROM "CrmEtapeIntegration" e WHERE e."centreId" = r."centreId" AND e."productId" = r."productId"
        AND e.cle = 'PASSAGE_PRODUCTION' AND e.faite) AS "productionDeclaree"
      FROM "CrmCentreProduit" r JOIN "CrmCentre" c ON c.id = r."centreId"
      JOIN "CrmOrganisation" o ON o.id = c."organisationId" JOIN "Product" p ON p.id = r."productId"
      WHERE (${moi}::integer IS NULL OR o."responsableId" = ${moi} OR o."chefDeProjetId" = ${moi})
      ORDER BY r.id`,
    prisma.$queryRaw<Contrat[]>`SELECT k.id, k."organisationId", o."raisonSocialeNom" AS "organisationNom", k.reference, k.statut,
      k."signeLe", k."debuteLe", k."engagementMois", k."preavisMois", k."renouvelleLe"
      FROM "CrmContrat" k JOIN "CrmOrganisation" o ON o.id = k."organisationId"
      WHERE k.statut = 'ACTIF' AND (k."renouvelleLe" IS NOT NULL OR k."engagementMois" IS NOT NULL)
        AND (${moi}::integer IS NULL OR o."responsableId" = ${moi} OR o."chefDeProjetId" = ${moi})
      ORDER BY k.id`,
  ]);

  const acces = rattachements.flatMap((r) => (r.userProductId === null ? [] : [r.userProductId]));
  const comptes = [...new Set(rattachements.flatMap((r) => (r.utilisateurId === null ? [] : [r.utilisateurId])))];
  const [etats, usages, tickets, desk] = await Promise.all([
    evaluerPlusieurs(acces), usageParSemaine({ userProductIds: acces, maintenant }), ticketsOuverts(comptes), adoptionDesk(acces),
  ]);

  const enProduction = rattachements.flatMap((r) => {
    const p = production({ declaree: r.productionDeclaree, statutCentre: r.userProductId === null ? null : etats.get(r.userProductId)?.statutCentre ?? null });
    return p.enProduction ? [{ ...r, mention: p.mention }] : [];
  });
  const parOrganisation = new Map<number, number>();
  for (const r of enProduction) parOrganisation.set(r.organisationId, (parOrganisation.get(r.organisationId) ?? 0) + 1);
  const avecDesk = new Set(rattachements.filter((r) => r.produit === PRODUIT_DESK).map((r) => r.organisationId));
  const deskDuCentre = new Map(rattachements.filter((r) => r.produit === PRODUIT_DESK).map((r) => [r.centreId, r.userProductId]));
  const vide = { semaines: [0, 0, 0, 0] as [number, number, number, number], rdv: 0, appels: 0 };

  const lignes = trierParGravite(enProduction.map((r) => {
    // L'adoption se lit sur l'accès Desk du centre, s'il en a un.
    const accesDesk = deskDuCentre.get(r.centreId) ?? null;
    const sante = santeCentre({
      volumeAnnonceParJour: r.volumeAppelsEstime, centresEnProduction: parOrganisation.get(r.organisationId) ?? 1,
      usage: (r.userProductId === null ? undefined : usages.get(r.userProductId)) ?? vide,
      dernierAppelLe: (r.userProductId === null ? undefined : etats.get(r.userProductId)?.dernierAppelLe) ?? null,
      ticketsOuverts: tickets && r.utilisateurId !== null ? tickets.get(r.utilisateurId) ?? 0 : null,
      compteDashboard: tickets === null || r.utilisateurId !== null,
      deskPart: desk && accesDesk !== null ? desk.get(accesDesk) ?? null : null,
      maintenant,
      passeDesAppels: r.produit !== PRODUIT_NOSHOW,
    });
    return {
      id: r.id, organisationId: r.organisationId, organisationNom: r.organisationNom, centreNom: r.centreNom, produit: r.produit,
      mention: r.mention, sante, afficherDesk: r.produit === PRODUIT_DESK || avecDesk.has(r.organisationId),
      suiviRenforceJusquAu: r.suiviRenforceJusquAu && enSuiviRenforce(r.suiviRenforceJusquAu, maintenant) ? r.suiviRenforceJusquAu.toISOString() : null,
      lienFiche: `/pilot/organisations/${r.organisationId}?onglet=centres`,
      lienChecklist: `/pilot/integrations?organisationId=${r.organisationId}&centreProduitId=${r.id}`,
    };
  }));

  const renouvellements = contrats.flatMap((c) => {
    const r = renouvellementContrat(c, maintenant);
    return r ? [{ tri: r.dateFait.getTime(), ligne: { id: c.id, organisationId: c.organisationId, organisationNom: c.organisationNom, reference: c.reference,
      echeance: r.echeance.toISOString(), detail: r.detail, lien: `/pilot/organisations/${c.organisationId}?onglet=argent` } }] : [];
  }).sort((a, b) => a.tri - b.tri || a.ligne.organisationNom.localeCompare(b.ligne.organisationNom, "fr") || a.ligne.id - b.ligne.id).map((r) => r.ligne);

  return { equipe, resume: resumeParc(lignes), lignes, renouvellements };
}
export type DonneesParc = Awaited<ReturnType<typeof chargerParc>>;
export type LigneParc = DonneesParc["lignes"][number];
