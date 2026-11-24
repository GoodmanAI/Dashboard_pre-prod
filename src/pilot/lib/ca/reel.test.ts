import { describe, expect, it } from "vitest";
import type { Compteurs } from "./compteurs";
import { pourMille } from "./etat";
import { projeter } from "./projeter";
import { cleCa, MOTIF_SANS_PRODUIT, MOTIF_SMS, moisIso, moyenneDesMoisFiges, moyenneEntiere, reelDuMois, variableParLigne, type ContratReel, type LigneContratReel } from "./reel";

const date = (s: string) => new Date(s);
const oct = date("2026-10-01");
let id = 0;
const ligne = (champs: Partial<LigneContratReel> & Pick<LigneContratReel, "type">): LigneContratReel =>
  ({ id: ++id, productId: 10, centreId: null, montantCentimes: 0, unite: null, volumeInclus: null, ...champs });
const contrat = (lignes: LigneContratReel[], champs: Partial<ContratReel> = {}): ContratReel =>
  ({ organisationId: 1, statut: "ACTIF", debuteLe: date("2026-10-15"), signeLe: null, termineLe: null, lignes, ...champs });
const rattachements = [
  { organisationId: 1, productId: 10, centreId: 100, userProductId: 500 },
  { organisationId: 1, productId: 10, centreId: 101, userProductId: 501 },
  // Même produit chez une autre organisation : jamais compté pour l'organisation 1.
  { organisationId: 2, productId: 10, centreId: 200, userProductId: 502 },
];
const usage = new Map<number, Compteurs>([
  [500, { APPEL_TRAITE: 300, RDV_PRIS: 40, SMS_ENVOYE: null }],
  [501, { APPEL_TRAITE: 50, RDV_PRIS: 5, SMS_ENVOYE: null }],
  [502, { APPEL_TRAITE: 9999, RDV_PRIS: 999, SMS_ENVOYE: null }],
]);
const reel = (contrats: ContratReel[], mois = oct) => reelDuMois({ mois, contrats, rattachements, usage });
const variable = (champs: Partial<LigneContratReel> = {}) => ligne({ type: "PART_VARIABLE", montantCentimes: 35, unite: "APPEL_TRAITE", volumeInclus: 200, ...champs });

