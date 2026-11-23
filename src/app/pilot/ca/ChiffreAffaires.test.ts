import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import type { DonneesCa } from "@/pilot/lib/ca/donnees";

// Harnais sans DOM : exécute les gestionnaires du vrai composant et ses effets,
// puis inspecte ses valeurs rendues. Les composants graphiques ne sont pas montés.
const hooks = vi.hoisted(() => ({ index: 0, etats: [] as unknown[], effets: [] as Array<() => unknown> }));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return { ...react,
    useState: (initial: unknown) => {
      const i = hooks.index++;
      if (!(i in hooks.etats)) hooks.etats[i] = typeof initial === "function" ? initial() : initial;
      return [hooks.etats[i], (v: unknown) => { hooks.etats[i] = typeof v === "function" ? v(hooks.etats[i]) : v; }];
    },
    useMemo: (calcul: () => unknown) => calcul(),
    useEffect: (effet: () => unknown) => { hooks.effets.push(effet); },
  };
});
vi.mock("@mui/material", async (original) => ({ ...await original<typeof import("@mui/material")>(),
  useTheme: () => ({ palette: { divider: "gray", primary: { main: "blue" }, secondary: { main: "gray" }, success: { main: "green" } } }),
}));
import * as React from "react";
import { ChiffreAffaires } from "./ChiffreAffaires";
const d: DonneesCa = {
  formations: [],
  contrats: [], scenarios: [], variableDisponible: false, variableMensuelleParLigne: [], moisMoyenne: 0, reel: [], contratsASaisir: [],
  opportunites: [{ id: 1, organisationId: 2, organisationNom: "Organisation test", productId: 3, produit: "LyraeTalk", libelle: "Essai",
    etape: "PROPOSITION", montantMensuelCentimes: 101, montantMiseEnServiceCentimes: 101, probabilite: 33, probabiliteForcee: true,
    categoriePrevision: "PROBABLE", demarrageAttenduLe: "2026-11-01T00:00:00.000Z", gagneeLe: null, perdueLe: null }],
};
type Element = ReactElement<Record<string, unknown>>;
function elements(noeud: ReactNode): Element[] {
  if (Array.isArray(noeud)) return noeud.flatMap(elements);
  if (!React.isValidElement<Record<string, unknown>>(noeud)) return [];
  return [noeud, ...elements(noeud.props.children as ReactNode), ...elements(noeud.props.control as ReactNode)];
}
const courant = { mois: "2026-10-01T00:00:00.000Z", recurrent: 0, miseEnService: 0, variableAuJour: 0, variableProjetee: 0, jour: 12, joursDuMois: 31, motifs: [] };
function rendre(donnees = d, moisDepart = "2026-10-01T00:00:00.000Z") {
  hooks.index = 0; hooks.effets = [];
  const arbre = elements(ChiffreAffaires({ donnees, scenarioInitial: null, moisDepart, moisCourant: courant, peutExporter: true }));
  for (const effet of hooks.effets) effet();
  return arbre;
}
beforeEach(() => {
  hooks.etats = []; hooks.index = 0;
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Aucun aller-retour attendu"); }));
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
it("recalcule les 24 mois à chaque coche et mouvement de curseur sans aucun fetch", () => {
  let arbre = rendre();
  const lignes = () => arbre.filter((e) => e.props["data-mois"]);
  expect(lignes()).toHaveLength(24);
  expect(lignes()[1].props["data-pondere"]).toBe(67);
  const cocher = (checked: boolean) => {
    const caseA = arbre.find((e) => (e.props.inputProps as Record<string, string> | undefined)?.["aria-label"] === "Compter Essai dans la projection")!;
    (caseA.props.onChange as (e: unknown) => void)({ target: { checked } }); arbre = rendre();
  };
  cocher(false); expect(lignes()[1].props["data-pondere"]).toBe(0);
  cocher(true); expect(lignes()[1].props["data-pondere"]).toBe(67);
  const curseur = arbre.find((e) => e.props["aria-label"] === "Décaler le démarrage de Essai")!;
  expect([curseur.props.min, curseur.props.max, curseur.props.step]).toEqual([-6,12,1]);
  (curseur.props.onChange as (e: unknown, n: number) => void)(null,2); arbre = rendre();
  expect(lignes()[1].props["data-pondere"]).toBe(0); expect(lignes()[3].props["data-pondere"]).toBe(67);
  const retablir = arbre.find((e) => e.props.children === "Rétablir")!;
  (retablir.props.onClick as () => void)(); arbre = rendre();
  expect(lignes()[1].props["data-pondere"]).toBe(67);
  expect(fetch).not.toHaveBeenCalled();
});
it("rejoue la comparaison au réel figé à chaque coche, sans aucun fetch", () => {
  const avecReel: DonneesCa = { ...d, variableDisponible: true, moisMoyenne: 2,
    reel: [{ mois: "2026-11-01T00:00:00.000Z", totalCentimes: 100 }, { mois: "2026-12-01T00:00:00.000Z", totalCentimes: 40 }] };
  let arbre = rendre(avecReel, "2027-01-01T00:00:00.000Z");
  const mois = () => arbre.filter((e) => e.props["data-reel-mois"]).map((e) => [e.props["data-reel"], e.props["data-projete"], e.props["data-ecart"]]);
  expect(mois()).toEqual([[100, 67, 33], [40, 33, 7]]);
  expect(arbre.some((e) => e.props.children === "Moyenne des 2 derniers mois figés.")).toBe(true);
  const caseA = arbre.find((e) => (e.props.inputProps as Record<string, string> | undefined)?.["aria-label"] === "Compter Essai dans la projection")!;
  (caseA.props.onChange as (e: unknown) => void)({ target: { checked: false } }); arbre = rendre(avecReel, "2027-01-01T00:00:00.000Z");
  expect(mois()).toEqual([[100, 0, 100], [40, 0, 40]]);
  expect(fetch).not.toHaveBeenCalled();
});
