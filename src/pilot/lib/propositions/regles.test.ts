import { describe, expect, it } from "vitest";
import type { CrmStatutProposition } from "@prisma/client";
import { brutCalcule, montantContratCalcule, remiseEffective, ligneAuNet, pourMilleDepuisSaisie, montantNet, montantNetLigne, totauxProposition, transitionProposition, propositionExpiree, propositionEnAttente, versionQuiRemplace } from "./regles";

const statuts: CrmStatutProposition[] = ["BROUILLON", "ENVOYEE", "EN_DISCUSSION", "ACCEPTEE", "REFUSEE", "EXPIREE"];
const permises = ["BROUILLON:ENVOYEE", "ENVOYEE:EN_DISCUSSION", "ENVOYEE:ACCEPTEE", "ENVOYEE:REFUSEE", "ENVOYEE:EXPIREE", "EN_DISCUSSION:ACCEPTEE", "EN_DISCUSSION:REFUSEE", "EN_DISCUSSION:EXPIREE"];
describe("transitions des propositions", () => {
  it.each(statuts.flatMap((de) => statuts.map((vers) => ({ de, vers }))))("$de vers $vers", ({ de, vers }) => {
    expect(transitionProposition(de, vers)).toBe(permises.includes(de + ":" + vers));
  });
});
describe("centimes nets et totaux", () => {
  it.each([[333,125,291], [1,125,1], [1,500,1], [1,501,0], [333,0,333], [333,1000,0], [100000000,125,87500000], [Number.MAX_SAFE_INTEGER,0,Number.MAX_SAFE_INTEGER]])(
    "%i centimes à %i pour mille donnent %i", (brut, remise, net) => expect(montantNet(brut, remise)).toBe(net));
  it.each([[-1,0], [1.2,0], [1,-1], [1,1001], [1,12.5], [Number.MAX_SAFE_INTEGER + 1,0]])("refuse les valeurs non entières ou hors limites", (montant, remise) => expect(() => montantNet(montant,remise)).toThrow());
  it("additionne les arrondis des lignes et conserve chaque prix variable", () => {
    const lignes = [
      { type: "ABONNEMENT" as const, montantCentimes: 1 }, { type: "ABONNEMENT" as const, montantCentimes: 1 },
      { type: "MISE_EN_SERVICE" as const, montantCentimes: 333 },
      { type: "PART_VARIABLE" as const, montantCentimes: 46, unite: "APPEL_TRAITE" as const, volumeInclus: 500 },
    ];
    expect(totauxProposition(lignes, 500)).toMatchObject({ abonnementMensuelCentimes: 2, miseEnServiceCentimes: 167, brutMensuelCentimes: 2,
      prestationCentimes: 0, variables: [{ unite: "APPEL_TRAITE", prixNetCentimes: 23, volumeInclus: 500, offerte: false }] });
    expect(totauxProposition(lignes, 125).variables[0].prixNetCentimes).toBe(40);
    expect(totauxProposition(lignes, 0).miseEnServiceCentimes).toBe(333);
    expect(totauxProposition(lignes, 1000)).toMatchObject({ abonnementMensuelCentimes: 0, miseEnServiceCentimes: 0, variables: [{ prixNetCentimes: 0 }] });
    expect(totauxProposition([], 0)).toMatchObject({ abonnementMensuelCentimes: 0, miseEnServiceCentimes: 0, brutMensuelCentimes: 0, prestationCentimes: 0, variables: [] });
  });
});