describe("reelDuMois, réel d'un mois en centimes entiers", () => {
  it("compte abonnement, mise en service du mois de début et part variable au-delà du volume inclus", () => {
    const { lignes, motifs } = reel([contrat([ligne({ type: "ABONNEMENT", montantCentimes: 90000 }), ligne({ type: "MISE_EN_SERVICE", montantCentimes: 250000 }), variable()])]);
    expect(lignes).toEqual([{ cle: "2026-10|1|10|0", mois: oct, organisationId: 1, productId: 10, centreId: null,
      recurrentCentimes: 90000, miseEnServiceCentimes: 250000, variableCentimes: (350 - 200) * 35, volumeVariable: 350, uniteVariable: "APPEL_TRAITE" }]);
    expect(motifs).toEqual([]);
  });
  it("ne compte la mise en service que le mois de début", () => {
    const c = contrat([ligne({ type: "ABONNEMENT", montantCentimes: 90000 }), ligne({ type: "MISE_EN_SERVICE", montantCentimes: 250000 })]);
    expect(reel([c], date("2026-11-01")).lignes[0]).toMatchObject({ cle: "2026-11|1|10|0", recurrentCentimes: 90000, miseEnServiceCentimes: 0 });
    expect(reel([{ ...c, debuteLe: null, signeLe: date("2026-09-30") }]).lignes[0].miseEnServiceCentimes).toBe(0);
  });
  it("borne la part variable à zéro sous le volume inclus, volume inclus absent compté à zéro", () => {
    expect(reel([contrat([variable({ volumeInclus: 1000 })])]).lignes[0]).toMatchObject({ variableCentimes: 0, volumeVariable: 350 });
    expect(reel([contrat([variable({ volumeInclus: null })])]).lignes[0]).toMatchObject({ variableCentimes: 350 * 35, volumeVariable: 350 });
  });
  it("une ligne de centre ne compte que son centre, une ligne d'organisation tous ses centres", () => {
    const { lignes } = reel([contrat([variable({ centreId: 100, volumeInclus: 0 }), variable({ volumeInclus: 0 }), ligne({ type: "ABONNEMENT", centreId: 101, montantCentimes: 100 })])]);
    expect(lignes.map((l) => [l.cle, l.volumeVariable, l.variableCentimes, l.recurrentCentimes])).toEqual([
      ["2026-10|1|10|0", 350, 350 * 35, 0], ["2026-10|1|10|100", 300, 300 * 35, 0], ["2026-10|1|10|101", null, 0, 100],
    ]);
  });
  it("additionne les lignes d'une même clé, sans volume quand deux unités s'y mêlent", () => {
    const deux = reel([contrat([variable(), variable({ unite: "RDV_PRIS", montantCentimes: 100, volumeInclus: 0 })]), contrat([ligne({ type: "ABONNEMENT", montantCentimes: 200 })], { debuteLe: date("2026-01-01") })]);
    expect(deux.lignes).toHaveLength(1);
    expect(deux.lignes[0]).toMatchObject({ variableCentimes: 150 * 35 + 45 * 100, recurrentCentimes: 200, volumeVariable: null, uniteVariable: null });
    const meme = reel([contrat([variable(), variable({ montantCentimes: 10, volumeInclus: 300 })])]).lignes[0];
    expect(meme).toMatchObject({ variableCentimes: 150 * 35 + 50 * 10, volumeVariable: 350, uniteVariable: "APPEL_TRAITE" });
  });
  it("compteur de SMS absent : variable nulle, volume inconnu et motif", () => {
    const { lignes, motifs } = reel([contrat([variable({ unite: "SMS_ENVOYE", volumeInclus: 0 })])]);
    expect(lignes[0]).toMatchObject({ variableCentimes: 0, volumeVariable: null, uniteVariable: "SMS_ENVOYE" });
    expect(motifs).toEqual([MOTIF_SMS]);
  });
  it("compte un contrat terminé jusqu'au mois de sa fin, jamais un brouillon", () => {
    const abonnement = () => [ligne({ type: "ABONNEMENT", montantCentimes: 100 })];
    expect(reel([contrat(abonnement(), { statut: "TERMINE", debuteLe: date("2026-01-01"), termineLe: date("2026-10-05") })]).lignes).toHaveLength(1);
    expect(reel([contrat(abonnement(), { statut: "TERMINE", debuteLe: date("2026-01-01"), termineLe: date("2026-09-30") })]).lignes).toEqual([]);
    expect(reel([contrat(abonnement(), { statut: "BROUILLON" }), contrat(abonnement(), { debuteLe: date("2026-11-01") })]).lignes).toEqual([]);
  });
  it("clé et mois ISO indépendants de l'heure", () => {
    expect(moisIso(date("2026-10-31T23:59:59Z"))).toBe("2026-10");
    expect(cleCa(date("2026-10-20"), 1, 10, null)).toBe("2026-10|1|10|0");
    expect(reel([contrat([ligne({ type: "ABONNEMENT", montantCentimes: 1 })])], date("2026-10-20T12:00:00Z")).lignes[0].mois).toEqual(oct);
  });
});

