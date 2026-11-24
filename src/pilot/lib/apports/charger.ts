import type { Prisma } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";
import type { Contexte, FactureCalcul, FactureFigee, GroupeCalcul, Jour, Mois, SiteCalcul } from "./calcul";
import { PARAMETRES_DEFAUT } from "./referentiel";
import { lireGrilleEnVigueur } from "@/pilot/lib/tarifs/grille";
import { prixDepuisGrille, type PrixApport, type PrixManquant } from "./prix";

/**
 * Tout ce que l'écran Apport d'affaires affiche, chargé en une passe et rendu
 * sérialisable : le calcul se rejoue ensuite côté client, sans requête, comme
 * dans le calculateur d'origine (CHOIX.md, C-63).
 */

export type ParametresApport = typeof PARAMETRES_DEFAUT;
export type ApporteurDonnees = {
  id: number; nom: string; structure: string | null; telephone: string | null; email: string | null; adresse: string | null;
  siret: string | null; rcs: string | null; tvaIntracom: string | null; prefixeFacture: string | null; mention: string | null;
  commissionne: boolean; ordre: number; groupes: number; factures: number;
};
export type SalleDonnees = { id: number; libelle: string; modalite: string };
export type SiteDonnees = Omit<SiteCalcul, "salles"> & { adresse: string | null; ville: string | null; ris: string | null; salles: SalleDonnees[]; lie: boolean };
export type PrestataireDonnees = { id: number; type: string | null; societe: string | null; nom: string | null; telephone: string | null; email: string | null; commentaire: string | null };
export type ContactDonnees = { id: number; nom: string; fonction: string | null; telephone: string | null; email: string | null };
export type GroupeDonnees = Omit<GroupeCalcul, "sites"> & {
  apportId: number; etape: string; denominationSociale: string | null; siren: string | null; adresseSiege: string | null;
  categorie: string | null; investisseur: string | null; precisionCategorie: string | null; origine: string | null; besoin: string | null;
  ris: string | null; risCodeClient: string | null; risCodesSites: string | null; risCommercial: string | null;
  risCommercialTelephone: string | null; risCommercialEmail: string | null; perimetre: string; observations: string | null;
  notes: string | null; contacts: ContactDonnees[]; prestataires: PrestataireDonnees[]; sites: SiteDonnees[];
};
export type FactureDonnees = FactureCalcul & { id: number };
/**
 * La grille tarifaire dont l'apport a tiré ses prix (lot S). id null : aucune
 * grille en vigueur. `absents` : les manquants dont le tarif n'est pas dans la grille.
 */
export type GrilleApport = { id: number | null; applicableLe: string | null; manquants: PrixManquant[]; absents?: PrixManquant[] };
export type DonneesApports = {
  parametres: ParametresApport; prix: PrixApport; grille: GrilleApport; apporteurs: ApporteurDonnees[]; groupes: GroupeDonnees[]; factures: FactureDonnees[];
  clientsSansApport: { id: number; nom: string }[]; aujourdhui: Jour; moisCourant: Mois;
};

export const jour = (d: Date | null | undefined): Jour | null => d ? d.toISOString().slice(0, 10) : null;
export const moisIso = (d: Date): Mois => d.toISOString().slice(0, 7);
export const dateDuMois = (m: Mois) => new Date(`${m}-01T00:00:00Z`);

/**
 * Les réglages de l'apport, sans les prix. Les anciennes colonnes de la grille
 * (prix TTC, connecteur RIS, installations, mode d'installation) restent en
 * base mais ne sont plus lues : les prix viennent de la grille tarifaire (lot S).
 */
export async function chargerParametres(client: Prisma.TransactionClient | typeof prisma = prisma): Promise<ParametresApport> {
  const ligne = await client.crmParametresApport.findUnique({ where: { id: 1 } });
  if (!ligne) return { ...PARAMETRES_DEFAUT };
  const { id, majLe, talkTtcCentimes, konnectTtcCentimes, connecteurRisPdm, installationTalkCentimes, installationKonnectCentimes, modeInstallation, ...p } = ligne;
  void id; void majLe; void talkTtcCentimes; void konnectTtcCentimes; void connecteurRisPdm; void installationTalkCentimes; void installationKonnectCentimes; void modeInstallation;
  return { ...p, typesPrestataires: p.typesPrestataires.length ? p.typesPrestataires : PARAMETRES_DEFAUT.typesPrestataires };
}

const inclureGroupe = {
  organisation: {
    select: {
      id: true, raisonSocialeNom: true, etape: true, origine: true, ris: true, notes: true, creeLe: true,
      contacts: { select: { id: true, nom: true, fonction: true, telephone: true, email: true }, orderBy: [{ principal: "desc" }, { id: "asc" }] },
      prestataires: { orderBy: [{ ordre: "asc" }, { id: "asc" }] },
      centres: {
        orderBy: { id: "asc" },
        include: {
          salles: { orderBy: [{ ordre: "asc" }, { id: "asc" }] },
          _count: { select: { rattachements: true, lignesContrat: true, lignesProposition: true, etapesIntegration: true } },
        },
      },
    },
  },
} satisfies Prisma.CrmApportInclude;
type ApportCharge = Prisma.CrmApportGetPayload<{ include: typeof inclureGroupe }>;

