import { describe, expect, it } from "vitest";
import type { Compteurs } from "./compteurs";
import { projeter, resumeProjection, type OpportuniteProjection } from "./projeter";
import { reelDuMois, type ContratReel, type RattachementReel } from "./reel";

/**
 * Non-régression du lot S : les sorties de `projeter` et de `reelDuMois` sur un
 * jeu représentatif, figées AVANT l'arrivée de PRESTATION, des lignes sans
 * produit et des lignes offertes. Ce jeu n'en contient aucune : ses sorties ne
 * doivent pas bouger d'un centime.
 */
const d = (s: string) => new Date(s);

it("C-95 : une formation au prix inconnu ne change aucune sortie historique ni ne crée de clé", () => {
  const base = { mois: d("2026-06-01"), contrats: [], rattachements: [], usage: new Map<number, Compteurs>() };
  expect(reelDuMois({ ...base, formations: [{ organisationId: 99, debuteLe: d("2026-06-03"), montantCentimes: null }] })).toEqual(reelDuMois(base));
  const projection = { contrats: [], opportunites: [], scenario: null, variableMensuelleParLigne: new Map<number, number>(), moisDepart: base.mois, nbMois: 3 };
  expect(projeter({ ...projection, formations: [{ debuteLe: d("2026-06-03"), montantCentimes: null }] })).toEqual(projeter(projection));
});
const contrats: ContratReel[] = [
  // Actif, début officiel en mars : abonnements d'organisation et de centre, installation, part à l'usage.
  { organisationId: 1, statut: "ACTIF", debuteLe: d("2026-03-10"), signeLe: d("2026-02-20"), termineLe: null, lignes: [
    { id: 11, productId: 10, centreId: null, type: "ABONNEMENT", montantCentimes: 90000, unite: null, volumeInclus: null },
    { id: 12, productId: 10, centreId: null, type: "MISE_EN_SERVICE", montantCentimes: 250000, unite: null, volumeInclus: null },
    { id: 13, productId: 10, centreId: 100, type: "PART_VARIABLE", montantCentimes: 35, unite: "APPEL_TRAITE", volumeInclus: 200 },
    { id: 14, productId: 20, centreId: 101, type: "ABONNEMENT", montantCentimes: 7917, unite: null, volumeInclus: null },
    { id: 15, productId: 20, centreId: 101, type: "MISE_EN_SERVICE", montantCentimes: 37500, unite: null, volumeInclus: null },
  ] },
  // Terminé à la mi-mai : compte jusqu'en mai.
  { organisationId: 2, statut: "TERMINE", debuteLe: d("2025-12-01"), signeLe: null, termineLe: d("2026-05-15"), lignes: [
    { id: 21, productId: 10, centreId: null, type: "ABONNEMENT", montantCentimes: 12000, unite: null, volumeInclus: null },
    { id: 22, productId: 10, centreId: null, type: "PART_VARIABLE", montantCentimes: 10, unite: "SMS_ENVOYE", volumeInclus: 0 },
  ] },
  // Sans début officiel : compte depuis sa signature.
  { organisationId: 3, statut: "ACTIF", debuteLe: null, signeLe: d("2026-04-20"), termineLe: null, lignes: [
    { id: 31, productId: 30, centreId: null, type: "ABONNEMENT", montantCentimes: 5000, unite: null, volumeInclus: null },
    { id: 32, productId: 30, centreId: null, type: "MISE_EN_SERVICE", montantCentimes: 1000, unite: null, volumeInclus: null },
    { id: 33, productId: 30, centreId: null, type: "PART_VARIABLE", montantCentimes: 100, unite: "RDV_PRIS", volumeInclus: 0 },
    { id: 34, productId: 30, centreId: null, type: "PART_VARIABLE", montantCentimes: 7, unite: null, volumeInclus: null },
  ] },
  // Ne comptent jamais : un brouillon, un contrat sans aucune date.
  { organisationId: 4, statut: "BROUILLON", debuteLe: d("2026-03-01"), signeLe: d("2026-03-01"), termineLe: null, lignes: [
    { id: 41, productId: 10, centreId: null, type: "ABONNEMENT", montantCentimes: 99999, unite: null, volumeInclus: null },
  ] },
  { organisationId: 5, statut: "ACTIF", debuteLe: null, signeLe: null, termineLe: null, lignes: [
    { id: 51, productId: 10, centreId: null, type: "ABONNEMENT", montantCentimes: 88888, unite: null, volumeInclus: null },
  ] },
];
const rattachements: RattachementReel[] = [
  { organisationId: 1, productId: 10, centreId: 100, userProductId: 500 },
  { organisationId: 1, productId: 10, centreId: 102, userProductId: 502 },
  { organisationId: 2, productId: 10, centreId: 200, userProductId: 600 },
  { organisationId: 3, productId: 30, centreId: 300, userProductId: 700 },
];
const usage = new Map<number, Compteurs>([
  [500, { APPEL_TRAITE: 333, RDV_PRIS: 12, SMS_ENVOYE: null }],
  [502, { APPEL_TRAITE: 1000, RDV_PRIS: 0, SMS_ENVOYE: null }],
  [600, { APPEL_TRAITE: 5, RDV_PRIS: 5, SMS_ENVOYE: null }],
  [700, { APPEL_TRAITE: 0, RDV_PRIS: 41, SMS_ENVOYE: null }],
]);
const opportunite = (champs: Partial<OpportuniteProjection> & Pick<OpportuniteProjection, "id">): OpportuniteProjection => ({
  etape: "PROPOSITION", montantMensuelCentimes: 27083, montantMiseEnServiceCentimes: 62500, probabilite: 33, probabiliteForcee: false,
  categoriePrevision: "PROBABLE", demarrageAttenduLe: d("2026-05-12"), gagneeLe: null, perdueLe: null, ...champs });