describe("gestes commerciaux et totaux par type (lot S)", () => {
  type Ligne = Parameters<typeof totauxProposition>[0][number];
  const l = (type: Ligne["type"], montantCentimes: number, champs: Partial<Ligne> = {}): Ligne =>
    ({ type, montantCentimes, ...(type === "PART_VARIABLE" ? { unite: "APPEL_TRAITE" as const } : {}), ...champs });
  const lignes = [
    l("ABONNEMENT", 27083), l("ABONNEMENT", 7917), l("ABONNEMENT", 4062, { offerte: true }),
    l("MISE_EN_SERVICE", 62500, { offerte: true }), l("MISE_EN_SERVICE", 37500), l("PRESTATION", 150001),
    l("PART_VARIABLE", 35, { volumeInclus: 200 }), l("PART_VARIABLE", 12, { unite: "RDV_PRIS", offerte: true }),
  ];
  it("une ligne offerte a un net de 0 et garde son brut ; la remise ne porte que sur les autres, arrondie par ligne", () => {
    expect(montantNetLigne({ montantCentimes: 62500, offerte: true }, 125)).toBe(0);
    expect(montantNetLigne({ montantCentimes: 333, offerte: false }, 125)).toBe(montantNet(333, 125));
    expect(montantNetLigne({ montantCentimes: 333 }, 125)).toBe(291);
    const t = totauxProposition(lignes, 125);
    expect(t.parType.mensuel).toEqual({ brutCentimes: 39062, remiseCentimes: 39062 - 4062 - montantNet(27083, 125) - montantNet(7917, 125),
      gestesCentimes: 4062, netCentimes: montantNet(27083, 125) + montantNet(7917, 125) });
    expect(t.parType.uneFois).toEqual({ brutCentimes: 250001, remiseCentimes: (37500 - 32813) + (150001 - 131251), gestesCentimes: 62500, netCentimes: 32813 + 131251 });
    expect(t.parType.usage).toEqual({ brutCentimes: 47, remiseCentimes: 35 - 31, gestesCentimes: 12, netCentimes: 31 });
    expect(t.abonnementMensuelCentimes).toBe(t.parType.mensuel.netCentimes);
    expect(t.brutMensuelCentimes).toBe(39062);
    expect(t.miseEnServiceCentimes).toBe(32813);
    expect(t.prestationCentimes).toBe(131251);
    expect(t.variables).toEqual([
      { unite: "APPEL_TRAITE", prixNetCentimes: 31, volumeInclus: 200, offerte: false },
      { unite: "RDV_PRIS", prixNetCentimes: 0, volumeInclus: null, offerte: true },
    ]);
  });
  // Vrai par construction (la remise est calculée comme brut - net) : ce test garde la cohérence et les
  // entiers sûrs ; la preuve des montants est le test BigInt indépendant plus bas.
  it.each([0, 1, 125, 333, 500, 999, 1000])("cohérence par construction : brut = net + remise + gestes, à %i pour mille", (remise) => {
    const t = totauxProposition(lignes, remise);
    for (const part of [t.parType.mensuel, t.parType.uneFois, t.parType.usage]) {
      expect(part.brutCentimes).toBe(part.netCentimes + part.remiseCentimes + part.gestesCentimes);
      expect([part.brutCentimes, part.netCentimes, part.remiseCentimes, part.gestesCentimes].every((n) => Number.isSafeInteger(n) && n >= 0)).toBe(true);
    }
  });
  it("sans ligne offerte ni prestation, les montants d'avant ne bougent pas", () => {
    const classiques = [l("ABONNEMENT", 1), l("ABONNEMENT", 1), l("MISE_EN_SERVICE", 333), l("PART_VARIABLE", 46, { volumeInclus: 500 })];
    const t = totauxProposition(classiques, 500);
    expect([t.abonnementMensuelCentimes, t.miseEnServiceCentimes, t.brutMensuelCentimes, t.prestationCentimes]).toEqual([2, 167, 2, 0]);
    expect(t.parType.mensuel).toEqual({ brutCentimes: 2, remiseCentimes: 0, gestesCentimes: 0, netCentimes: 2 });
    expect(t.parType.uneFois).toEqual({ brutCentimes: 333, remiseCentimes: 166, gestesCentimes: 0, netCentimes: 167 });
    expect(totauxProposition([], 0).parType).toEqual({ mensuel: zero, uneFois: zero, usage: zero });
  });
  const zero = { brutCentimes: 0, remiseCentimes: 0, gestesCentimes: 0, netCentimes: 0 };
  it("une prestation compte une fois, avec les frais d'installation, jamais dans le mensuel", () => {
    const t = totauxProposition([l("PRESTATION", 50000)], 0);
    expect(t.parType).toEqual({ mensuel: zero, uneFois: { ...zero, brutCentimes: 50000, netCentimes: 50000 }, usage: zero });
    expect([t.abonnementMensuelCentimes, t.miseEnServiceCentimes, t.prestationCentimes]).toEqual([0, 0, 50000]);
  });
  it("à l'acceptation, une ligne est copiée au net ; une ligne offerte devient une ligne à 0, offerte, avec son libellé", () => {
    expect(ligneAuNet({ type: "ABONNEMENT" as const, montantCentimes: 333, offerte: false, libelle: null, productId: 1 }, 125))
      .toEqual({ type: "ABONNEMENT", montantCentimes: 291, offerte: false, libelle: null, productId: 1, remisePourMille: 125 });
    expect(ligneAuNet({ type: "MISE_EN_SERVICE" as const, montantCentimes: 62500, offerte: true, libelle: "Installation et formation Talk", productId: 1 }, 125))
      .toEqual({ type: "MISE_EN_SERVICE", montantCentimes: 0, offerte: true, libelle: "Installation et formation Talk", productId: 1, remisePourMille: null });
  });
});

