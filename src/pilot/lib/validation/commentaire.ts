import { CrmCibleCommentaire, CrmDepartement } from "@prisma/client";
import { z } from "zod";
import type { CibleCommentaire } from "@/pilot/lib/commentaires/destinataires";

/**
 * Commentaires avec alerte et départements (lot T). Chaque refus porte son
 * message en français, que `messageCommentaire` rend tel quel. Un champ que
 * seul un appel forgé envoie (organisationId, auteurId) reçoit le message
 * générique : l'organisation vient de l'adresse, l'auteur de la session.
 */

/**
 * `max` : signes gardés après nettoyage, comptés comme la base (points de code,
 * CHECK `CrmCommentaire_texte_valide`). `brut` : borne de la chaîne reçue, en
 * unités UTF-16, posée avant tout nettoyage : un corps démesuré ne coûte rien.
 * Le compteur de saisie lit la même constante.
 */
export const LONGUEUR_COMMENTAIRE = { max: 2000, brut: 10000 } as const;
const GENERIQUE = "Vérifiez les champs du formulaire.";
const CORPS = { required_error: GENERIQUE, invalid_type_error: GENERIQUE };
const MESSAGE_VIDE = "Écrivez votre commentaire.";
const MESSAGE_LONG = "Le commentaire tient en 2 000 signes au plus.";
export const MESSAGE_CARACTERE = "Le commentaire contient un caractère non pris en charge.";
export const MESSAGE_NIR = "Ce texte ressemble à un numéro de sécurité sociale. Pilot ne garde aucune donnée patient.";
const MESSAGE_DEPARTEMENT = "Choisissez un département.";
const MESSAGE_PERSONNE = "Choisissez une personne.";
const MESSAGE_VERSION = "Rechargez la page.";

/**
 * Signes invisibles retirés au nettoyage : ils ne sont pas du texte, et un
 * commentaire qui n'en est fait n'a rien à lire. Espaces de largeur nulle et
 * joints (U+200B à U+200D, U+2060, U+FEFF), trait d'union conditionnel
 * (U+00AD), graphème combinatoire invisible (U+034F), remplissages hangûl
 * (U+115F, U+1160, U+3164, U+FFA0), séparateur de voyelles mongol (U+180E),
 * opérateurs mathématiques invisibles (U+2061 à U+2064), braille vide
 * (U+2800), passage à la ligne C1 (U+0085). Écrits en échappements : en clair,
 * on ne les verrait pas dans le code.
 */
const INVISIBLES = /[\u0085­͏ᅟᅠ᠎​-‍⁠-⁤⠀ㅤ﻿ﾠ]/g;

/**
 * Refusés : caractères de contrôle C0 et C1 sauf la tabulation et le retour à
 * la ligne (U+007F compris), surrogates isolés (texte mal formé, que la base
 * refuserait), directionnels de surcharge et d'isolement (U+202A à U+202E,
 * U+2066 à U+2069), qui retournent l'affichage d'un texte sans se voir.
 */
const INTERDITS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩]|\p{Cs}/u;

/** Au moins une lettre, un chiffre, une ponctuation ou un symbole : un texte d'espaces, de toute sorte, est vide. */
const VISIBLE = /[\p{L}\p{N}\p{P}\p{S}]/u;

/**
 * Un numéro de sécurité sociale (NIR), clé comprise ou non : sexe, année, mois
 * (ou 20 à 99 pour les cas particuliers), département (2A et 2B compris),
 * commune et rang. Cherché sur le texte dont les espaces et les points entre
 * deux chiffres sont retirés : « 1 85 05 78 006 084 36 » est vu, « NIR 185… »
 * aussi. Un téléphone (10 chiffres, commence par 0), un SIREN (9 chiffres), un
 * SIRET (14 chiffres) ou un montant ne le sont pas.
 */
const NIR = /\b[12]\d{2}(0[1-9]|1[0-2]|[2-9]\d)(\d{2}|2[AB])\d{6}(\d{2})?\b/i;
const SEPARATEURS_DE_CHIFFRES = /(?<=[\dAB])[\s.]+(?=[\dAB])/gi;

export function ressembleAUnNir(texte: string): boolean {
  return NIR.test(texte.replace(SEPARATEURS_DE_CHIFFRES, ""));
}

/**
 * Le nettoyage du serveur, partagé avec le compteur de saisie : retours à la
 * ligne uniformes, signes invisibles retirés, espaces rognés aux deux bouts
 * (insécables compris).
 */