describe("moyenne des mois figés pour la projection", () => {
  const fige = (mois: string, organisationId: number, variableCentimes: number) => ({ mois: date(mois), organisationId, productId: 10, centreId: null, variableCentimes });
  it("prend les trois derniers mois figés, chaque clé sur ses mois disponibles", () => {
    const { parCle, mois } = moyenneDesMoisFiges([
      fige("2026-07-01", 1, 100), fige("2026-08-01", 1, 200), fige("2026-09-01", 1, 300), fige("2026-10-01", 1, 401),
      fige("2026-10-01", 2, 7), fige("2026-09-01", 3, 1), fige("2026-10-01", 3, 2),
    ]);
    expect(mois).toEqual([date("2026-08-01"), date("2026-09-01"), date("2026-10-01")]);
    expect(parCle).toEqual(new Map([["1|10|0", 300], ["2|10|0", 7], ["3|10|0", 2]]));
  });
  it("un ou deux mois figés suffisent", () => {
    expect(moyenneDesMoisFiges([fige("2026-10-01", 1, 5)])).toEqual({ parCle: new Map([["1|10|0", 5]]), mois: [oct] });
    expect(moyenneDesMoisFiges([fige("2026-09-01", 1, 5), fige("2026-10-01", 1, 10)]).parCle.get("1|10|0")).toBe(8);
    expect(moyenneDesMoisFiges([])).toEqual({ parCle: new Map(), mois: [] });
  });
  it("arrondit en entier, demis vers le haut", () => {
    expect([moyenneEntiere([1, 2]), moyenneEntiere([1, 1, 2]), moyenneEntiere([2, 2, 1]), moyenneEntiere([]), moyenneEntiere([-1, -2])]).toEqual([2, 1, 2, 0, -2]);
  });
  it("attribue la moyenne à la première ligne variable des contrats comptés, une fois par clé", () => {
    const actif = contrat([variable({ id: 7 }), variable({ id: 3 }), variable({ id: 9, centreId: 100 })], { debuteLe: date("2026-01-01") });
    const termine = contrat([variable({ id: 1 })], { statut: "TERMINE", debuteLe: date("2025-01-01"), termineLe: date("2026-06-01") });
    expect(variableParLigne([termine, actif], new Map([["1|10|0", 300]]), oct)).toEqual(new Map([[3, 300]]));
  });
});

describe("écart au réel en pour-mille", () => {
  it("arrondit au pour-mille, garde le signe et refuse une base nulle", () => {
    expect([pourMille(1, 3), pourMille(-1, 3), pourMille(1, 2000), pourMille(-1, 2000), pourMille(33, 67), pourMille(0, 5), pourMille(5, 0)])
      .toEqual([333, -333, 1, -1, 493, 0, null]);
  });
});

