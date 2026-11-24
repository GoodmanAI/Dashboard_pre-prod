import { z } from "zod";
import { identifiant, texteOptionnel } from "./commun";
import { CLES_CATEGORIE, CLES_DECISION, CODES_MODALITE, STATUTS_COMMANDE } from "@/pilot/lib/apports/referentiel";

/** Un jour « AAAA-MM-JJ » entre 2000 et 2100 ; vide efface la date. */
export const jourOptionnel = z.string().trim()
  .refine((v) => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && v >= "2000-01-01" && v <= "2100-12-31" && Number.isFinite(new Date(`${v}T00:00:00Z`).getTime())), "Date invalide.")
  .transform((v) => v === "" ? null : new Date(`${v}T00:00:00Z`)).nullable().optional();
export const mois = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mois invalide.");
const centimes = z.number().int().min(0).max(2_000_000_000);
const pdm = z.number().int().min(0).max(10000);
const enumTexte = <T extends string>(valeurs: readonly T[]) => z.string().refine((v): v is T => (valeurs as readonly string[]).includes(v), "Valeur inconnue.");

export const creationGroupe = z.union([
  z.object({ nom: z.string().trim().min(1).max(200), apporteurId: identifiant }),
  z.object({ organisationId: identifiant, apporteurId: identifiant }),
]);

/** Les champs de l'apport, et ceux du client que l'écran modifie : nom d'usage, notes, RIS, origine. */
export const champsApport = z.object({
  nom: z.string().trim().min(1).max(200).optional(),
  notes: texteOptionnel(4000),
  ris: texteOptionnel(120),
  origine: texteOptionnel(120),
  apporteurId: identifiant.optional(),
  coApporteurId: identifiant.nullable().optional(),
  coApporteurPart: z.number().int().min(0).max(100).optional(),
  denominationSociale: texteOptionnel(200),
  siren: z.string().trim().max(11).regex(/^[0-9 ]*$/, "Chiffres seulement.").transform((v) => v === "" ? null : v).nullable().optional(),
  adresseSiege: texteOptionnel(300),
  categorie: z.string().refine((v) => v === "" || (CLES_CATEGORIE as string[]).includes(v)).transform((v) => v || null).nullable().optional(),
  investisseur: texteOptionnel(120),
  precisionCategorie: texteOptionnel(200),
  signaleLe: jourOptionnel,
  besoin: texteOptionnel(2000),
  risCodeClient: texteOptionnel(60),
  risCodesSites: texteOptionnel(200),
  risCommercial: texteOptionnel(80),
  risCommercialTelephone: texteOptionnel(30),
  risCommercialEmail: texteOptionnel(120),
  perimetre: z.enum(["sites", "groupe"]).optional(),
  decision: enumTexte(CLES_DECISION).optional(),
  decisionLe: jourOptionnel,
  deploiementPrevuLe: jourOptionnel,
  observations: texteOptionnel(2000),
  offreTalk: z.boolean().optional(),
  offreKonnect: z.boolean().optional(),
  offreConnecteurRis: z.boolean().optional(),
  bcEnvoyeLe: jourOptionnel,
  commandeValideeLe: jourOptionnel,
  commandeInstalleeLe: jourOptionnel,
}).strict();

export const actionGroupe = z.discriminatedUnion("action", [
  z.object({ action: z.literal("modifier"), champs: champsApport }),
  z.object({ action: z.literal("etape"), statut: enumTexte(STATUTS_COMMANDE) }),
  z.object({ action: z.literal("dupliquer") }),
  z.object({ action: z.literal("retirer") }),
  z.object({ action: z.literal("ajouterSite") }),
  z.object({ action: z.literal("ajouterPrestataire") }),
]);

export const champsSite = z.object({
  nom: z.string().trim().min(1).max(120).optional(),
  adresse: texteOptionnel(300),
  ris: texteOptionnel(120),
  offreTalk: z.boolean().optional(),
  offreKonnect: z.boolean().optional(),
  offreConnecteurRis: z.boolean().optional(),
}).strict();