export function nettoyerCommentaire(brut: string): string {
  return brut.replace(/\r\n?/g, "\n").replace(INVISIBLES, "").trim();
}

export type AnalyseTexte = { ok: true; texte: string } | { ok: false; message: string };

/**
 * Le texte d'un commentaire, nettoyé puis vérifié dans l'ordre : caractère
 * refusé, rien de visible, plus de 2 000 signes, numéro de sécurité sociale.
 * Ce qui passe tient dans la CHECK SQL (1 à 2 000 points de code, au moins un
 * caractère qui n'est pas un espace) : un refus est un 400, jamais un 500.
 */
export function analyserTexteCommentaire(brut: string): AnalyseTexte {
  const texte = nettoyerCommentaire(brut);
  if (INTERDITS.test(texte)) return { ok: false, message: MESSAGE_CARACTERE };
  if (!VISIBLE.test(texte)) return { ok: false, message: MESSAGE_VIDE };
  if (Array.from(texte).length > LONGUEUR_COMMENTAIRE.max) return { ok: false, message: MESSAGE_LONG };
  if (ressembleAUnNir(texte)) return { ok: false, message: MESSAGE_NIR };
  return { ok: true, texte };
}

/** La chaîne brute est bornée avant toute transformation : l'analyse ne tourne que sur ce qui passe. */
const texte = z.string({ required_error: MESSAGE_VIDE, invalid_type_error: MESSAGE_VIDE })
  .max(LONGUEUR_COMMENTAIRE.brut, MESSAGE_LONG)
  .transform((valeur, ctx) => {
    const analyse = analyserTexteCommentaire(valeur);
    if (analyse.ok) return analyse.texte;
    ctx.addIssue({ code: "custom", message: analyse.message });
    return z.NEVER;
  });

const departement = z.nativeEnum(CrmDepartement, { errorMap: () => ({ message: MESSAGE_DEPARTEMENT }) });
const personneId = z.number({ invalid_type_error: MESSAGE_PERSONNE }).int(MESSAGE_PERSONNE).positive(MESSAGE_PERSONNE).max(2147483647, MESSAGE_PERSONNE);

/**
 * `cible` : AUCUN (par défaut), TOUS, DEPARTEMENT avec `departement`, PERSONNE
 * avec `personneId`. Un complément qui n'est pas celui de la cible est refusé.
 * Rend `{ texte, cible }` avec la cible déjà au format de `calculerDestinataires`.
 */
export const nouveauCommentaire = z.object({
  texte,
  cible: z.nativeEnum(CrmCibleCommentaire, { errorMap: () => ({ message: "Choisissez qui prévenir." }) }).default("AUCUN"),
  departement: departement.optional(),
  personneId: personneId.optional(),
}, CORPS).strict().superRefine((p, ctx) => {
  const refuser = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (p.cible === "DEPARTEMENT" && p.departement === undefined) refuser("departement", MESSAGE_DEPARTEMENT);
  if (p.cible === "PERSONNE" && p.personneId === undefined) refuser("personneId", MESSAGE_PERSONNE);
  if (p.cible !== "DEPARTEMENT" && p.departement !== undefined) refuser("departement", GENERIQUE);
  if (p.cible !== "PERSONNE" && p.personneId !== undefined) refuser("personneId", GENERIQUE);
}).transform((p): { texte: string; cible: CibleCommentaire } => ({
  texte: p.texte,
  cible: p.cible === "DEPARTEMENT" ? { cible: "DEPARTEMENT", departement: p.departement! }
    : p.cible === "PERSONNE" ? { cible: "PERSONNE", personneId: p.personneId! }
    : { cible: p.cible },
}));

const version = z.string({ required_error: MESSAGE_VERSION, invalid_type_error: MESSAGE_VERSION }).datetime({ message: MESSAGE_VERSION }).nullable();

/** `majLe` : la version lue par l'écran, null si le compte n'avait pas encore de département (C-26). */
export const modificationDepartement = z.object({
  departement,
  majLe: version,
}, CORPS).strict();

/** Le message du premier refus ; un champ en trop ou un corps qui n'en est pas un reçoit le message générique. */
export function messageCommentaire(erreur: z.ZodError): string {
  const probleme = erreur.issues[0];
  return !probleme || probleme.code === "unrecognized_keys" ? GENERIQUE : probleme.message;
}
