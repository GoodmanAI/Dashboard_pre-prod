import { z } from "zod";

/** Les identifiants correspondent aux INTEGER PostgreSQL, jamais à des décimaux. */
export const identifiant = z.number().int().positive().max(2147483647);

/** Un champ facultatif effacé dans un formulaire devient NULL en base. */
export const texteOptionnel = (maximum = 200) => z.string().trim().max(maximum)
  .transform((valeur) => valeur === "" ? null : valeur).nullable().optional();

/**
 * Un code postal français, cinq chiffres (C-92) : sans lui, la fiche ne se place
 * pas sur la carte. Les espaces sont retirés ; vide, il devient NULL.
 */
export const MESSAGE_CODE_POSTAL = "Code postal : 5 chiffres, par exemple 29000.";
export const codePostal = z.string().trim().transform((v) => v.replace(/\s/g, ""))
  .pipe(z.string().regex(/^(\d{5})?$/, MESSAGE_CODE_POSTAL)).transform((v) => v || null).nullable().optional();

export const auMoinsUnChamp = (valeur: object) => Object.values(valeur).some((champ) => champ !== undefined);

/**
 * Un jour `AAAA-MM-JJ`, ou un ISO complet qui commence ainsi (heure, secondes et
 * millisecondes facultatives, puis `Z` ou un décalage). Ce sont les deux formes
 * que les écrans envoient : le champ date d'un formulaire et `toISOString()`.
 */
const FORME_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** Le jour saisi existe au calendrier : `2027-02-29` ou `2026-02-30` ne retombent pas sur eux-mêmes. */
function jourExiste(annee: number, mois: number, jour: number): boolean {
  const d = new Date(0);
  d.setUTCFullYear(annee, mois - 1, jour);
  return d.getUTCFullYear() === annee && d.getUTCMonth() === mois - 1 && d.getUTCDate() === jour;
}

function dateLisible(valeur: string): boolean {
  const forme = FORME_DATE.exec(valeur);
  return forme !== null && jourExiste(+forme[1], +forme[2], +forme[3]) && Number.isFinite(new Date(valeur).getTime());
}

export const dateValide = z.string()
  .refine(dateLisible, "Date invalide.")
  .transform((valeur) => new Date(valeur));
