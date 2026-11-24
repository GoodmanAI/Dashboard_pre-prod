import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { besoinDeRoute } from "./accesInternes";

/**
 * Chaque route d'API du Dashboard est rangée dans `CARTE_API` (24/11/2026). Une route
 * absente est refusée à un compte interne : sans ce test, une route ajoutée demain
 * casserait un écran de l'équipe sans que rien ne le dise avant la mise en ligne.
 * Lancé par `verify_changed.py` avec les autres tests de `src/lib`.
 */
// vitest se lance depuis la racine du dépôt (npm run pilot:test, verify_changed.py).
const RACINE = process.cwd();

function routes(dossier: string): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) out.push(...routes(chemin));
    else if (/^route\.(ts|js)$/.test(nom)) out.push(chemin);
  }
  return out;
}

/** `src/app/api/calls/[id]/flag/route.ts` → `/api/calls/1/flag`. */
function adresse(fichier: string): string {
  const rel = relative(join(RACINE, "src", "app"), fichier).split(sep).join("/").replace(/\/route\.(ts|js)$/, "");
  return "/" + rel.replace(/\[\.\.\.[^\]]+\]/g, "a/b").replace(/\[[^\]]+\]/g, "1");
}

describe("carte des routes d'API pour les comptes internes", () => {
  const toutes = routes(join(RACINE, "src", "app", "api"))
    .map(adresse)
    .filter((a) => !a.startsWith("/api/pilot/"))
    .concat(["/api/socket"]);

  it("trouve les routes", () => {
    expect(toutes.length).toBeGreaterThan(100);
  });

  it("range chaque route", () => {
    const absentes = toutes.filter((a) => besoinDeRoute(a) === null);
    expect(absentes, "routes absentes de CARTE_API (src/lib/accesInternes.ts)").toEqual([]);
  });
});
