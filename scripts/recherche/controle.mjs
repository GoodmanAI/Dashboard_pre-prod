#!/usr/bin/env node
// Contrôle de la recherche centrale (R6 du plan `2026-10-recherche-centrale-dashboard.md`).
// Lancé par `scripts/verify_changed.py` du workspace sur tout changement du Dashboard.
//
//   node --experimental-strip-types --no-warnings scripts/recherche/controle.mjs
//
// Il refuse :
//   1. un écran client (`page.tsx` sous `src/app/client/c/[userId]/`) sans fiche dans le
//      catalogue, sauf ceux de la liste EXEMPTS (avec la raison) ;
//   2. une fiche dont l'écran n'est pas dans le registre du panneau (`registre.tsx`) ;
//   3. une fiche à ancre (`talk/parametrage#horaires`) dont l'ancre n'existe pas dans le code
//      de son écran : la barre y mènerait sans rien montrer ;
//   4. une section (`<Accordion>`) des deux écrans de Paramétrage sans ancre de fiche : c'est
//      un réglage que la barre ne trouverait pas.
// La granularité est l'écran et la section, pas le champ : un champ ajouté dans une section
// qui a sa fiche se trouve par elle, à condition d'ajouter ses mots à `termes`.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('../../', import.meta.url));
const ecrans = join(racine, 'src/app/client/c/[userId]');
const { CATALOGUE } = await import(new URL('../../src/lib/recherche/catalogue.ts', import.meta.url).href);

/** Écrans client sans fiche, et pourquoi. */
const EXEMPTS = {
  konnect: "accueil du portail : des tuiles vers les autres écrans, qui ont leur fiche",
  'talk/support': 'tickets : hors périmètre de la recherche (R4)',
  'talk/support/[id]': 'tickets : hors périmètre de la recherche (R4)',
  'konnect/support': 'tickets : hors périmètre de la recherche (R4)',
  'konnect/support/[id]': 'tickets : hors périmètre de la recherche (R4)',
  'talk/calls/details/[callId]': "détail d'un appel : ouvert depuis la liste des appels",
  'konnect/regles-coexistence': 'redirige vers paires-examens',
};

/** Sections des Paramétrage sans fiche propre, et pourquoi. */
const SANS_FICHE = {
  'talk/parametrage': {
    lien_mapping_exam: 'un bouton vers la correspondance des examens, qui a sa fiche',
    lien_questions_exam: 'un bouton vers les questions par examen, qui ont leur fiche',
  },
};
const PARAMETRAGES = ['talk/parametrage', 'konnect/parametrage'];

const erreurs = [];
const chemins = new Set(CATALOGUE.map((f) => f.cle.split('#')[0]));

function pages(dossier) {
  const out = [];
  for (const nom of readdirSync(dossier)) {
    const p = join(dossier, nom);
    if (statSync(p).isDirectory()) out.push(...pages(p));
    else if (nom === 'page.tsx') out.push(relative(ecrans, dossier).split('\\').join('/'));
  }
  return out;
}

function codeDe(chemin) {
  const dossier = join(ecrans, chemin);
  return readdirSync(dossier)
    .filter((n) => n.endsWith('.tsx'))
    .map((n) => readFileSync(join(dossier, n), 'utf8'))
    .join('\n');
}

// 1. Chaque écran a sa fiche.
for (const produit of ['talk', 'konnect']) {
  for (const chemin of pages(join(ecrans, produit))) {
    if (!chemins.has(chemin) && !EXEMPTS[chemin]) {
      erreurs.push(`écran sans fiche : ${chemin} (ajouter une fiche à src/lib/recherche/catalogue.ts, ou une exemption motivée ici)`);
    }
  }
}

// 2. Chaque fiche a son écran au registre.
const registre = readFileSync(join(racine, 'src/components/recherche/registre.tsx'), 'utf8');
const auRegistre = new Set([...registre.matchAll(/^ {2}"?([a-z0-9/_-]+)"?: \{/gm)].map((m) => m[1]));
for (const chemin of chemins) {
  if (!auRegistre.has(chemin)) erreurs.push(`fiche sans écran au registre : ${chemin} (src/components/recherche/registre.tsx)`);
  if (!existsSync(join(ecrans, chemin, 'page.tsx'))) erreurs.push(`fiche vers un écran qui n'existe pas : ${chemin}`);
}

// 3. Chaque ancre existe dans son écran.
for (const f of CATALOGUE) {
  const [chemin, ancre] = f.cle.split('#');
  if (!ancre || !existsSync(join(ecrans, chemin))) continue;
  if (!codeDe(chemin).includes(`"${ancre}"`)) {
    erreurs.push(`ancre absente : ${f.cle} (poser id="${ancre}" sur la section dans l'écran)`);
  }
}

// 4. Chaque section des Paramétrage a une ancre de fiche.
for (const chemin of PARAMETRAGES) {
  const ancres = new Set(CATALOGUE.filter((f) => f.cle.startsWith(chemin + '#')).map((f) => f.cle.split('#')[1]));
  const permises = SANS_FICHE[chemin] ?? {};
  const dossier = join(ecrans, chemin);
  for (const nom of readdirSync(dossier).filter((n) => n.endsWith('.tsx'))) {
    const code = readFileSync(join(dossier, nom), 'utf8');
    for (const m of code.matchAll(/^[ \t]*<Accordion(?=[\s>])[^>]*>/gm)) {
      const balise = m[0];
      if (balise.includes('disableGutters')) continue; // section repliée dans une autre
      // Les cartes montées par l'écran portent l'ancre sur leur enveloppe, pas sur l'accordéon.
      if (nom !== 'Ecran.tsx' && nom !== 'page.tsx') continue;
      const id = balise.match(/id="([^"]+)"/)?.[1];
      const ligne = code.slice(0, m.index).split('\n').length;
      if (!id) erreurs.push(`section sans ancre : ${chemin}/${nom}:${ligne} (id="…" et une fiche dans le catalogue)`);
      else if (!ancres.has(id) && !permises[id]) {
        erreurs.push(`section sans fiche : ${chemin}#${id} (${nom}:${ligne})`);
      }
    }
  }
}

if (erreurs.length) {
  console.error(`Recherche centrale : ${erreurs.length} écart(s) entre les écrans et le catalogue.`);
  for (const e of erreurs) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`Recherche centrale : ${CATALOGUE.length} fiches, écrans, registre et ancres d'accord.`);