export function versGroupe(a: ApportCharge): GroupeDonnees {
  const o = a.organisation;
  return {
    id: o.id, apportId: a.id, nom: o.raisonSocialeNom, creeLe: o.creeLe.toISOString(), etape: o.etape,
    apporteurId: a.apporteurId, coApporteurId: a.coApporteurId, coApporteurPart: a.coApporteurPart,
    offreTalk: a.offreTalk, offreKonnect: a.offreKonnect, offreConnecteurRis: a.offreConnecteurRis,
    bcEnvoyeLe: jour(a.bcEnvoyeLe), commandeValideeLe: jour(a.commandeValideeLe), commandeInstalleeLe: jour(a.commandeInstalleeLe),
    deploiementPrevuLe: jour(a.deploiementPrevuLe), decision: a.decision, decisionLe: jour(a.decisionLe), signaleLe: jour(a.signaleLe),
    denominationSociale: a.denominationSociale, siren: a.siren, adresseSiege: a.adresseSiege, categorie: a.categorie,
    investisseur: a.investisseur, precisionCategorie: a.precisionCategorie, origine: o.origine, besoin: a.besoin, ris: o.ris,
    risCodeClient: a.risCodeClient, risCodesSites: a.risCodesSites, risCommercial: a.risCommercial,
    risCommercialTelephone: a.risCommercialTelephone, risCommercialEmail: a.risCommercialEmail,
    perimetre: a.perimetre, observations: a.observations, notes: o.notes,
    contacts: o.contacts, prestataires: o.prestataires.map(({ id, type, societe, nom, telephone, email, commentaire }) => ({ id, type, societe, nom, telephone, email, commentaire })),
    sites: o.centres.map((c) => ({
      id: c.id, nom: c.nom, adresse: c.adresse, ville: c.ville, ris: c.ris,
      offreTalk: c.offreTalk, offreKonnect: c.offreKonnect, offreConnecteurRis: c.offreConnecteurRis,
      salles: c.salles.map(({ id, libelle, modalite }) => ({ id, libelle, modalite })),
      // Un site déjà suivi ailleurs dans Pilot (produit, contrat, devis, check-list) ne se supprime pas d'ici.
      lie: c._count.rattachements + c._count.lignesContrat + c._count.lignesProposition + c._count.etapesIntegration > 0,
    })),
  };
}

export function versFacture(f: { id: number; apporteurId: number; mois: Date; statut: string; numero: string | null; emiseLe: Date | null;
  echeanceLe: Date | null; payeeLe: Date | null; encaissements: Prisma.JsonValue; fige: Prisma.JsonValue }): FactureDonnees {
  const encaissements: Record<string, number> = {};
  if (f.encaissements && typeof f.encaissements === "object" && !Array.isArray(f.encaissements)) {
    for (const [cle, valeur] of Object.entries(f.encaissements)) if (typeof valeur === "number" && Number.isSafeInteger(valeur)) encaissements[cle] = valeur;
  }
  return { id: f.id, apporteurId: f.apporteurId, mois: moisIso(f.mois), statut: f.statut as FactureCalcul["statut"], numero: f.numero,
    emiseLe: jour(f.emiseLe), echeanceLe: jour(f.echeanceLe), payeeLe: jour(f.payeeLe), encaissements,
    fige: (f.fige as unknown as FactureFigee | null) ?? null };
}

export async function chargerApports(maintenant = new Date()): Promise<DonneesApports> {
  const [parametres, grille, apporteurs, apports, factures, clients] = await Promise.all([
    chargerParametres(),
    // La grille en vigueur au jour du calcul.
    lireGrilleEnVigueur(prisma, maintenant),
    prisma.crmApporteur.findMany({ orderBy: [{ ordre: "asc" }, { id: "asc" }],
      include: { _count: { select: { apports: true, coApports: true, factures: true } } } }),
    prisma.crmApport.findMany({ include: inclureGroupe }),
    prisma.crmFactureApport.findMany({ orderBy: [{ mois: "desc" }] }),
    prisma.crmOrganisation.findMany({ where: { apport: null }, select: { id: true, raisonSocialeNom: true }, orderBy: { raisonSocialeNom: "asc" } }),
  ]);
  const { prix, manquants, absents } = prixDepuisGrille(grille, parametres.tvaPdm);
  return {
    parametres, prix, grille: { id: grille.id, applicableLe: grille.applicableLe, manquants, absents },
    apporteurs: apporteurs.map(({ _count, creeLe, majLe, cleImport, ...a }) => { void creeLe; void majLe; void cleImport;
      return { ...a, groupes: _count.apports + _count.coApports, factures: _count.factures }; }),
    groupes: apports.map(versGroupe),
    factures: factures.map(versFacture),
    clientsSansApport: clients.map((c) => ({ id: c.id, nom: c.raisonSocialeNom })),
    aujourdhui: maintenant.toISOString().slice(0, 10),
    moisCourant: moisIso(maintenant),
  };
}

/** Le contexte du moteur depuis les données chargées. */
export function contexteDe(d: DonneesApports): Contexte {
  return { parametres: { ...d.parametres, prix: d.prix }, apporteurs: d.apporteurs, groupes: d.groupes, factures: d.factures, aujourdhui: d.aujourdhui, moisCourant: d.moisCourant };
}
