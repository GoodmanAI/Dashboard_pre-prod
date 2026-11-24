import { CrmTypeConcurrent } from "@prisma/client";
import { z } from "zod";
import { auMoinsUnChamp, dateValide, texteOptionnel } from "./commun";
import { nettoyerNom } from "@/pilot/lib/concurrents/regles";

/**
 * Les concurrents et leurs relevés de prix (lot R). Texte libre : l'offre, les
 * notes, les conditions et la source vont en base, jamais dans le journal.
 */

export const RELEVE_FUTUR = "Un relevé ne peut pas être daté dans le futur.";
export const SITE_WEB_INVALIDE = "Le site web n'est pas une adresse valide.";

const MESSAGES_CLAIRS = new Set([RELEVE_FUTUR, SITE_WEB_INVALIDE]);
const LIBELLES_CHAMPS: Record<string, string> = {
  nom: "Nom", type: "Type", offre: "Offre (2 000 caractères au plus)", siteWeb: "Site web", notes: "Notes (2 000 caractères au plus)",
  majLe: "Version lue", releveLe: "Date du relevé", prixSalleMoisCentimes: "Prix par salle et par mois en euros",
  prixInstallationCentimes: "Prix d'installation en euros", conditions: "Conditions (2 000 caractères au plus)",
  source: "Source (2 000 caractères au plus)",
};

/** Le refus à afficher : la règle qui parle d'elle-même, sinon le champ à corriger. */
export function messageConcurrent(erreur: z.ZodError): string {
  const premier = erreur.issues[0];
  if (premier && MESSAGES_CLAIRS.has(premier.message)) return premier.message;
  const libelle = LIBELLES_CHAMPS[String(premier?.path.at(-1) ?? "")];
  return libelle ? `Vérifiez le champ « ${libelle} ».` : "Corps de requête invalide.";
}

const adresseValide = (valeur: string) => {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(valeur) && !/^https?:\/\//i.test(valeur)) return false;
  try { return ["http:", "https:"].includes(new URL(/^https?:\/\//i.test(valeur) ? valeur : "https://" + valeur).protocol); } catch { return false; }
};
/** Comme le site d'une organisation (`validation/organisation.ts`) : « https:// » ajouté s'il manque, puis l'adresse doit se lire. */
const siteWeb = texteOptionnel(300)
  .refine((v) => !v || adresseValide(v), SITE_WEB_INVALIDE)
  .transform((v) => (v && !/^https?:\/\//i.test(v) ? "https://" + v : v));

const identite = z.object({
  // Nettoyé d'abord : la longueur se mesure sur le nom enregistré, après compaction des espaces.
  nom: z.string().transform(nettoyerNom).pipe(z.string().min(1).max(120)),
  type: z.nativeEnum(CrmTypeConcurrent),
  offre: texteOptionnel(2000),
  siteWeb,
  notes: texteOptionnel(2000),
}).strict();

export const creationConcurrent = identite;
/** `majLe` est la version lue par l'écran : si elle a changé, le serveur répond 409 (C-26). */
export const modificationConcurrent = identite.partial().extend({ majLe: dateValide })
  .refine(({ majLe, ...champs }) => { void majLe; return auMoinsUnChamp(champs); }, "Renseignez au moins un champ.");

/** Des centimes entiers, jamais négatifs, dans les bornes d'un INTEGER PostgreSQL. */
const montant = z.number().int().min(0).max(2147483647).nullable().optional();
const date = dateValide.refine((d) => !(d instanceof Date) || +d <= Date.now(), RELEVE_FUTUR);
const champsReleve = {
  prixSalleMoisCentimes: montant, prixInstallationCentimes: montant,
  conditions: texteOptionnel(2000), source: texteOptionnel(2000),
};
export const creationReleve = z.object({ releveLe: date, ...champsReleve }).strict();
/**
 * `majLe` est la version du relevé lue par l'écran, comme pour un concurrent : si
 * quelqu'un l'a corrigé depuis, le serveur répond 409, quel que soit le champ touché
 * (C-26). L'écran n'envoie que les champs modifiés.
 */
export const modificationReleve = z.object({ majLe: dateValide, releveLe: date.optional(), ...champsReleve }).strict()
  .refine(({ majLe, ...champs }) => { void majLe; return auMoinsUnChamp(champs); }, "Renseignez au moins un champ.");
/** La suppression peut rappeler la version lue ; sans corps, elle supprime ce qui est là. */
export const suppressionReleve = z.object({ majLe: dateValide.optional() }).strict();
