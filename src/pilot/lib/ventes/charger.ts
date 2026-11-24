import type { CrmCleEtape, CrmEtapeCommerciale, CrmReconduction, CrmStatutContrat } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";
import { echeancesContrat } from "@/pilot/lib/contrats/regles";
import { debutDuJour } from "@/pilot/lib/dates";
import { resumeGestesVente } from "@/pilot/lib/propositions/affichage";
import { dateCle, decrireTarif, essaiContrat, manquesVente, produitsDuClient, type DateCle, type Essai, type EtatProduit, type LigneVente } from "./regles";

/** Signé, en mise en service, en service : les clients en cours. Contrat terminé : l'onglet Terminés. */
export const ETAPES_VENDUES: CrmEtapeCommerciale[] = ["SIGNE", "EN_INTEGRATION", "EN_PRODUCTION"];
const ETAPES_LUES: CrmEtapeCommerciale[] = [...ETAPES_VENDUES, "ARRETE"];

/** Les cases de la check-list qui datent une formation ou un interfaçage faits sans réunion au journal. */
const CASES_FORMATION: CrmCleEtape[] = ["FORMATION_DASHBOARD", "FORMATION_SECRETAIRES"];
const CASES_INTERFACAGE: CrmCleEtape[] = ["INTERFACAGE_TELEPHONIQUE"];

export type Segment = "en_cours" | "a_completer" | "termines";

const iso = (d: Date | null) => d?.toISOString() ?? null;
type Iso = string | null;
export type DateCleVue = { etat: DateCle["etat"]; le: Iso; source: DateCle["source"] };
export type ContratVue = {
  id: number; reference: string | null; statut: CrmStatutContrat;
  signeLe: Iso; debuteLe: Iso; renouvelleLe: Iso; termineLe: Iso; essaiDebuteLe: Iso;
  engagementMois: number | null; preavisMois: number | null; essaiJours: number | null;
  reconduction: CrmReconduction | null; conditionsTarifaires: string | null;
  essai: { etat: Essai["etat"]; jours: number | null; debut: Iso; fin: Iso; joursRestants: number | null } | null;
  finEngagement: Iso; limitePreavis: Iso; preavisDepasse: boolean; prochaineEcheance: Iso;
  tarifs: { id: number; libelle: string; montant: string; portee: string }[];
  /** « Gestes commerciaux : installation offerte, … », null s'il n'y en a aucun (lot S). */
  gestes: string | null;
};
export type ProduitVue = {
  productId: number; nom: string; centres: number; centresEnService: number;
  depuisLe: Iso; prevuLe: Iso; mensuelCentimes: number; etat: EtatProduit;
};
export type VenteVue = {
  id: number; nom: string; etape: CrmEtapeCommerciale; commercial: string | null; chefDeProjet: string | null;
  contacts: { id: number; nom: string }[];
  formation: DateCleVue; interfacage: DateCleVue;
  contrats: ContratVue[]; produits: ProduitVue[]; manques: string[]; mensuelCentimes: number;
};

/**
 * Les clients vendus, prêts à afficher, en une requête Prisma : un nombre fixe
 * de lectures (une par relation), quel que soit le nombre de clients. Les dates
 * sont calculées ici, côté serveur, à une seule horloge : le navigateur ne fait
 * que les afficher, sans risque de décalage à minuit.
 */
