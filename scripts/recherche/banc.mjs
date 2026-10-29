#!/usr/bin/env node
// Banc de la recherche centrale (R6) : rejoue le corpus sur l'étage 1 et donne le taux
// de bonnes réponses. Aucune base, aucun réseau.
//
//   node --experimental-strip-types scripts/recherche/banc.mjs            résumé et échecs
//   node --experimental-strip-types scripts/recherche/banc.mjs --tout     chaque phrase
//   node --experimental-strip-types scripts/recherche/banc.mjs --lot 1    un lot seul
//   node --experimental-strip-types scripts/recherche/banc.mjs --seuil 90 sort en 1 sous 90 %
//
// Une phrase passe si son premier résultat est l'une des destinations attendues (une clé
// attendue sans ancre accepte toute ancre du même écran) et si chaque filtre attendu est
// lu. Une liste attendue vide veut un refus. L'étage 2 (Azure OpenAI) n'est pas rejoué ici.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ici = (p) => fileURLToPath(new URL(p, import.meta.url));
const { chercher, normaliser, typeDe } = await import(new URL('../../src/lib/recherche/moteur.ts', import.meta.url).href);
const { CATALOGUE } = await import(new URL('../../src/lib/recherche/catalogue.ts', import.meta.url).href);

const args = process.argv.slice(2);
const option = (nom) => (args.includes(nom) ? args[args.indexOf(nom) + 1] : undefined);
const tout = args.includes('--tout');
const lot = option('--lot');
const seuil = Number(option('--seuil') ?? 0);

const corpus = JSON.parse(readFileSync(ici('./corpus.json'), 'utf8')).phrases.filter((p) => !lot || String(p.lot) === lot);

const accepte = (attendue, cle) => cle === attendue || (!attendue.includes('#') && cle.startsWith(attendue + '#'));
const mots = (s) => new Set(normaliser(s).split(' ').map((m) => (m.length > 3 ? m.replace(/[sx]$/, '') : m)));

function filtresManquants(attendus, lus) {
  const manquants = [];
  for (const [cle, valeur] of Object.entries(attendus)) {
    const lu = lus[cle];
    let ok;
    if (cle === 'examen') ok = lu !== undefined && typeDe(valeur) === typeDe(lu);
    else if (cle === 'texte') ok = lu !== undefined && [...mots(valeur)].every((m) => mots(lu).has(m));
    else if (cle === 'nom') ok = lu !== undefined && normaliser(lu) === normaliser(valeur);
    else ok = lu === valeur;
    if (!ok) manquants.push(`${cle}=${valeur} (lu : ${lu ?? 'rien'})`);
  }
  return manquants;
}

let reussies = 0;
const echecs = [];
for (const p of corpus) {
  const r = chercher(p.phrase, CATALOGUE);
  const attendues = p.attendu.destinations;
  const premier = r.resultats[0];
  let raison = '';
  if (!attendues.length) {
    if (!r.refus && premier) raison = `refus attendu, rendu ${premier.cle}`;
  } else if (!premier) {
    raison = r.refus ? `refusée (${r.refus})` : 'aucun résultat';
  } else if (!attendues.some((a) => accepte(a, premier.cle))) {
    raison = `rendu ${r.resultats.map((x) => `${x.cle} (${x.score.toFixed(1)})`).join(', ')}`;
  } else {
    const manquants = filtresManquants(p.attendu.filtres, premier.filtres);
    if (manquants.length) raison = `filtres : ${manquants.join(' ; ')}`;
  }
  if (raison) echecs.push({ p, raison });
  else reussies++;
  if (tout) {
    const rendu = r.refus ? `refus ${r.refus}` : r.resultats.map((x) => x.cle).join(', ') || 'rien';
    console.log(`${raison ? 'ÉCHEC' : 'ok   '} ${p.id}  ${p.phrase}\n        → ${rendu} ${JSON.stringify(premier?.filtres ?? {})}${r.ignores.length ? ` ignorés : ${r.ignores.join(', ')}` : ''}`);
  }
}

const taux = corpus.length ? (100 * reussies) / corpus.length : 0;
if (!tout) for (const { p, raison } of echecs) console.log(`ÉCHEC ${p.id}  ${p.phrase}\n        ${raison}`);
console.log(`\n${reussies} / ${corpus.length} phrases (${taux.toFixed(0)} %)${lot ? `, lot ${lot}` : ''}, étage 1 seul.`);
if (seuil && taux < seuil) process.exit(1);