describe("quantité × prix unitaire − remise de la ligne (C-90)", () => {
  it("le brut est la quantité × le prix unitaire", () => {
    expect(brutCalcule({ quantite: 3, prixUnitaireCentimes: 29000 })).toBe(87000);
    expect(brutCalcule({ quantite: 3, prixUnitaireCentimes: null })).toBeNull();
    expect(brutCalcule({})).toBeNull();
  });
  it("la remise de la ligne remplace celle de la version, elle ne s'ajoute pas", () => {
    expect(remiseEffective({ remisePourMille: 100 }, 50)).toBe(100);
    expect(remiseEffective({ remisePourMille: 0 }, 50)).toBe(0);
    expect(remiseEffective({ remisePourMille: null }, 50)).toBe(50);
  });
  it("les totaux appliquent la remise propre de chaque ligne", () => {
    const t = totauxProposition([{ type: "ABONNEMENT", montantCentimes: 87000, remisePourMille: 100 }, { type: "ABONNEMENT", montantCentimes: 10000 }], 50);
    expect(t.parType.mensuel).toEqual({ brutCentimes: 97000, remiseCentimes: 8700 + 500, gestesCentimes: 0, netCentimes: 78300 + 9500 });
  });
  it("une ligne de contrat calculée vaut le net, 0 si elle est offerte", () => {
    expect(montantContratCalcule({ quantite: 3, prixUnitaireCentimes: 29000, remisePourMille: 100 })).toBe(78300);
    expect(montantContratCalcule({ quantite: 3, prixUnitaireCentimes: 29000 })).toBe(87000);
    expect(montantContratCalcule({ quantite: 3, prixUnitaireCentimes: 29000, offerte: true })).toBe(0);
    expect(montantContratCalcule({ prixUnitaireCentimes: 29000 })).toBeNull();
  });
  it("à l'acceptation, la ligne garde son calcul et la remise reçue", () => {
    expect(ligneAuNet({ type: "ABONNEMENT" as const, montantCentimes: 87000, quantite: 3, prixUnitaireCentimes: 29000, remisePourMille: null, offerte: false }, 100))
      .toMatchObject({ montantCentimes: 78300, quantite: 3, prixUnitaireCentimes: 29000, remisePourMille: 100 });
  });
});
describe("saisie française exacte", () => {
  it.each([["12,5",125], ["100",1000], ["0,1",1], ["0",0]])("remise %s", (s,n) => expect(pourMilleDepuisSaisie(s)).toBe(n));
  it.each(["12,55", "-1", "100,1", "", "abc"])("refuse la remise %s", (s) => expect(() => pourMilleDepuisSaisie(s)).toThrow());
});
describe("proposition expirée, jours civils", () => {
  const maintenant = new Date("2026-10-28T12:00:00Z");
  const p = { statut: "EXPIREE" as CrmStatutProposition, repondueLe: null as Date | null, valideJusquAu: new Date("2026-10-23T23:59:59Z") as Date | null };
  it.each(statuts)("statut %s", (statut) => expect(propositionExpiree({ ...p, statut }, "PROPOSITION", maintenant)).toBe(["ENVOYEE", "EN_DISCUSSION", "EXPIREE"].includes(statut)));
  it.each(["SIGNE", "EN_INTEGRATION", "EN_PRODUCTION", "PERDU", "EN_SOMMEIL", "ARRETE"] as const)("exclut %s", (etape) => expect(propositionExpiree(p,etape,maintenant)).toBe(false));
  it("exige une validité dépassée de plus de trois jours et aucune réponse", () => {
    expect(propositionExpiree({ ...p, valideJusquAu: new Date("2026-10-25") }, "PROPOSITION", maintenant)).toBe(false);
    expect(propositionExpiree({ ...p, valideJusquAu: new Date("2026-10-24T23:59:59Z") }, "PROPOSITION", maintenant)).toBe(true);
    expect(propositionExpiree({ ...p, valideJusquAu: null }, "PROPOSITION", maintenant)).toBe(false);
    expect(propositionExpiree({ ...p, repondueLe: maintenant }, "PROPOSITION", maintenant)).toBe(false);
  });
});

