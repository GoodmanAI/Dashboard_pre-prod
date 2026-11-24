import type { CrmAttitude, CrmEtapeCommerciale, CrmPriorite, CrmRaisonSortie, CrmRoleDecision, CrmTemperature, CrmTypeOrganisation } from "@prisma/client";
import { eurosCsv, texteCsv } from "@/pilot/lib/ca/export";
import { LIBELLES, LIBELLES_ATTITUDE, LIBELLES_RAISONS } from "@/pilot/lib/pipeline";
import { BLOCAGES_TECHNIQUES, ORIGINES, TYPES_ORGANISATION } from "@/pilot/lib/organisations/referentielClient";
import { LIBELLES_TEMPERATURE } from "@/pilot/lib/organisations/temperature";
import { PRIORITES } from "./regles";

/**
 * L'export des prospects : une ligne par dossier, au format de l'export
 * comptable (UTF-8 avec BOM, `;`, virgule décimale, CRLF, formules neutralisées).
 * Des fonctions pures : la lecture en base est dans `exporter.ts`.
 * Aucune donnée patient : organisations, contacts professionnels, sites, montants estimés.
 */

const LIBELLES_ROLE: Record<CrmRoleDecision, string> = {
  DECIDEUR: "Décideur", PRESCRIPTEUR: "Prescripteur", UTILISATEUR: "Utilisateur", TECHNIQUE: "Technique", INCONNU: "À préciser",
};

export type ContactExport = {
  nom: string; fonction: string | null; email: string | null; telephone: string | null;
  roleDecision: CrmRoleDecision; attitude: CrmAttitude; principal: boolean;
};
export type CentreExport = { nom: string; adresse: string | null; codePostal: string | null; ville: string | null; ris: string | null };

export type DossierExport = {
  id: number; nom: string; type: CrmTypeOrganisation; etape: CrmEtapeCommerciale; etapeDepuisLe: Date;
  priorite: CrmPriorite | null; temperature: CrmTemperature | null; temperatureForcee: boolean;
  responsable: string | null; chefDeProjet: string | null; origine: string | null; rattachementGht: string | null;
  telephone: string | null; email: string | null; siteWeb: string | null;
  ris: string | null; risVersion: string | null; outilRdv: string | null; solutionActuelle: string | null; concurrent: string | null;
  nombreSites: number | null; nombreSalles: number | null; nombreIrm: number | null; nombreScanners: number | null;
  nombreRadio: number | null; nombreEcho: number | null; nombreMammo: number | null; nombreSecretaires: number | null;
  volumeAppelsEstime: number | null; blocagesTechniques: string[];
  qualifBesoin: boolean; qualifDecideur: boolean; qualifBudget: boolean; qualifCalendrier: boolean; qualifSolutionActuelle: boolean;
  decisionAttendueLe: Date | null; dernierEchangeLe: Date | null; prochaineAction: string | null; prochaineActionLe: Date | null;
  /** Les produits des opportunités ouvertes, et leurs montants estimés additionnés, en centimes. */
  produits: string[]; mensuelEstimeCentimes: number; miseEnServiceEstimeeCentimes: number;
  raisonSortieCode: CrmRaisonSortie | null; raisonSortie: string | null; dateSortie: Date | null; concurrentGagnant: string | null; reveilLe: Date | null;
  notes: string | null; creeLe: Date;
  contacts: ContactExport[]; centres: CentreExport[];
};

export const EN_TETE_PROSPECTS = [
  "id", "nom", "type", "etape", "etape_depuis_le", "priorite", "temperature", "commercial", "chef_de_projet", "origine", "rattachement_ght",
  "telephone", "email", "site_web", "ris", "version_ris", "outil_rdv", "solution_actuelle", "concurrent_en_place",
  "nombre_sites", "nombre_salles", "irm", "scanners", "salles_radio", "echographes", "mammographes", "secretaires", "appels_par_jour", "blocages",
  "besoin_exprime", "decideur_identifie", "budget_evoque", "calendrier_connu", "solution_actuelle_connue",
  "decision_attendue_le", "dernier_echange_le", "prochaine_action", "prochaine_action_le",
  "produits_envisages", "mensuel_estime", "mise_en_service_estimee",
  "motif_sortie", "detail_sortie", "date_sortie", "concurrent_gagnant", "reveil_le",
  "contact_principal", "contact_principal_fonction", "contact_principal_email", "contact_principal_telephone", "autres_contacts",
  "sites", "notes", "cree_le",
];