describe("lot S : prestation, ligne sans produit, ligne offerte", () => {
  it("une prestation est figée au mois du début, dans la colonne des montants une fois, pas les mois suivants", () => {
    const c = contrat([ligne({ type: "ABONNEMENT", montantCentimes: 90000 }), ligne({ type: "PRESTATION", montantCentimes: 150000 })]);
    expect(reel([c]).lignes).toEqual([expect.objectContaining({ cle: "2026-10|1|10|0", recurrentCentimes: 90000, miseEnServiceCentimes: 150000 })]);
    expect(reel([c], date("2026-11-01")).lignes[0]).toMatchObject({ recurrentCentimes: 90000, miseEnServiceCentimes: 0 });
  });
  it("une prestation seule sur sa clé n'écrit une ligne qu'au mois où elle compte", () => {
    const c = contrat([ligne({ type: "ABONNEMENT", montantCentimes: 90000 }), ligne({ type: "PRESTATION", productId: null, montantCentimes: 150000 })]);
    expect(reel([c]).lignes.map((l) => [l.cle, l.recurrentCentimes, l.miseEnServiceCentimes])).toEqual([["2026-10|1|0|0", 0, 150000], ["2026-10|1|10|0", 90000, 0]]);
    expect(reel([c], date("2026-11-01")).lignes.map((l) => l.cle)).toEqual(["2026-11|1|10|0"]);
  });
  it("sans début ni signature, ou dans un brouillon, rien ; un contrat terminé avant le mois, rien", () => {
    const lignes = () => [ligne({ type: "PRESTATION", montantCentimes: 150000 })];
    expect(reel([contrat(lignes(), { debuteLe: null, signeLe: null }), contrat(lignes(), { statut: "BROUILLON" })]).lignes).toEqual([]);
    expect(reel([contrat(lignes(), { statut: "TERMINE", debuteLe: date("2026-10-02"), termineLe: date("2026-10-20") })]).lignes[0].miseEnServiceCentimes).toBe(150000);
    expect(reel([contrat(lignes(), { statut: "TERMINE", debuteLe: date("2026-08-02"), termineLe: date("2026-09-20") })]).lignes).toEqual([]);
  });
  it("une ligne sans produit a la clé produit 0, comme le centre, et un produit vide", () => {
    const { lignes } = reel([contrat([ligne({ type: "ABONNEMENT", productId: null, centreId: 100, montantCentimes: 4062 })])]);
    expect(lignes).toEqual([{ cle: "2026-10|1|0|100", mois: oct, organisationId: 1, productId: null, centreId: 100,
      recurrentCentimes: 4062, variableCentimes: 0, miseEnServiceCentimes: 0, volumeVariable: null, uniteVariable: null }]);
    expect(cleCa(oct, 1, null, null)).toBe("2026-10|1|0|0");
  });
  it("une part à l'usage sans produit n'a pas de compteur : zéro, et l'écran dit pourquoi", () => {
    const { lignes, motifs } = reel([contrat([variable({ productId: null, volumeInclus: 0 })])]);
    expect(lignes[0]).toMatchObject({ cle: "2026-10|1|0|0", variableCentimes: 0, volumeVariable: null });
    expect(motifs).toEqual([MOTIF_SANS_PRODUIT]);
  });
  it("une ligne offerte, à 0 dans le contrat, ne change aucun montant", () => {
    const base = [ligne({ type: "ABONNEMENT", montantCentimes: 90000 }), ligne({ type: "MISE_EN_SERVICE", montantCentimes: 250000 })];
    const avec = [...base, ligne({ type: "MISE_EN_SERVICE", montantCentimes: 0 }), ligne({ type: "ABONNEMENT", montantCentimes: 0 })];
    expect(reel([contrat(avec)]).lignes).toEqual(reel([contrat(base)]).lignes);
  });
  it("la moyenne figée d'une clé sans produit revient à sa ligne variable", () => {
    const c = contrat([variable({ id: 900, productId: null })], { debuteLe: date("2026-01-01") });
    const { parCle } = moyenneDesMoisFiges([{ mois: date("2026-09-01"), organisationId: 1, productId: null, centreId: null, variableCentimes: 40 }]);
    expect(parCle).toEqual(new Map([["1|0|0", 40]]));
    expect(variableParLigne([c], parCle, oct)).toEqual(new Map([[900, 40]]));
  });
});