describe("propositionEnAttente : une seule règle (C-40, C-70, C-71)", () => {
  const v = (version: number, statut: CrmStatutProposition) => ({ version, statut });
  it("aucune version : aucune", () => expect(propositionEnAttente([])).toBeNull());
  it.each(["ENVOYEE", "EN_DISCUSSION"] as const)("dernière version non brouillon %s : elle", (statut) => {
    const derniere = v(2, statut);
    expect(propositionEnAttente([v(1, "REFUSEE"), derniere])).toBe(derniere);
  });
  it.each(["REFUSEE", "EXPIREE", "ACCEPTEE"] as const)("dernière %s, une ancienne restée envoyée : aucune", (statut) => {
    expect(propositionEnAttente([v(1, "ENVOYEE"), v(2, statut)])).toBeNull();
    expect(propositionEnAttente([v(2, statut), v(1, "EN_DISCUSSION")])).toBeNull();
  });
  it("seulement des brouillons : aucune", () => expect(propositionEnAttente([v(1, "BROUILLON")])).toBeNull());
  it("un brouillon plus récent ne masque pas la version envoyée", () => {
    const envoyee = v(2, "ENVOYEE");
    expect(propositionEnAttente([v(3, "BROUILLON"), envoyee, v(1, "REFUSEE")])).toBe(envoyee);
  });
  it("deux versions ouvertes : la plus récente, jamais la version dépassée, dans n'importe quel ordre", () => {
    const v1 = v(1, "ENVOYEE"), v2 = v(2, "EN_DISCUSSION");
    expect(propositionEnAttente([v1, v2])).toBe(v2);
    expect(propositionEnAttente([v2, v1])).toBe(v2);
  });
  it("rend l'objet reçu, avec ses autres champs", () => {
    const p = { id: 7, version: 1, statut: "ENVOYEE" as const };
    expect(propositionEnAttente([p])?.id).toBe(7);
  });
});

