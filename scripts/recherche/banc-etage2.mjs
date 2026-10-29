#!/usr/bin/env node
// Banc de l'étage 2 de la recherche centrale (plan workspace
// `plans/2026-10-recherche-llm-et-voix.md`, § 3).
//
//   node --experimental-strip-types --no-warnings scripts/recherche/banc-etage2.mjs
//
// Envoie chaque phrase de `corpus-etage2.json` à la fonction Azure `recherche_dashboard`,
// avec le vrai catalogue, comme le fait `src/lib/recherche/etage2.ts`, et compte les bonnes
// destinations, les filtres lus, la durée et les jetons en cache.
//
// Cible : `RECHERCHE_FONCTION_URL` (défaut : `func start` local), clé `RECHERCHE_FONCTION_CLE`
// (inutile en local). `--deploiement gpt-4.1-mini` ne change rien ici : le modèle se règle
// dans la fonction (`RECHERCHE_LLM_DEPLOYMENT` de `local.settings.json` ou du slot).
// Les noms des phrases sont inventés : rien de réel ne part chez Azure.
import { readFileSync } from 'node:fs';

const racine = new URL('../../', import.meta.url);
const { CATALOGUE } = await import(new URL('src/lib/recherche/catalogue.ts', racine).href);
const M = await import(new URL('src/lib/recherche/moteur.ts', racine).href);
const corpus = JSON.parse(readFileSync(new URL('scripts/recherche/corpus-etage2.json', racine), 'utf8'));

const url = process.env.RECHERCHE_FONCTION_URL || 'http://localhost:7071/api/recherche_dashboard';
const cle = process.env.RECHERCHE_FONCTION_CLE;
const catalogue = CATALOGUE.map(({ cle, produit, genre, libelle, filtres, termes }) => ({
  cle, produit, genre, libelle, filtres: filtres ?? [], termes,
}));
const valeurs = { periode: M.VALEURS_PERIODE, type: M.VALEURS_TYPE, issue: M.VALEURS_ISSUE, etat: M.VALEURS_ETAT };
const accepte = (a, c) => c === a || (!a.includes('#') && c?.startsWith(a + '#'));

let justes = 0;
const durees = [];
let entree = 0, cache = 0;
for (const p of corpus.phrases) {
  const debut = Date.now();
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cle ? { 'x-functions-key': cle } : {}) },
    body: JSON.stringify({ phrase: p.phrase, produits: ['talk', 'konnect'], catalogue, valeurs }),
  });
  const ms = Date.now() - debut;
  const s = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.log(`ERREUR ${p.id} ${r.status} ${s.error ?? ''}`);
    continue;
  }
  durees.push(ms);
  entree += s.jetons?.entree ?? 0;
  cache += s.jetons?.cache ?? 0;
  const attendues = p.attendu.destinations;
  const bonne = attendues.length ? attendues.some((a) => accepte(a, s.cle)) : s.cle === null;
  const manquants = Object.entries(p.attendu.filtres).filter(([k, v]) => s.filtres?.[k] !== v);
  const ok = bonne && !manquants.length;
  if (ok) justes++;
  console.log(
    `${ok ? 'ok    ' : 'ÉCHEC '} ${p.id} ${ms} ms  ${s.cle ?? 'null'} ${JSON.stringify(s.filtres ?? {})}` +
      (ok ? '' : `\n        attendu ${attendues.join(' ou ') || 'null'} ${JSON.stringify(p.attendu.filtres)}  « ${p.phrase} »`)
  );
}
durees.sort((a, b) => a - b);
const median = durees[Math.floor(durees.length / 2)] ?? 0;
console.log(
  `\n${justes} / ${corpus.phrases.length} (${Math.round((100 * justes) / corpus.phrases.length)} %), ` +
    `médiane ${median} ms, max ${durees.at(-1) ?? 0} ms, jetons en cache ${cache} / ${entree} (${entree ? Math.round((100 * cache) / entree) : 0} %)`
);
