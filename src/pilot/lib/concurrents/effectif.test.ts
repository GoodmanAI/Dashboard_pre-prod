import { describe, expect, it } from "vitest";
import { CrmEtapeCommerciale } from "@prisma/client";
import { estClient } from "@/pilot/lib/pipeline";
import { assemblerCentres, filtrer, type CentreLu, type OrganisationLue } from "@/pilot/lib/carte/affichage";
import { compterParConcurrent, concurrentEffectif, lienAvecConcurrent, type OrganisationConcurrent } from "./effectif";

const org = (etape: CrmEtapeCommerciale, concurrentId: number | null, concurrentGagnantId: number | null = null): OrganisationConcurrent =>
  ({ etape, concurrentId, concurrentGagnantId });

describe("concurrentEffectif : qui équipe cet établissement", () => {
  it("le concurrent en place d'un prospect", () => {
    expect(concurrentEffectif(org("PROSPECT", 7))).toBe(7);
    expect(concurrentEffectif(org("EN_SOMMEIL", 7))).toBe(7);
    expect(concurrentEffectif(org("PROSPECT", null))).toBeNull();
  });
  it("un client de Lyrae n'est plus équipé par un concurrent, à toutes les étapes client", () => {
    for (const etape of Object.values(CrmEtapeCommerciale).filter(estClient)) expect(concurrentEffectif(org(etape, 7))).toBeNull();
  });
  it("le gagnant d'une affaire perdue l'emporte sur le concurrent en place", () => {
    expect(concurrentEffectif(org("PERDU", 7, 3))).toBe(3);
    expect(concurrentEffectif(org("PERDU", null, 3))).toBe(3);
  });
  it("un dossier perdu sans gagnant, ou un contrat terminé, n'est équipé par personne (on ne sait pas par qui)", () => {
    expect(concurrentEffectif(org("PERDU", 7, null))).toBeNull();
    expect(concurrentEffectif(org("ARRETE", 7))).toBeNull();
    expect(lienAvecConcurrent(org("PERDU", 7, null), 7)).toBeNull();
    expect(lienAvecConcurrent(org("ARRETE", 7), 7)).toBeNull();
    expect(compterParConcurrent([org("PERDU", 7, null), org("ARRETE", 7)]).size).toBe(0);
  });
});

describe("lienAvecConcurrent : aucun double compte", () => {
  it("une affaire perdue contre lui n'est que perdue, même s'il était déjà en place", () => {
    expect(lienAvecConcurrent(org("PERDU", 3, 3), 3)).toBe("perdue");
    expect(lienAvecConcurrent(org("PERDU", null, 3), 3)).toBe("perdue");
  });
  it("gagnée par un autre : plus rien pour l'ancien concurrent en place", () => {
    expect(lienAvecConcurrent(org("PERDU", 7, 3), 7)).toBeNull();
  });
  it("en place, ou passé chez Lyrae", () => {
    expect(lienAvecConcurrent(org("POURPARLERS", 7), 7)).toBe("en_place");
    expect(lienAvecConcurrent(org("EN_PRODUCTION", 7), 7)).toBe("passe_chez_lyrae");
    expect(lienAvecConcurrent(org("PROSPECT", 7), 3)).toBeNull();
  });
});

describe("compterParConcurrent", () => {
  it("compte en place et perdues, chaque établissement une seule fois", () => {
    const comptes = compterParConcurrent([
      org("PROSPECT", 7), org("POURPARLERS", 7), org("EN_PRODUCTION", 7), // deux en place, un client
      org("PERDU", 7, 7), // perdue contre 7 : pas aussi en place
      org("PERDU", 7, 3), // gagnée par 3 : perdue pour 3, rien pour 7
      org("PROSPECT", null),
    ]);
    expect(comptes.get(7)).toEqual({ enPlace: 2, perdues: 1 });
    expect(comptes.get(3)).toEqual({ enPlace: 0, perdues: 1 });
    expect(comptes.size).toBe(2);
  });
  it("la somme des comptes vaut le nombre d'établissements que concurrentEffectif désigne", () => {
    const orgs = [org("PROSPECT", 7), org("EN_PRODUCTION", 7), org("PERDU", 7, 7), org("PERDU", 7, 3), org("SIGNE", 3), org("ARRETE", 3)];
    const total = [...compterParConcurrent(orgs).values()].reduce((s, c) => s + c.enPlace + c.perdues, 0);
    expect(total).toBe(orgs.filter((o) => concurrentEffectif(o) !== null).length);
  });
});

