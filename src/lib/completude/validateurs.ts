/**
 * Validateurs partagés par les registres de complétude.
 *
 * **Un contrôle de format ne suffit pas, et c'est la raison d'être de ce
 * fichier.** `0606060606` est présent quatre fois dans le `getInitInfo.js` de
 * LyraeTalk comme numéro provisoire assumé (Quimper, Fouesnant, Pont-l'Abbé,
 * Pontivy), `0000000000` et `+33` seul y figurent aussi pour les clients 10 et
 * 11. Tous passent n'importe quelle validation de forme. Un numéro provisoire
 * qui passe le contrôle est pire que pas de contrôle du tout : il donne
 * l'illusion que le centre est prêt.
 *
 * Ces validateurs sont partagés entre LyraeTalk et LyraeKonnect : le
 * `telephoneSecretariat` d'un cabinet Konnect a exactement le même usage que le
 * numéro de transfert du robot, et la même conséquence pour le patient s'il est
 * faux.
 */

/** Une valeur texte est-elle renseignée ? */
export function renseigne(valeur: unknown): boolean {
  return typeof valeur === "string" && valeur.trim() !== "";
}

/** Ne garde que les chiffres et un `+` de tête. Espaces et points sont courants en saisie. */
function normaliserNumero(valeur: string): string {
  const brut = valeur.trim().replace(/[\s.\-()/]/g, "");
  return brut.startsWith("+") ? `+${brut.slice(1).replace(/\D/g, "")}` : brut.replace(/\D/g, "");
}

/**
 * Numéros refusés quelle que soit leur forme.
 *
 * Deux familles : les suites d'un seul chiffre répété (`0606…`, `0000…`,
 * `1111…`), et les numéros de démonstration que personne n'a jamais remplacés.
 * La liste est volontairement large : un faux positif se corrige en saisissant
 * le vrai numéro, un faux négatif laisse un centre en production avec un numéro
 * qui ne répond pas.
 */
const NUMEROS_INTERDITS = [
  "0606060606",
  "0000000000",
  "0123456789",
  "0102030405",
  "0611111111",
  "+33",
  "+330000000000",
];

function estInterdit(normalise: string): boolean {
  if (NUMEROS_INTERDITS.includes(normalise)) return true;

  const chiffres = normalise.replace(/^\+33/, "0").replace(/\D/g, "");

  // Un seul chiffre répété : 0000000000, 1111111111…
  if (/^(\d)\1{9}$/.test(chiffres)) return true;

  // Une paire répétée cinq fois : 0606060606, 0101010101…
  if (/^(\d\d)\1{4}$/.test(chiffres)) return true;

  return false;
}

/**
 * Numéro **appelé par le patient**, celui qui identifie le centre à l'arrivée
 * d'un appel.
 *
 * Exige la forme internationale, et rien d'autre : c'est la clé de
 * correspondance avec le centre côté LyraeTalk. Le même numéro écrit
 * `0545820880` ne serait pas reconnu, et l'appel n'aboutirait nulle part sans
 * qu'aucune erreur ne soit visible.
 */
export function estNumeroEntrant(valeur: unknown): boolean {
  if (!renseigne(valeur)) return false;
  const n = normaliserNumero(valeur as string);
  if (estInterdit(n)) return false;
  return /^\+33[1-9]\d{8}$/.test(n);
}

/**
 * Numéro **composé ou dicté au patient** : secrétariat, redirection, téléphone
 * du centre.
 *
 * Accepte les deux notations, parce que les deux fonctionnent à l'appel et que
 * les deux coexistent déjà dans la configuration actuelle. Un numéro provisoire
 * reste refusé.
 */
export function estNumeroSortant(valeur: unknown): boolean {
  if (!renseigne(valeur)) return false;
  const n = normaliserNumero(valeur as string);
  if (estInterdit(n)) return false;
  return /^0[1-9]\d{8}$/.test(n) || /^\+33[1-9]\d{8}$/.test(n);
}

/**
 * Adresse mail. Contrôle volontairement permissif : on cherche une faute de
 * saisie évidente, pas à départager les subtilités de la RFC 5322.
 */
export function estAdresseMail(valeur: unknown): boolean {
  if (!renseigne(valeur)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((valeur as string).trim());
}

/** Un code postal français : cinq chiffres. */
export function estCodePostal(valeur: unknown): boolean {
  if (!renseigne(valeur)) return false;
  return /^\d{5}$/.test((valeur as string).trim());
}