export async function chargerVentes({ utilisateurId, equipe, maintenant = new Date() }: { utilisateurId: number; equipe: boolean; maintenant?: Date }) {
  const organisations = await prisma.crmOrganisation.findMany({
    where: { etape: { in: ETAPES_LUES }, ...(equipe ? {} : { OR: [{ responsableId: utilisateurId }, { chefDeProjetId: utilisateurId }] }) },
    select: {
      id: true, raisonSocialeNom: true, etape: true,
      responsable: { select: { name: true } }, chefDeProjet: { select: { name: true } },
      contacts: { select: { id: true, nom: true }, orderBy: [{ principal: "desc" }, { nom: "asc" }] },
      contrats: {
        orderBy: [{ debuteLe: "asc" }, { id: "asc" }],
        include: { lignes: { orderBy: { id: "asc" }, include: { product: { select: { name: true } }, centre: { select: { nom: true } } } } },
      },
      centres: { select: {
        rattachements: { select: { productId: true, product: { select: { name: true } }, miseEnProductionLe: true, datePromise: true } },
        etapesIntegration: { where: { faite: true, cle: { in: [...CASES_FORMATION, ...CASES_INTERFACAGE] } }, select: { cle: true, faiteLe: true } },
      } },
      echanges: { where: { type: { in: ["FORMATION", "INTERFACAGE"] }, statut: { in: ["PLANIFIE", "REALISE"] } }, select: { type: true, statut: true, surveneuLe: true } },
    },
  });

  const ventes: VenteVue[] = organisations.map((o) => {
    // Un client en cours se lit sur ses contrats actifs ; à défaut, sur son brouillon le plus récent.
    // Un contrat terminé ne se lit que chez un client dont le contrat est terminé.
    const actifs = o.contrats.filter((c) => c.statut === "ACTIF");
    const brouillon = o.contrats.filter((c) => c.statut === "BROUILLON").at(-1);
    const retenus = o.etape === "ARRETE" ? o.contrats.filter((c) => c.statut === "TERMINE") : actifs.length ? actifs : brouillon ? [brouillon] : [];
    const etapes = o.centres.flatMap((c) => c.etapesIntegration);
    const cochees = (cles: CrmCleEtape[]) => etapes.filter((e) => cles.includes(e.cle) && e.faiteLe).map((e) => e.faiteLe!);
    const vue = (d: DateCle): DateCleVue => ({ ...d, le: iso(d.le) });
    const lignes: LigneVente[] = retenus.flatMap((c) => c.lignes.map((l) => ({ productId: l.productId, produit: l.product?.name ?? l.libelle ?? "", centre: l.centre?.nom ?? null,
      type: l.type, montantCentimes: l.montantCentimes, unite: l.unite, volumeInclus: l.volumeInclus, libelle: l.libelle, offerte: l.offerte })));
    const rattachements = o.centres.flatMap((c) => c.rattachements.map((r) => ({ productId: r.productId, produit: r.product.name, miseEnProductionLe: r.miseEnProductionLe, datePromise: r.datePromise })));

    return {
      id: o.id, nom: o.raisonSocialeNom, etape: o.etape, commercial: o.responsable?.name ?? null, chefDeProjet: o.chefDeProjet?.name ?? null,
      contacts: o.contacts,
      formation: vue(dateCle(o.echanges.filter((e) => e.type === "FORMATION"), cochees(CASES_FORMATION), maintenant)),
      interfacage: vue(dateCle(o.echanges.filter((e) => e.type === "INTERFACAGE"), cochees(CASES_INTERFACAGE), maintenant)),
      contrats: retenus.map((c) => {
        const essai = essaiContrat(c, maintenant);
        const { finEngagement, limitePreavis, prochaineEcheance } = echeancesContrat(c, maintenant);
        // Le préavis ne se dit que tant que la fin d'engagement est devant : après, la date ne décide plus rien.
        const finAVenir = !!finEngagement && finEngagement >= debutDuJour(maintenant);
        return {
          id: c.id, reference: c.reference, statut: c.statut,
          signeLe: iso(c.signeLe), debuteLe: iso(c.debuteLe), renouvelleLe: iso(c.renouvelleLe), termineLe: iso(c.termineLe), essaiDebuteLe: iso(c.essaiDebuteLe),
          engagementMois: c.engagementMois, preavisMois: c.preavisMois, essaiJours: c.essaiJours,
          reconduction: c.reconduction, conditionsTarifaires: c.conditionsTarifaires,
          essai: essai && { etat: essai.etat, jours: essai.jours, debut: iso(essai.debut), fin: iso(essai.fin), joursRestants: essai.joursRestants },
          finEngagement: iso(finEngagement), limitePreavis: iso(finAVenir ? limitePreavis : null), prochaineEcheance: iso(prochaineEcheance),
          preavisDepasse: finAVenir && !!limitePreavis && limitePreavis < debutDuJour(maintenant),
          gestes: resumeGestesVente(c.lignes),
          tarifs: c.lignes.map((l) => ({ id: l.id, ...decrireTarif(l), portee: [l.product?.name, l.centre?.nom].filter(Boolean).join(", ") || "Toute l'organisation" })),
        };
      }),
      produits: produitsDuClient(rattachements, lignes).map((p) => ({ ...p, depuisLe: iso(p.depuisLe), prevuLe: iso(p.prevuLe) })),
      manques: o.etape === "ARRETE" ? [] : manquesVente(retenus),
      mensuelCentimes: o.etape === "ARRETE" ? 0 : actifs.flatMap((c) => c.lignes).filter((l) => l.type === "ABONNEMENT").reduce((t, l) => t + l.montantCentimes, 0),
    };
  }).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  const enCours = ventes.filter((v) => v.etape !== "ARRETE");
  const segments: Record<Segment, VenteVue[]> = {
    en_cours: enCours,
    a_completer: enCours.filter((v) => v.manques.length > 0),
    termines: ventes.filter((v) => v.etape === "ARRETE"),
  };
  return { segments, mensuelCentimes: enCours.reduce((t, v) => t + v.mensuelCentimes, 0) };
}
