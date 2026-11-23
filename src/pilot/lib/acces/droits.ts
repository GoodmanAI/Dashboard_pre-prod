import type { CrmDroitPilot, CrmProfilPilot } from "@prisma/client";

/**
 * Qui peut quoi dans Pilot (CHOIX.md, C-64). Fonctions pures : la garde
 * serveur, l'écran Équipe et Mon compte lisent tous ce fichier.
 *
 * - Super-administrateur : le rôle SUPER_ADMIN du Dashboard. Tous les droits,
 *   toujours, et lui seul crée les comptes et donne les droits.
 * - Gérant et Développeur : des comptes ADMIN du Dashboard, avec un rôle et
 *   des droits cochés dans `CrmAccesPilot`.
 * - Un développeur ne voit jamais le chiffre d'affaires, même coché.
 */
export type Droit = CrmDroitPilot;
export type Profil = CrmProfilPilot;

/** L'ordre d'affichage des droits, leur libellé, leur nom court (liste de l'écran Équipe) et ce qu'ils ouvrent. */
export const DROITS: readonly { cle: Droit; libelle: string; court: string; detail: string }[] = [
  { cle: "VOIR_CA", libelle: "Voir le chiffre d'affaires", court: "Chiffre d'affaires",
    detail: "La page Chiffre d'affaires : projection, réel des mois passés, scénarios." },
  { cle: "EXPORTER_CA", libelle: "Exporter pour la comptabilité", court: "Export comptable",
    detail: "Le fichier du réel mensuel, pour le cabinet comptable." },
  { cle: "MODIFIER_MONTANTS", libelle: "Modifier les montants", court: "Montants",
    detail: "Propositions, contrats, opportunités et réglages de l'apport d'affaires." },
  { cle: "EVALUER_PARC", libelle: "Vérifier les étapes automatiques", court: "Vérification des étapes",
    detail: "Relancer la vérification des déploiements sans attendre le passage régulier." },
];

const TOUS: readonly Droit[] = DROITS.map((d) => d.cle);

/** Les deux rôles qu'un super-administrateur donne, dans l'ordre de l'écran. */
export const PROFILS: Record<Profil, { libelle: string; detail: string; parDefaut: readonly Droit[]; interdits: readonly Droit[] }> = {
  DEVELOPPEUR: {
    libelle: "Développeur", detail: "Suit les clients et les déploiements. Ne voit pas le chiffre d'affaires.",
    parDefaut: ["EVALUER_PARC"], interdits: ["VOIR_CA", "EXPORTER_CA"],
  },
  GERANT: {
    libelle: "Gérant", detail: "Voit et pilote tout, chiffre d'affaires compris.",
    parDefaut: TOUS, interdits: [],
  },
};
export const ORDRE_PROFILS: readonly Profil[] = ["DEVELOPPEUR", "GERANT"];

/** Un compte ADMIN sans ligne d'accès : développeur, droits par défaut. Rien n'ouvre le CA sans décision. */
export const PROFIL_PAR_DEFAUT: Profil = "DEVELOPPEUR";

/** Les droits dans l'ordre d'affichage, sans doublon ni valeur inconnue. */
export function normaliser(droits: readonly string[]): Droit[] {
  return TOUS.filter((d) => droits.includes(d));
}

/** Pourquoi ce droit ne peut pas être coché, ou null. Dit à l'écran et renvoyé par le serveur. */
export function raisonDroitImpossible(profil: Profil, droit: Droit, droits: readonly Droit[]): string | null {
  if (PROFILS[profil].interdits.includes(droit)) return "Un développeur ne voit pas le chiffre d'affaires.";
  if (droit === "EXPORTER_CA" && !droits.includes("VOIR_CA")) return "L'export demande de voir le chiffre d'affaires.";
  return null;
}

/** Le premier refus d'une combinaison rôle et droits, ou null si elle est permise. */
export function refusDroits(profil: Profil, droits: readonly Droit[]): string | null {
  for (const droit of droits) {
    const raison = raisonDroitImpossible(profil, droit, droits);
    if (raison) return raison;
  }
  return null;
}

/** Ce qu'on lit de `CrmAccesPilot` ; null quand le compte n'a pas de ligne. */
export type AccesLu = { profil: Profil; droits: readonly Droit[]; retireLe: Date | null } | null;

/**
 * Les droits réels d'un compte. Le serveur ne se fie qu'à ce calcul : un droit
 * stocké que le rôle interdit est ignoré, l'export sans la vue aussi.
 */
export function droitsEffectifs(role: string, acces: AccesLu): Droit[] {
  if (role === "SUPER_ADMIN") return [...TOUS];
  if (role !== "ADMIN" || acces?.retireLe) return [];
  const profil = acces?.profil ?? PROFIL_PAR_DEFAUT;
  const permis = normaliser(acces ? acces.droits : PROFILS[profil].parDefaut).filter((d) => !PROFILS[profil].interdits.includes(d));
  return permis.includes("VOIR_CA") ? permis : permis.filter((d) => d !== "EXPORTER_CA");
}

/** Le rôle Pilot d'un compte ADMIN, celui par défaut s'il n'a pas de ligne ; null pour les autres. */
export function profilEffectif(role: string, acces: AccesLu): Profil | null {
  return role === "ADMIN" ? acces?.profil ?? PROFIL_PAR_DEFAUT : null;
}

/** Le libellé du compte, affiché sous son nom. */
export function libelleCompte(role: string, profil: Profil | null): string {
  if (role === "SUPER_ADMIN") return "Super-administrateur";
  if (role === "ADMIN") return PROFILS[profil ?? PROFIL_PAR_DEFAUT].libelle;
  return "Client";
}
