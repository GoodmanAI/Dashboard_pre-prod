/**
 * Vérification des validateurs de complétude.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' scripts/verif-validateurs-completude.ts
 *
 * Le dépôt n'a ni test ni CI. Ce script est la compensation minimale sur la
 * partie qui en a le plus besoin : **les numéros de téléphone**. Un contrôle de
 * format seul laisserait passer `0606060606`, présent quatre fois dans le
 * `getInitInfo.js` de LyraeTalk comme numéro provisoire, et un centre partirait
 * en production avec un numéro qui ne répond pas.
 *
 * Il ne touche aucune base de données et peut donc tourner n'importe où, y
 * compris avant d'avoir un environnement local monté.
 *
 * Sort en code 1 si un cas échoue, pour être utilisable dans un enchaînement.
 */

import {
  estAdresseMail,
  estCodePostal,
  estNumeroEntrant,
  estNumeroSortant,
} from "../src/lib/completude/validateurs";

/** [libellé, valeur, entrant attendu, sortant attendu] */
const CAS: Array<[string, unknown, boolean, boolean]> = [
  // Les numéros provisoires et de démonstration réellement présents dans la
  // configuration actuelle. Ce sont eux la raison d'être de la liste d'interdits.
  ["placeholder Quimper 0606060606", "0606060606", false, false],
  ["zéros 0000000000", "0000000000", false, false],
  ["+33 seul (clients 10 et 11)", "+33", false, false],
  ["suite 0102030405", "0102030405", false, false],

  // Valeurs absentes.
  ["chaîne vide", "", false, false],
  ["null", null, false, false],

  // Numéros réels. Le national est refusé en ENTRANT : c'est la clé
  // d'identification de l'appel, elle exige la forme internationale.
  ["Cognac national 0545820880", "0545820880", false, true],
  ["Cognac international +33545820880", "+33545820880", true, true],
  ["saisi avec espaces", "05 45 82 08 80", false, true],
  ["Menton +33493287232", "+33493287232", true, true],

  // Longueurs fausses.
  ["neuf chiffres", "054582088", false, false],
  ["onze chiffres", "05458208801", false, false],
];

let echecs = 0;

for (const [nom, valeur, attEntrant, attSortant] of CAS) {
  const entrant = estNumeroEntrant(valeur);
  const sortant = estNumeroSortant(valeur);
  const ok = entrant === attEntrant && sortant === attSortant;
  if (!ok) echecs += 1;
  console.log(
    `${ok ? "OK   " : "ÉCHEC"} | ${nom.padEnd(36)} entrant=${String(entrant).padEnd(5)} sortant=${sortant}`
  );
}

const ANNEXES: Array<[string, boolean, boolean]> = [
  ["code postal 16100", estCodePostal("16100"), true],
  ["code postal 1610", estCodePostal("1610"), false],
  ["code postal vide", estCodePostal(""), false],
  ["mail complet", estAdresseMail("secretaire@radiologie-cognac.com"), true],
  ["mail tronqué", estAdresseMail("secretaire@"), false],
];

for (const [nom, obtenu, attendu] of ANNEXES) {
  const ok = obtenu === attendu;
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK   " : "ÉCHEC"} | ${nom.padEnd(36)} ${obtenu}`);
}

if (echecs > 0) {
  console.error(`\n${echecs} cas en échec.`);
  process.exit(1);
}
console.log(`\n${CAS.length + ANNEXES.length} cas, tous passent.`);
