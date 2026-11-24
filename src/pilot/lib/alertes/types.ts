import type { CrmOrganisation, CrmEtapeIntegration, CrmContrat, CrmProposition, CrmDepartement } from "@prisma/client";
import type { EtatComplétude } from "@/pilot/lib/completude/adapter";

export const LIBELLES_TYPES_ALERTE = {
  "formation-a-facturer": "Facture de formation à émettre",
  "formation-prix-manquant": "Prix de formation à renseigner",
  "top-facturation-incoherent": "Top facturation incohérent",
  "formation-regularisation": "Formation à régulariser",
  "prospect-sans-contact": "Prospect sans contact", "etape-en-retard": "Étape en retard",
  "date-promise": "Mise en service promise en danger", "production-incomplete": "En service, mais incomplet",
  silence: "Centre en service sans appel", "action-en-retard": "Action en retard",
  "sans-prochaine-action": "Sans prochaine action", vieillissement: "Client bloqué à une étape", reveil: "Fin de pause",
  "decision-depassee": "Décision attendue", "attente-sans-relance": "Attente sans relance",
  regression: "Étape à reprendre", glissement: "Date promise reportée", renouvellement: "Renouvellement à préparer",
  "proposition-expiree": "Proposition expirée", "silence-renforce": "Aucun appel depuis la mise en service",
  "fin-poc": "Fin du POC à décider",
  "contrat-a-saisir": "Contrat à saisir",
} as const;
export type TypeAlerte = keyof typeof LIBELLES_TYPES_ALERTE;
export type NiveauAlerte = "bloquant" | "attention";
export type FamilleAlerte = "commerciale" | "integration";
export const FAMILLES_ALERTES: Record<TypeAlerte, FamilleAlerte> = {
  "formation-a-facturer": "commerciale", "formation-prix-manquant": "commerciale",
  "top-facturation-incoherent": "commerciale", "formation-regularisation": "commerciale",
  "prospect-sans-contact": "commerciale", "etape-en-retard": "integration", "date-promise": "integration",
  "production-incomplete": "integration", silence: "integration", "action-en-retard": "commerciale",
  "sans-prochaine-action": "commerciale", vieillissement: "commerciale", reveil: "commerciale",
  "decision-depassee": "commerciale", "attente-sans-relance": "integration", regression: "integration",
  glissement: "integration", renouvellement: "commerciale", "proposition-expiree": "commerciale", "silence-renforce": "integration",
  "fin-poc": "commerciale",
  "contrat-a-saisir": "commerciale",
};
/** Un autre signal de la même cause, replié sous l'alerte qui l'affiche (C-91). */
export type SignalReplie = { cle: string; titre: string; detail: string };
/**
 * Qui doit agir (C-91) : la personne et son poste. `manuelle` : le directeur
 * général (ou le super-administrateur) l'a confiée ; sinon elle va d'office au
 * directeur général. `userId` null : personne à qui l'adresser.
 */
export type AttributionAlerte = { userId: number | null; nom: string; poste: string; manuelle: boolean; par: string | null };
export type Alerte = {
  cle: string; type: TypeAlerte; famille: FamilleAlerte; niveau: NiveauAlerte; titre: string; detail: string;
  organisationId: number; organisationNom: string; responsableId: number | null; chefDeProjetId: number | null;
  centreId?: number; lien: string;
  /** La cause commune (C-91) : « suivi-12 », « proposition-12 », « mise-en-service-34 », sinon la clé elle-même. */
  groupe: string;
  /** Les autres signaux du même groupe, repliés sous celui-ci. */
  aussi?: SignalReplie[];
  attribution?: AttributionAlerte;
};
// L'identifiant accompagne la décision humaine pour son bouton Réactiver.
export type AcquittementAlerte = { id: number; jusquAu: Date; raison: string; auteur: string | null };
export type AlerteAcquittee = Alerte & { acquittement: AcquittementAlerte };
export type ResultatAlertes = { actives: Alerte[]; acquittees: AlerteAcquittee[] };
export type OrganisationAlertes = Pick<CrmOrganisation, "id" | "raisonSocialeNom" | "etape" | "etapeDepuisLe" | "creeLe" |
  "prochaineActionLe" | "reveilLe" | "decisionAttendueLe" | "dernierEchangeLe" | "responsableId" | "chefDeProjetId"> & {
  /** Un contrat actif existe (C-92). Absent : on ne sait pas, aucune alerte « contrat à saisir ». */
  contratActif?: boolean;
  pocCycleId?: string | null; pocDebuteLe?: Date | null; pocProlongeLe?: Date | null;
};
export type EtapeAlertes = Pick<CrmEtapeIntegration, "id" | "centreId" | "productId" | "cle" | "mode" | "faite" | "creeLe" |
  "enAttenteDe" | "demandeeLe" | "derniereRelanceLe" | "echeanceLe">;
export type RattachementAlertes = {
  id: number; organisationId: number; centreId: number; centreNom: string; productId: number; produit: string;
  userProductId: number | null; datePromise: Date | null; datePromiseInitiale?: Date | null;
  miseEnProductionLe?: Date | null; suiviRenforceJusquAu?: Date | null; etat: Pick<EtatComplétude, "statutCentre" | "dernierAppelLe"> | null;
};
export type EvenementDatePromise = { centreProduitId: number | null; surveneuLe: Date; avant: unknown; apres: unknown };
export type RegressionAlertes = { etapeIntegrationId: number; surveneuLe: Date; avant: unknown };
/** Une alerte confiée à la main (C-91), lue avec le nom et le département de la personne. */
export type AttributionLue = { organisationId: number; cleGroupe: string; attribueeAId: number; nom: string | null;
  departement: CrmDepartement | null; par: string | null };
/** Qui reçoit les alertes d'office : le directeur général désigné, sinon le premier super-administrateur. */
export type DestinataireParDefaut = { id: number; nom: string | null; departement: CrmDepartement | null; designe: boolean };
export type FaitsFacturation = { organisationId: number; premierPocLe: Date | null; formationAbsente: boolean;
  prixARenseigner: boolean; factureEmiseLe: Date | null; regularisation: boolean; rattrapage: boolean; topFacturation: boolean; premierMoisPayantLe: Date | null };
export type DonneesAlertes = {
  /** Faits uniquement : aucun montant dans le circuit des alertes. */
  facturations?: FaitsFacturation[];
  propositions: Pick<CrmProposition, "id" | "organisationId" | "version" | "statut" | "valideJusquAu" | "repondueLe">[];
  organisations: OrganisationAlertes[]; rattachements: RattachementAlertes[]; etapes: EtapeAlertes[];
  datesPromises: EvenementDatePromise[]; regressions: RegressionAlertes[];
  contrats: Pick<CrmContrat, "id" | "organisationId" | "statut" | "renouvelleLe" | "signeLe" | "debuteLe" | "engagementMois" | "preavisMois" | "reference">[];
  acquittements: Array<AcquittementAlerte & { cleAlerte: string; organisationId: number }>;
  /** Facultatifs : sans eux, une alerte n'a personne à qui aller (« À attribuer »). */
  attributions?: AttributionLue[];
  parDefaut?: DestinataireParDefaut | null;
};