describe("lot S : cas limites du réel (clés partagées, dates, lignes à zéro)", () => {
  const nov = date("2026-11-01");
  it("deux prestations sur la même clé s'additionnent sur une seule ligne", () => {
    const { lignes } = reel([contrat([ligne({ type: "PRESTATION", montantCentimes: 100000 }), ligne({ type: "PRESTATION", montantCentimes: 50001 })])]);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ cle: "2026-10|1|10|0", recurrentCentimes: 0, miseEnServiceCentimes: 150001 });
  });
  it("une prestation et une installation de la même clé s'additionnent dans les montants une fois", () => {
    const { lignes } = reel([contrat([ligne({ type: "MISE_EN_SERVICE", montantCentimes: 62500 }), ligne({ type: "PRESTATION", montantCentimes: 150000 })])]);
    expect(lignes.map((l) => [l.cle, l.miseEnServiceCentimes])).toEqual([["2026-10|1|10|0", 212500]]);
  });
  it("un abonnement et une prestation sans produit partagent la clé produit 0", () => {
    const lignesSansProduit = () => [ligne({ type: "ABONNEMENT", productId: null, montantCentimes: 4062 }), ligne({ type: "PRESTATION", productId: null, montantCentimes: 150000 })];
    const { lignes } = reel([contrat(lignesSansProduit())]);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ cle: "2026-10|1|0|0", productId: null, recurrentCentimes: 4062, miseEnServiceCentimes: 150000 });
    expect(reel([contrat(lignesSansProduit())], nov).lignes[0]).toMatchObject({ cle: "2026-11|1|0|0", recurrentCentimes: 4062, miseEnServiceCentimes: 0 });
  });
  it("un abonnement et une part à l'usage sans produit : la part est à 0, avec son motif, l'abonnement est compté", () => {
    const { lignes, motifs } = reel([contrat([ligne({ type: "ABONNEMENT", productId: null, montantCentimes: 4062 }), variable({ productId: null, volumeInclus: 0 })])]);
    expect(lignes).toEqual([{ cle: "2026-10|1|0|0", mois: oct, organisationId: 1, productId: null, centreId: null,
      recurrentCentimes: 4062, variableCentimes: 0, miseEnServiceCentimes: 0, volumeVariable: null, uniteVariable: null }]);
    expect(motifs).toEqual([MOTIF_SANS_PRODUIT]);
  });
  it("un contrat qui débute le 31 compte tout ce mois-là, et le suivant sans mise en service", () => {
    const c = (debuteLe: string) => contrat([ligne({ type: "ABONNEMENT", montantCentimes: 100 }), ligne({ type: "MISE_EN_SERVICE", montantCentimes: 500 })], { debuteLe: date(debuteLe) });
    expect(reel([c("2026-10-31")]).lignes[0]).toMatchObject({ recurrentCentimes: 100, miseEnServiceCentimes: 500 });
    expect(reel([c("2026-10-31T23:59:59Z")]).lignes[0]).toMatchObject({ recurrentCentimes: 100, miseEnServiceCentimes: 500 });
    expect(reel([c("2026-10-31")], nov).lignes[0]).toMatchObject({ recurrentCentimes: 100, miseEnServiceCentimes: 0 });
    expect(reel([c("2026-10-31")], date("2026-09-01")).lignes).toEqual([]);
    expect(reel([c("2026-08-31")]).lignes[0].miseEnServiceCentimes).toBe(0);
  });
  it("sans début, la signature en tient lieu : mise en service le mois de signature, abonnement ensuite", () => {
    const c = contrat([ligne({ type: "ABONNEMENT", montantCentimes: 100 }), ligne({ type: "PRESTATION", montantCentimes: 700 })], { debuteLe: null, signeLe: date("2026-10-10") });
    expect(reel([c]).lignes[0]).toMatchObject({ recurrentCentimes: 100, miseEnServiceCentimes: 700 });
    expect(reel([c], nov).lignes[0]).toMatchObject({ recurrentCentimes: 100, miseEnServiceCentimes: 0 });
    expect(reel([c], date("2026-09-01")).lignes).toEqual([]);
  });
  it("un contrat terminé avant son début ne compte aucun mois", () => {
    const c = contrat([ligne({ type: "ABONNEMENT", montantCentimes: 100 }), ligne({ type: "PRESTATION", montantCentimes: 700 })],
      { statut: "TERMINE", debuteLe: date("2026-10-15"), termineLe: date("2026-09-30") });
    for (const mois of ["2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01"]) expect(reel([c], date(mois)).lignes).toEqual([]);
  });
  it("une ligne offerte (à 0) seule sur sa clé écrit une ligne à zéro : comportement accepté", () => {
    const { lignes } = reel([contrat([ligne({ type: "ABONNEMENT", productId: 11, montantCentimes: 0 }), ligne({ type: "PRESTATION", productId: 12, montantCentimes: 0 })])]);
    expect(lignes.map((l) => [l.cle, l.recurrentCentimes, l.variableCentimes, l.miseEnServiceCentimes])).toEqual([["2026-10|1|11|0", 0, 0, 0], ["2026-10|1|12|0", 0, 0, 0]]);
    // Hors de son mois, la prestation à zéro n'ouvre pas de clé.
    expect(reel([contrat([ligne({ type: "PRESTATION", productId: 12, montantCentimes: 0 })])], nov).lignes).toEqual([]);
  });
});

