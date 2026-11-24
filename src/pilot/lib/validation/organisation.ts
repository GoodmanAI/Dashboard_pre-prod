import { CrmEtapeCommerciale, CrmPriorite, CrmTypeOrganisation, CrmRaisonSortie } from "@prisma/client";
import { z } from "zod";
import { auMoinsUnChamp, codePostal, identifiant, texteOptionnel, dateValide } from "./commun";
import { contactSansOrganisation } from "./contact";
import { CLES_BLOCAGE, CLES_ORIGINE } from "@/pilot/lib/organisations/referentielClient";

const nombre = z.number().int().min(0).max(2147483647).nullable().optional();
const chiffres = (n: number, libelle: string) => z.string().trim().transform((v) => v.replace(/\s/g, ""))
  .pipe(z.string().regex(n === 9 ? /^(\d{9})?$/ : /^(\d{14})?$/, `${libelle} : ${n} chiffres.`)).transform((v) => v || null).nullable().optional();
/** L'identité légale (C-89), remplie depuis l'annuaire des entreprises ou saisie. */
export const identiteLegale = {
  siren: chiffres(9, "SIREN"), siretSiege: chiffres(14, "SIRET du siège"),
  denominationLegale: texteOptionnel(300), siegeAdresse: texteOptionnel(300), siegeCodePostal: codePostal, siegeVille: texteOptionnel(200),
  codeNaf: texteOptionnel(10), formeJuridique: texteOptionnel(100), annuaireLuLe: dateValide.nullable().optional(),
};
const identite = z.object({
  raisonSocialeNom: z.string().trim().min(1).max(200),
  type: z.nativeEnum(CrmTypeOrganisation),
  responsableId: identifiant,
  chefDeProjetId: identifiant.nullable().optional(),
  ris: texteOptionnel(),
  nombreSites: nombre,
  nombreSalles: nombre,
  volumeAppelsEstime: nombre,
  // Fiche client enrichie (C-59).
  risVersion: texteOptionnel(50),
  outilRdv: texteOptionnel(100),
  nombreSecretaires: nombre, nombreIrm: nombre, nombreScanners: nombre, nombreRadio: nombre, nombreEcho: nombre, nombreMammo: nombre,
  blocagesTechniques: z.array(z.enum(CLES_BLOCAGE as [string, ...string[]])).max(CLES_BLOCAGE.length).optional(),
  origine: z.union([z.enum(CLES_ORIGINE as [string, ...string[]]), z.literal("")]).nullable().optional().transform((v) => (v ? v : v === undefined ? undefined : null)),
  rattachementGht: texteOptionnel(120),
  ...identiteLegale,
  // Prospection (C-65) : priorité et coordonnées de l'établissement.
  priorite: z.nativeEnum(CrmPriorite).nullable().optional(),
  telephone: texteOptionnel(40),
  email: z.string().trim().pipe(z.string().email("Email du standard : adresse invalide.").or(z.literal(""))).transform((v) => v || null).nullable().optional(),
  siteWeb: texteOptionnel(300).transform((v) => (v && !/^https?:\/\//i.test(v) ? "https://" + v : v)),
}).strict();
export const creationOrganisation = identite.extend({ contactPrincipal: contactSansOrganisation.optional() });
export const majOrganisation = identite.partial().extend({
  utilisateurId: identifiant.nullable().optional(),
  // Le concurrent en place chez le prospect (lot R) ; null le retire.
  concurrentId: identifiant.nullable().optional(),
  solutionActuelle: texteOptionnel(2000), decisionAttendueLe: dateValide.nullable().optional(),
  qualifBesoin: z.boolean().optional(), qualifDecideur: z.boolean().optional(), qualifBudget: z.boolean().optional(),
  qualifCalendrier: z.boolean().optional(), qualifSolutionActuelle: z.boolean().optional(),
})
  .refine(auMoinsUnChamp, "Renseignez au moins un champ.");

/** Le concurrent gagnant n'a de sens que pour une affaire perdue au profit d'un concurrent (lot R). */
export const GAGNANT_SANS_MOTIF = "Le concurrent gagnant ne se renseigne que pour une affaire perdue avec le motif « Concurrent ».";
export const changementEtape = z.object({
  pocDebuteLe: dateValide.optional(),
  etape: z.nativeEnum(CrmEtapeCommerciale),
  raisonSortie: z.string().trim().optional(),
  raisonSortieCode: z.nativeEnum(CrmRaisonSortie).optional(),
  reveilLe: dateValide.nullable().optional(),
  // L'écran envoie le motif avec le gagnant ; le service refuse aussi le cas d'un motif déjà enregistré.
  concurrentGagnantId: identifiant.nullable().optional(),
  // Perdu ou Contrat terminé : terminer aussi les contrats actifs, à la date du jour (C-86).
  terminerContrats: z.boolean().optional(),
}).strict().refine((v) => v.concurrentGagnantId == null || (v.etape === "PERDU" && v.raisonSortieCode === "CONCURRENT"), GAGNANT_SANS_MOTIF);