const opportunites = [
  opportunite({ id: 1 }),
  opportunite({ id: 2, etape: "POURPARLERS", montantMensuelCentimes: 7917, montantMiseEnServiceCentimes: 0, probabilite: 17, probabiliteForcee: true, demarrageAttenduLe: d("2026-03-01") }),
  opportunite({ id: 3, categoriePrevision: "EXCLU" }),
  opportunite({ id: 4, perdueLe: d("2026-01-01") }),
];

describe("non-régression du lot S, sorties figées avant PRESTATION", () => {
  it("projeter : six mois, carte de part variable, sans puis avec scénario", () => {
    const base = { contrats, opportunites, variableMensuelleParLigne: new Map([[13, 4655], [22, 0], [33, 4100]]), moisDepart: d("2026-02-14"), nbMois: 6 };
    const sansScenario = projeter({ ...base, scenario: null });
    const avecScenario = projeter({ ...base, scenario: { cochees: new Set([1]), decalages: new Map([[1, d("2026-07-02")]]) } });
    expect(sansScenario.map((m) => [m.mois.toISOString().slice(0, 7), m.signe, m.variable, m.miseEnService, m.pondere, m.optimiste])).toMatchInlineSnapshot(`
      [
        [
          "2026-02",
          12000,
          0,
          0,
          12000,
          12000,
        ],
        [
          "2026-03",
          402072,
          4655,
          287500,
          403418,
          409989,
        ],
        [
          "2026-04",
          124672,
          8755,
          1000,
          126018,
          132589,
        ],
        [
          "2026-05",
          123672,
          8755,
          0,
          183247,
          221172,
        ],
        [
          "2026-06",
          111672,
          8755,
          0,
          130622,
          146672,
        ],
        [
          "2026-07",
          111672,
          8755,
          0,
          130622,
          146672,
        ],
      ]
    `);
    expect(avecScenario.map((m) => [m.mois.toISOString().slice(0, 7), m.signe, m.pondere, m.optimiste])).toMatchInlineSnapshot(`
      [
        [
          "2026-02",
          12000,
          12000,
          12000,
        ],
        [
          "2026-03",
          402072,
          402072,
          402072,
        ],
        [
          "2026-04",
          124672,
          124672,
          124672,
        ],
        [
          "2026-05",
          123672,
          123672,
          123672,
        ],
        [
          "2026-06",
          111672,
          111672,
          111672,
        ],
        [
          "2026-07",
          111672,
          169901,
          201255,
        ],
      ]
    `);
    expect(resumeProjection(sansScenario.slice(1))).toMatchInlineSnapshot(`
      {
        "ecartPondere": 1346,
        "miseEnService": 287500,
        "recurrentSigne": 109917,
        "variable": 4655,
      }
    `);
  });
  it("reelDuMois : cinq mois, puis le volume porté à fin de mois", () => {
    const sortie = (mois: string, volumeProjete?: (v: number) => number) => {
      const { lignes, motifs } = reelDuMois({ mois: d(mois), contrats, rattachements, usage, volumeProjete });
      return { motifs, lignes: lignes.map((l) => [l.cle, l.recurrentCentimes, l.variableCentimes, l.miseEnServiceCentimes, l.volumeVariable, l.uniteVariable]) };
    };
    expect(["2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"].map((m) => sortie(m))).toMatchInlineSnapshot(`
      [
        {
          "lignes": [
            [
              "2026-02|2|10|0",
              12000,
              0,
              0,
              null,
              "SMS_ENVOYE",
            ],
          ],
          "motifs": [
            "Compteur de SMS non disponible",
          ],
        },
        {
          "lignes": [
            [
              "2026-03|1|10|0",
              90000,
              0,
              250000,
              null,
              null,
            ],
            [
              "2026-03|1|10|100",
              0,
              4655,
              0,
              333,
              "APPEL_TRAITE",
            ],
            [
              "2026-03|1|20|101",
              7917,
              0,
              37500,
              null,
              null,
            ],
            [
              "2026-03|2|10|0",
              12000,
              0,
              0,
              null,
              "SMS_ENVOYE",
            ],
          ],
          "motifs": [
            "Compteur de SMS non disponible",
          ],
        },
        {
          "lignes": [
            [
              "2026-04|1|10|0",
              90000,
              0,
              0,
              null,
              null,
            ],
            [
              "2026-04|1|10|100",
              0,
              4655,
              0,
              333,
              "APPEL_TRAITE",
            ],
            [
              "2026-04|1|20|101",
              7917,
              0,
              0,
              null,
              null,
            ],
            [
              "2026-04|2|10|0",
              12000,
              0,
              0,
              null,
              "SMS_ENVOYE",
            ],
            [
              "2026-04|3|30|0",
              5000,
              4100,
              1000,
              41,
              "RDV_PRIS",
            ],
          ],
          "motifs": [
            "Compteur de SMS non disponible",
            "Part variable sans unité",
          ],
        },
        {
          "lignes": [
            [
              "2026-05|1|10|0",
              90000,
              0,
              0,
              null,
              null,
            ],
            [
              "2026-05|1|10|100",
              0,
              4655,
              0,
              333,
              "APPEL_TRAITE",
            ],
            [
              "2026-05|1|20|101",
              7917,
              0,
              0,
              null,
              null,
            ],
            [
              "2026-05|2|10|0",
              12000,
              0,
              0,
              null,
              "SMS_ENVOYE",
            ],
            [
              "2026-05|3|30|0",
              5000,
              4100,
              0,
              41,
              "RDV_PRIS",
            ],
          ],
          "motifs": [
            "Compteur de SMS non disponible",
            "Part variable sans unité",
          ],
        },
        {
          "lignes": [
            [
              "2026-06|1|10|0",
              90000,
              0,
              0,
              null,
              null,
            ],
            [
              "2026-06|1|10|100",
              0,
              4655,
              0,
              333,
              "APPEL_TRAITE",
            ],
            [
              "2026-06|1|20|101",
              7917,
              0,
              0,
              null,
              null,
            ],
            [
              "2026-06|3|30|0",
              5000,
              4100,
              0,
              41,
              "RDV_PRIS",
            ],
          ],
          "motifs": [
            "Part variable sans unité",
          ],
        },
      ]
    `);
    expect(sortie("2026-06-01", (v) => v * 2)).toMatchInlineSnapshot(`
      {
        "lignes": [
          [
            "2026-06|1|10|0",
            90000,
            0,
            0,
            null,
            null,
          ],
          [
            "2026-06|1|10|100",
            0,
            16310,
            0,
            666,
            "APPEL_TRAITE",
          ],
          [
            "2026-06|1|20|101",
            7917,
            0,
            0,
            null,
            null,
          ],
          [
            "2026-06|3|30|0",
            5000,
            8200,
            0,
            82,
            "RDV_PRIS",
          ],
        ],
        "motifs": [
          "Part variable sans unité",
        ],
      }
    `);
  });
});