describe("parité : chaque mois, le réel figé et la projection comptent les mêmes montants", () => {
  const sans = (l: LigneContratReel) => ({ id: l.id, type: l.type, montantCentimes: l.montantCentimes });
  it("abonnements, installations, prestations et lignes sans produit, de tous les contrats", () => {
    const contrats: ContratReel[] = [
      contrat([ligne({ type: "ABONNEMENT", montantCentimes: 90001 }), ligne({ type: "MISE_EN_SERVICE", montantCentimes: 62500 }), ligne({ type: "PRESTATION", montantCentimes: 150000 }),
        ligne({ type: "PRESTATION", productId: null, montantCentimes: 777 }), ligne({ type: "ABONNEMENT", productId: null, centreId: 100, montantCentimes: 4062 }),
        variable({ productId: null })], { debuteLe: date("2026-10-31") }),
      contrat([ligne({ type: "ABONNEMENT", montantCentimes: 333 }), ligne({ type: "PRESTATION", productId: null, montantCentimes: 50 })], { organisationId: 2, debuteLe: null, signeLe: date("2026-09-12") }),
      contrat([ligne({ type: "ABONNEMENT", montantCentimes: 1000 }), ligne({ type: "MISE_EN_SERVICE", montantCentimes: 2000 })], { organisationId: 3, statut: "TERMINE", debuteLe: date("2026-08-05"), termineLe: date("2026-12-20") }),
      contrat([ligne({ type: "ABONNEMENT", montantCentimes: 5000 }), ligne({ type: "PRESTATION", montantCentimes: 9000 })], { organisationId: 4, statut: "TERMINE", debuteLe: date("2026-11-10"), termineLe: date("2026-10-01") }),
      contrat([ligne({ type: "ABONNEMENT", montantCentimes: 1 }), ligne({ type: "PRESTATION", montantCentimes: 1 })], { organisationId: 5, statut: "BROUILLON" }),
      contrat([ligne({ type: "ABONNEMENT", montantCentimes: 0 }), ligne({ type: "MISE_EN_SERVICE", montantCentimes: 0 })], { organisationId: 6, debuteLe: date("2026-11-30") }),
    ];
    const projection = projeter({ contrats: contrats.map((c) => ({ ...c, lignes: c.lignes.map(sans) })), opportunites: [], scenario: null,
      variableMensuelleParLigne: new Map(), moisDepart: date("2026-07-01"), nbMois: 10 });
    let moisAvecLignes = 0;
    for (const p of projection) {
      const { lignes } = reelDuMois({ mois: p.mois, contrats, rattachements, usage });
      const somme = (cle: "recurrentCentimes" | "variableCentimes" | "miseEnServiceCentimes") => lignes.reduce((s, l) => s + l[cle], 0);
      const mois = moisIso(p.mois);
      expect([mois, somme("recurrentCentimes") + somme("variableCentimes") + somme("miseEnServiceCentimes")]).toEqual([mois, p.signe]);
      expect([mois, somme("miseEnServiceCentimes")]).toEqual([mois, p.miseEnService]);
      expect([mois, somme("variableCentimes")]).toEqual([mois, p.variable]);
      if (lignes.length) moisAvecLignes++;
    }
    expect(moisAvecLignes).toBeGreaterThan(5);
    // La parité n'est pas triviale : installations, prestations et lignes sans produit sont bien comptées quelque part.
    expect(projection.reduce((s, p) => s + p.miseEnService, 0)).toBe(62500 + 150000 + 777 + 50 + 2000);
  });
});