describe("bornes d'arrondi et refus (lot S, cas limites)", () => {
  it("à 999 et 1000 pour mille : le net est le millième du brut, demi vers le haut", () => {
    expect([montantNet(499, 999), montantNet(500, 999), montantNet(1000, 999), montantNet(1500, 999), montantNet(1499, 999)]).toEqual([0, 1, 1, 2, 1]);
    expect([montantNet(1, 1000), montantNet(Number.MAX_SAFE_INTEGER, 1000), montantNet(0, 1000)]).toEqual([0, 0, 0]);
  });
  it("2^31 - 1 centimes à 125 pour mille, et le plus grand entier sûr, sans perte de précision", () => {
    expect(montantNet(2147483647, 125)).toBe(1879048191);
    for (const remise of [0, 1, 125, 500, 999, 1000]) {
      const attendu = Number((BigInt(Number.MAX_SAFE_INTEGER) * BigInt(1000 - remise) + 500n) / 1000n);
      expect(montantNet(Number.MAX_SAFE_INTEGER, remise)).toBe(attendu);
    }
  });
  it("une remise invalide est refusée même sur une ligne offerte", () => {
    for (const remise of [-1, 1001, 12.5, Number.NaN]) {
      expect(() => montantNetLigne({ montantCentimes: 100, offerte: true }, remise)).toThrow();
      expect(() => totauxProposition([{ type: "ABONNEMENT", montantCentimes: 100, offerte: true }], remise)).toThrow();
    }
    expect(() => montantNetLigne({ montantCentimes: -1, offerte: true }, 0)).toThrow();
  });
  it("un total hors des entiers sûrs est refusé, un total au plus juste passe", () => {
    const ligne = (montantCentimes: number) => ({ type: "ABONNEMENT" as const, montantCentimes });
    expect(() => totauxProposition([ligne(Number.MAX_SAFE_INTEGER), ligne(1)], 0)).toThrow("Total trop élevé.");
    expect(() => totauxProposition([ligne(Number.MAX_SAFE_INTEGER), ligne(Number.MAX_SAFE_INTEGER)], 0)).toThrow("Total trop élevé.");
    expect(totauxProposition([ligne(Number.MAX_SAFE_INTEGER - 1), ligne(1)], 0).abonnementMensuelCentimes).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("propositions offertes, mêlées, sans unité (lot S, cas limites)", () => {
  type Ligne = Parameters<typeof totauxProposition>[0][number];
  const zero = { brutCentimes: 0, remiseCentimes: 0, gestesCentimes: 0, netCentimes: 0 };
  it.each([0, 500, 1000])("une proposition entièrement offerte à %i pour mille : net 0, remise 0, gestes = brut, par type", (remise) => {
    const offertes: Ligne[] = [
      { type: "ABONNEMENT", montantCentimes: 27083, offerte: true }, { type: "ABONNEMENT", montantCentimes: 7917, offerte: true },
      { type: "MISE_EN_SERVICE", montantCentimes: 62500, offerte: true }, { type: "PRESTATION", montantCentimes: 150001, offerte: true },
      { type: "PART_VARIABLE", montantCentimes: 35, unite: "APPEL_TRAITE", offerte: true },
    ];
    const t = totauxProposition(offertes, remise);
    expect(t.parType).toEqual({
      mensuel: { ...zero, brutCentimes: 35000, gestesCentimes: 35000 },
      uneFois: { ...zero, brutCentimes: 212501, gestesCentimes: 212501 },
      usage: { ...zero, brutCentimes: 35, gestesCentimes: 35 },
    });
    expect([t.abonnementMensuelCentimes, t.miseEnServiceCentimes, t.prestationCentimes, t.brutMensuelCentimes]).toEqual([0, 0, 0, 35000]);
    expect(t.variables).toEqual([{ unite: "APPEL_TRAITE", prixNetCentimes: 0, volumeInclus: null, offerte: true }]);
  });
  it("une prestation offerte à côté d'une prestation payante remisée : le geste et la remise ne se mêlent pas", () => {
    const t = totauxProposition([{ type: "PRESTATION", montantCentimes: 100000, offerte: true }, { type: "PRESTATION", montantCentimes: 333 }], 125);
    expect(t.parType.uneFois).toEqual({ brutCentimes: 100333, remiseCentimes: 333 - 291, gestesCentimes: 100000, netCentimes: 291 });
    expect(t.prestationCentimes).toBe(291);
  });
  it("une part à l'usage sans unité compte dans son total mais n'entre pas dans la liste des prix variables", () => {
    const t = totauxProposition([{ type: "PART_VARIABLE", montantCentimes: 35 }], 500);
    expect(t.variables).toEqual([]);
    expect(t.parType.usage).toEqual({ brutCentimes: 35, remiseCentimes: 17, gestesCentimes: 0, netCentimes: 18 });
  });
  it("10 000 lignes de 1 centime : l'arrondi se fait par ligne, à 500 comme à 501 pour mille", () => {
    const lignes = Array.from({ length: 10000 }, () => ({ type: "ABONNEMENT" as const, montantCentimes: 1 }));
    expect(totauxProposition(lignes, 500).parType.mensuel).toEqual({ brutCentimes: 10000, remiseCentimes: 0, gestesCentimes: 0, netCentimes: 10000 });
    expect(totauxProposition(lignes, 501).parType.mensuel).toEqual({ brutCentimes: 10000, remiseCentimes: 10000, gestesCentimes: 0, netCentimes: 0 });
  });
});

describe("totauxProposition contre un calcul BigInt indépendant (300 jeux tirés au hasard, graine fixe)", () => {
  // Ce test est la vraie preuve des totaux : « brut = net + remise + gestes » plus haut est vrai par
  // construction (remise = brut - net), il ne prouve que la cohérence. Ici, un second calcul, écrit
  // autrement (BigInt, sans montantNet ni parType), est comparé au code.
  const graine = (s: number) => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const types = ["ABONNEMENT", "MISE_EN_SERVICE", "PART_VARIABLE", "PRESTATION"] as const;
  const famille = { ABONNEMENT: "mensuel", MISE_EN_SERVICE: "uneFois", PRESTATION: "uneFois", PART_VARIABLE: "usage" } as const;
  it("net, brut, gestes et remise, par famille, identiques", () => {
    const hasard = graine(20261118);
    const entier = (max: number) => Math.floor(hasard() * (max + 1));
    for (let jeu = 0; jeu < 300; jeu++) {
      const remise = hasard() < 0.5 ? [0, 1, 125, 500, 501, 999, 1000][entier(6)] : entier(1000);
      const lignes = Array.from({ length: entier(12) }, () => {
        const type = types[entier(3)];
        const grand = hasard() < 0.3;
        return { type, montantCentimes: grand ? entier(100_000_000_000) : entier(100_000), offerte: hasard() < 0.25,
          ...(type === "PART_VARIABLE" ? { unite: "APPEL_TRAITE" as const } : {}) };
      });
      const attendu = { mensuel: [0n, 0n, 0n, 0n], uneFois: [0n, 0n, 0n, 0n], usage: [0n, 0n, 0n, 0n] }; // brut, net, gestes, remise
      for (const l of lignes) {
        const brut = BigInt(l.montantCentimes);
        const net = l.offerte ? 0n : (brut * BigInt(1000 - remise) + 500n) / 1000n;
        const a = attendu[famille[l.type]];
        a[0] += brut; a[1] += net; a[2] += l.offerte ? brut : 0n; a[3] += l.offerte ? 0n : brut - net;
      }
      const t = totauxProposition(lignes, remise);
      for (const f of ["mensuel", "uneFois", "usage"] as const) {
        const [brut, net, gestes, rem] = attendu[f];
        expect(t.parType[f], `jeu ${jeu}, ${f}`).toEqual({ brutCentimes: Number(brut), netCentimes: Number(net), gestesCentimes: Number(gestes), remiseCentimes: Number(rem) });
      }
      const somme = (type: typeof types[number]) => Number(lignes.filter((l) => l.type === type).reduce((s, l) => s + (l.offerte ? 0n : (BigInt(l.montantCentimes) * BigInt(1000 - remise) + 500n) / 1000n), 0n));
      expect([t.abonnementMensuelCentimes, t.miseEnServiceCentimes, t.prestationCentimes]).toEqual([somme("ABONNEMENT"), somme("MISE_EN_SERVICE"), somme("PRESTATION")]);
    }
  });
});

describe("versionQuiRemplace : une ancienne version envoyée est remplacée", () => {
  const v = (id: number, version: number, statut: CrmStatutProposition) => ({ id, version, statut });
  it("la v1 envoyée est remplacée par la v2 envoyée, refusée ou en discussion", () => {
    for (const statut of ["ENVOYEE", "REFUSEE", "EN_DISCUSSION", "EXPIREE"] as const) {
      expect(versionQuiRemplace([v(1, 1, "ENVOYEE"), v(2, 2, statut)], { id: 1, version: 1 })?.version).toBe(2);
    }
  });
  it("la dernière version non brouillon n'est remplacée par personne, même avec un brouillon plus récent", () => {
    expect(versionQuiRemplace([v(1, 1, "REFUSEE"), v(2, 2, "ENVOYEE"), v(3, 3, "BROUILLON")], { id: 2, version: 2 })).toBeNull();
  });
  it("donne la plus récente, quel que soit l'ordre reçu", () => {
    expect(versionQuiRemplace([v(3, 3, "REFUSEE"), v(1, 1, "ENVOYEE"), v(2, 2, "ENVOYEE")], { id: 1, version: 1 })?.id).toBe(3);
  });
  it("concorde avec propositionEnAttente : une version envoyée non remplacée est celle qui attend", () => {
    const versions = [v(1, 1, "ENVOYEE"), v(2, 2, "EN_DISCUSSION")];
    for (const p of versions) expect(versionQuiRemplace(versions, p) === null).toBe(propositionEnAttente(versions)?.id === p.id);
  });
});