describe("une seule règle pour la page Concurrents et la carte (test croisé)", () => {
  // Toutes les étapes, chacune avec un concurrent en place, gagnées ou non par un autre : un jeu qui couvre chaque cas.
  const etapes = Object.values(CrmEtapeCommerciale);
  const jeu: (OrganisationConcurrent & { id: number })[] = [];
  let id = 1;
  for (const etape of etapes) {
    for (const [enPlace, gagnant] of [[7, null], [3, null], [null, null], [7, 3], [7, 7], [null, 3]] as const) {
      // Un gagnant n'existe qu'en Perdu (C-73) : ailleurs, on ne le pose pas.
      if (gagnant !== null && etape !== "PERDU") continue;
      jeu.push({ id: id++, etape, concurrentId: enPlace, concurrentGagnantId: gagnant });
    }
  }
  const organisations: OrganisationLue[] = jeu.map((o) => ({ id: o.id, nom: `Org ${o.id}`, etape: o.etape, ris: null,
    concurrentId: o.concurrentId, concurrentGagnantId: o.concurrentGagnantId, dateSortie: o.etape === "PERDU" ? "2026-10-01" : null,
    responsableId: null, responsable: null, temperature: null, montant: null }));
  // Un centre par organisation : un marqueur égale un établissement.
  const centres: CentreLu[] = jeu.map((o) => ({ id: 1000 + o.id, organisationId: o.id, nom: "Site principal", ville: null, ris: null,
    geocodageStatut: "OK", latitude: "48.85", longitude: "2.35", majLe: new Date("2026-11-01") }));
  const carte = assemblerCentres(organisations, centres, new Date("2026-11-19T10:00:00Z"));
  const comptes = compterParConcurrent(jeu);

  it.each([3, 7])("concurrent %i : « en place chez N » égale ses marqueurs non perdus, et ses affaires perdues ses losanges", (concurrent) => {
    const marqueurs = filtrer(carte, { concurrent: String(concurrent) }, 5);
    expect(marqueurs.filter((c) => c.genre !== "PERDU").length).toBe(comptes.get(concurrent)?.enPlace ?? 0);
    expect(marqueurs.filter((c) => c.genre === "PERDU").length).toBe(comptes.get(concurrent)?.perdues ?? 0);
    expect(comptes.get(concurrent)?.enPlace).toBeGreaterThan(0);
  });
  it("ni un dossier perdu sans gagnant, ni un contrat terminé, ni un client n'apparaît en mode concurrents", () => {
    const tous = filtrer(carte, { concurrent: "tous" }, 5);
    const etapeDe = new Map(jeu.map((o) => [o.id, o]));
    expect(tous.some((c) => etapeDe.get(c.organisationId)!.etape === "ARRETE")).toBe(false);
    expect(tous.some((c) => c.etape === "PERDU" && etapeDe.get(c.organisationId)!.concurrentGagnantId === null)).toBe(false);
    expect(tous.some((c) => c.genre === "CLIENT")).toBe(false);
  });
  it("la fiche du concurrent liste en place exactement ce que la liste compte", () => {
    for (const concurrent of [3, 7]) {
      expect(jeu.filter((o) => lienAvecConcurrent(o, concurrent) === "en_place").length).toBe(comptes.get(concurrent)?.enPlace ?? 0);
      expect(jeu.filter((o) => lienAvecConcurrent(o, concurrent) === "perdue").length).toBe(comptes.get(concurrent)?.perdues ?? 0);
    }
  });
});