export const actionSite = z.discriminatedUnion("action", [
  z.object({ action: z.literal("modifier"), champs: champsSite }),
  z.object({ action: z.literal("dupliquer") }),
  z.object({ action: z.literal("ajouterSalles"), nombre: z.number().int().min(1).max(99), modalite: enumTexte(CODES_MODALITE) }),
]);

export const champsSalle = z.object({
  libelle: z.string().trim().min(1).max(60).optional(),
  modalite: enumTexte(CODES_MODALITE).optional(),
}).strict();

export const champsPrestataire = z.object({
  type: texteOptionnel(80), societe: texteOptionnel(120), nom: texteOptionnel(120), telephone: texteOptionnel(30),
  email: texteOptionnel(120), commentaire: texteOptionnel(300),
}).strict();

export const champsApporteur = z.object({
  nom: z.string().trim().min(1).max(120).optional(),
  structure: texteOptionnel(120), telephone: texteOptionnel(30), email: texteOptionnel(120), adresse: texteOptionnel(300),
  siret: texteOptionnel(40), rcs: texteOptionnel(80), tvaIntracom: texteOptionnel(40), prefixeFacture: texteOptionnel(20),
  mention: texteOptionnel(300), commissionne: z.boolean().optional(),
}).strict();

/**
 * Les prix (Talk, Konnect, connecteur RIS, installations et leur mode) vivent dans la
 * grille tarifaire depuis le lot S : les anciennes colonnes de l'apport restent en base,
 * plus lues ni écrites. Les réglages qui les portaient sont refusés dès la validation,
 * avec la phrase qui dit où les modifier (elle commence par « La » : `corps` l'affiche).
 */
export const PRIX_DE_LA_GRILLE = "La grille tarifaire fixe les prix. Modifiez-les sur la page Tarifs.";
const CLES_DE_PRIX = ["talkTtcCentimes", "konnectTtcCentimes", "connecteurRisPdm", "installationTalkCentimes", "installationKonnectCentimes", "modeInstallation"];
const refuserLesPrix = (valeur: unknown, ctx: z.RefinementCtx) => {
  if (valeur && typeof valeur === "object" && CLES_DE_PRIX.some((cle) => cle in valeur)) ctx.addIssue({ code: "custom", message: PRIX_DE_LA_GRILLE });
  return valeur;
};

/** Les réglages de l'apport : TVA des montants affichés, paliers de commission, délais, identité de facturation. */
export const champsParametres = z.preprocess(refuserLesPrix, z.object({
  tvaPdm: pdm,
  seuil1Centimes: centimes, seuil2Centimes: centimes, taux1Pdm: pdm, taux2Pdm: pdm, taux3Pdm: pdm, autresClientsCentimes: centimes,
  delaiEncaissementMois: z.number().int().min(0).max(24), dureeCommissionMois: z.number().int().min(0).max(240),
  horizonMois: z.number().int().min(3).max(48), inclureValidees: z.boolean(), inclureBcEnvoyes: z.boolean(), inclureProspects: z.boolean(),
  tvaFacturePdm: pdm, delaiPaiementJours: z.number().int().min(0).max(120),
  clientNom: z.string().trim().max(200), clientAdresse: z.string().trim().max(300), clientRcs: z.string().trim().max(120),
  typesPrestataires: z.array(z.string().trim().min(1).max(80)).max(30),
  apporteurParDefautId: identifiant.nullable(),
}).partial().strict()
  .refine((p) => p.seuil1Centimes === undefined || p.seuil2Centimes === undefined || p.seuil1Centimes <= p.seuil2Centimes, "Le palier 1 doit rester sous le palier 2."));

export const actionFacture = z.object({ apporteurId: identifiant, mois }).and(z.discriminatedUnion("action", [
  z.object({ action: z.literal("emettre"), numero: texteOptionnel(60), emiseLe: jourOptionnel }),
  z.object({ action: z.literal("payer"), payeeLe: jourOptionnel }),
  z.object({ action: z.literal("rouvrir") }),
  z.object({ action: z.literal("modifier"), numero: texteOptionnel(60), emiseLe: jourOptionnel, payeeLe: jourOptionnel }),
  z.object({ action: z.literal("encaissement"), organisationId: identifiant, centimes: centimes.nullable() }),
]));

export const importCalculateur = z.object({ donnees: z.unknown(), essai: z.boolean() });
