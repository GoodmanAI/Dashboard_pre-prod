import { CrmDepartement, CrmDroitPilot, CrmProfilPilot } from "@prisma/client";
import { z } from "zod";

/**
 * Comptes de l'équipe et droits (C-64). Chaque champ porte son message en
 * français, absent ou mal formé compris : `messageAcces` peut le rendre tel quel.
 */
/** Au moins 12 signes, 200 au plus (la connexion refuse au-delà). Ici, pas dans motDePasse.ts : l'écran l'importe, sans node:crypto. */
export const LONGUEUR_MOT_DE_PASSE = { min: 12, max: 200 } as const;
const CORPS = { required_error: "Vérifiez les champs du formulaire.", invalid_type_error: "Vérifiez les champs du formulaire." };
const texte = (message: string) => z.string({ required_error: message, invalid_type_error: message });
const profil = z.nativeEnum(CrmProfilPilot, { errorMap: () => ({ message: "Choisissez un rôle : développeur ou gérant." }) });
const droits = z.array(z.nativeEnum(CrmDroitPilot, { errorMap: () => ({ message: "Droit inconnu." }) }),
  { required_error: "Indiquez les droits.", invalid_type_error: "Indiquez les droits." }).max(20, "Droit inconnu.");

/**
 * Les écrans du Dashboard ouverts à un compte de l'équipe (24/11/2026,
 * `src/lib/accesInternes.ts`) : clé d'écran, « read » ou « write » (gestes du
 * quotidien). Les clés inconnues sont écartées au serveur par `normaliserAccesInternes`.
 */
const accesDashboard = z.record(
  z.string().max(60, "Écran inconnu."),
  z.enum(["read", "write"], { errorMap: () => ({ message: "Niveau d'accès inconnu." }) }),
  { invalid_type_error: "Vérifiez les écrans cochés." },
).refine((r) => Object.keys(r).length <= 80, "Écran inconnu.");

export const creationCompte = z.object({
  nom: texte("Indiquez le nom de la personne.").trim().min(1, "Indiquez le nom de la personne.").max(120, "Le nom tient en 120 signes."),
  email: texte("Vérifiez l'adresse e-mail.").trim().toLowerCase().max(200, "Vérifiez l'adresse e-mail.").email("Vérifiez l'adresse e-mail."),
  profil,
  droits,
  /** Facultatif (lot T) : sans lui, « Département pas encore choisi ». */
  departement: z.nativeEnum(CrmDepartement, { errorMap: () => ({ message: "Choisissez un département." }) }).optional(),
  /** Facultatif : sans lui, le compte n'ouvre que Pilot. */
  dashboard: accesDashboard.optional(),
}, CORPS).strict();

const version = z.string({ invalid_type_error: "Rechargez la page." }).datetime({ message: "Rechargez la page." }).nullable();

export const operationAcces = z.discriminatedUnion("operation", [
  /** `majLe` : la version lue par l'écran, null si le compte n'avait pas encore de ligne (C-26). */
  z.object({ operation: z.literal("droits"), profil, droits, majLe: version }).strict(),
  /** `avant` : les accès lus par l'écran, pour ne pas écraser un changement fait entre-temps (C-26). */
  z.object({ operation: z.literal("dashboard"), acces: accesDashboard, avant: accesDashboard }).strict(),
  z.object({ operation: z.literal("retirer") }).strict(),
  z.object({ operation: z.literal("rendre") }).strict(),
  z.object({ operation: z.literal("motDePasse") }).strict(),
], { errorMap: () => ({ message: "Action inconnue." }) });

export const changementMotDePasse = z.object({
  actuel: texte("Indiquez votre mot de passe actuel.").min(1, "Indiquez votre mot de passe actuel.").max(LONGUEUR_MOT_DE_PASSE.max, "Le mot de passe actuel ne correspond pas."),
  nouveau: texte("Choisissez un nouveau mot de passe.")
    .min(LONGUEUR_MOT_DE_PASSE.min, `Le nouveau mot de passe compte au moins ${LONGUEUR_MOT_DE_PASSE.min} signes.`)
    .max(LONGUEUR_MOT_DE_PASSE.max, `Le nouveau mot de passe compte au plus ${LONGUEUR_MOT_DE_PASSE.max} signes.`)
    // La politique du Dashboard (src/lib/passwordSchema.ts) s'applique aussi : c'est le même compte.
    .regex(/[A-Z]/, "Ajoutez au moins une majuscule.")
    .regex(/[a-z]/, "Ajoutez au moins une minuscule.")
    .regex(/[0-9]/, "Ajoutez au moins un chiffre.")
    .regex(/[@$!%*?&]/, "Ajoutez au moins un de ces signes : @ $ ! % * ? &"),
}, CORPS).strict();

/** Le message du premier refus ; un champ en trop, que seul un appel forgé envoie, reçoit le message générique. */
export function messageAcces(erreur: z.ZodError): string {
  const probleme = erreur.issues[0];
  return !probleme || probleme.code === "unrecognized_keys" ? "Vérifiez les champs du formulaire." : probleme.message;
}