/** AAAA-MM-JJ, en UTC comme les autres dates de Pilot ; vide sans date. */
export const jourCsv = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const nombreCsv = (n: number | null) => (n === null ? "" : String(n));
const ouiNon = (b: boolean) => (b ? "oui" : "non");
const libelle = <T extends string>(liste: Record<string, string>, cle: T | null) => (cle === null ? null : liste[cle] ?? cle);
const joindre = (morceaux: (string | null)[], separateur = ", ") => morceaux.filter((m): m is string => !!m).join(separateur);

/** Le contact marqué principal, sinon le premier. */
export function contactPrincipal(contacts: ContactExport[]): ContactExport | null {
  return contacts.find((c) => c.principal) ?? contacts[0] ?? null;
}
/** « Nom (fonction, rôle, attitude) email tél » pour chaque contact, séparés par « | ». */
export function resumeContacts(contacts: ContactExport[]): string {
  return contacts.map((c) => {
    const qualite = joindre([c.fonction, LIBELLES_ROLE[c.roleDecision], LIBELLES_ATTITUDE[c.attitude]]);
    return joindre([c.nom, qualite && `(${qualite})`, c.email, c.telephone], " ");
  }).join(" | ");
}
/** « Nom : adresse, 75001 Paris, RIS » pour chaque site, séparés par « | ». */
export function resumeCentres(centres: CentreExport[]): string {
  return centres.map((c) => {
    const lieu = joindre([c.adresse, joindre([c.codePostal, c.ville], " ") || null, c.ris && `RIS ${c.ris}`]);
    return lieu ? `${c.nom} : ${lieu}` : c.nom;
  }).join(" | ");
}

export function ligneProspect(d: DossierExport): string {
  const principal = contactPrincipal(d.contacts);
  const autres = d.contacts.filter((c) => c !== principal);
  const temperature = d.temperature ? `${LIBELLES_TEMPERATURE[d.temperature]}${d.temperatureForcee ? " (forcée)" : ""}` : null;
  return [
    String(d.id), texteCsv(d.nom), texteCsv(TYPES_ORGANISATION[d.type] ?? d.type), texteCsv(LIBELLES[d.etape] ?? d.etape), jourCsv(d.etapeDepuisLe),
    texteCsv(libelle(PRIORITES, d.priorite)), texteCsv(temperature), texteCsv(d.responsable), texteCsv(d.chefDeProjet),
    texteCsv(libelle(ORIGINES, d.origine)), texteCsv(d.rattachementGht),
    texteCsv(d.telephone), texteCsv(d.email), texteCsv(d.siteWeb), texteCsv(d.ris), texteCsv(d.risVersion), texteCsv(d.outilRdv),
    texteCsv(d.solutionActuelle), texteCsv(d.concurrent),
    nombreCsv(d.nombreSites), nombreCsv(d.nombreSalles), nombreCsv(d.nombreIrm), nombreCsv(d.nombreScanners), nombreCsv(d.nombreRadio),
    nombreCsv(d.nombreEcho), nombreCsv(d.nombreMammo), nombreCsv(d.nombreSecretaires), nombreCsv(d.volumeAppelsEstime),
    texteCsv(d.blocagesTechniques.map((b) => libelle(BLOCAGES_TECHNIQUES, b)).join(" | ")),
    ouiNon(d.qualifBesoin), ouiNon(d.qualifDecideur), ouiNon(d.qualifBudget), ouiNon(d.qualifCalendrier), ouiNon(d.qualifSolutionActuelle),
    jourCsv(d.decisionAttendueLe), jourCsv(d.dernierEchangeLe), texteCsv(d.prochaineAction), jourCsv(d.prochaineActionLe),
    texteCsv(d.produits.join(", ")), eurosCsv(d.mensuelEstimeCentimes), eurosCsv(d.miseEnServiceEstimeeCentimes),
    texteCsv(libelle(LIBELLES_RAISONS, d.raisonSortieCode)), texteCsv(d.raisonSortie), jourCsv(d.dateSortie), texteCsv(d.concurrentGagnant), jourCsv(d.reveilLe),
    texteCsv(principal?.nom ?? null), texteCsv(principal?.fonction ?? null), texteCsv(principal?.email ?? null), texteCsv(principal?.telephone ?? null),
    texteCsv(resumeContacts(autres)),
    texteCsv(resumeCentres(d.centres)), texteCsv(d.notes), jourCsv(d.creeLe),
  ].join(";");
}

export function construireCsvProspects(dossiers: DossierExport[]): string {
  const lignes = [EN_TETE_PROSPECTS.join(";"), ...dossiers.map(ligneProspect)];
  return "﻿" + lignes.map((l) => l + "\r\n").join("");
}

export function nomFichierProspects(maintenant: Date): string {
  return `pilot-prospects-${jourCsv(maintenant)}.csv`;
}
