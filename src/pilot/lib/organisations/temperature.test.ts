import { afterEach, describe, expect, it, vi } from "vitest";
import { CrmEtapeCommerciale } from "@prisma/client";
import { forcagePossible } from "@/pilot/lib/concurrents/regles";
import { LIBELLES_TEMPERATURE, POINTS_POSSIBLES, temperature, type CleCritere, type EntreeTemperature } from "./temperature";

const maintenant = new Date("2026-11-18T10:00:00Z");
const vide: EntreeTemperature = {
  etape: "PROSPECT", nombreSalles: null, nombreIrm: null, nombreScanners: null, nombreRadio: null, nombreEcho: null, nombreMammo: null, ris: null, centres: [], contacts: [],
  qualifBudget: false, qualifBesoin: false, decisionAttendueLe: null,
  temperatureForcee: null, temperatureForceeParId: null, temperatureForceeLe: null,
};
const decideur = [{ roleDecision: "DECIDEUR" as const }];
/** Les anciennes cases « Décideur rencontré » et « Calendrier connu » restent en base : on les passe pour prouver qu'elles ne comptent pas. */
type Fiche = Partial<EntreeTemperature> & { qualifDecideur?: boolean; qualifCalendrier?: boolean };
const calcul = (e: Fiche) => { const fiche = { ...vide, ...e }; return temperature(fiche, maintenant); };
const critere = (e: Fiche, cle: CleCritere) => calcul(e).points.criteres.find((c) => c.cle === cle)!;
/** 11 points : tout au maximum. */
const plein: Partial<EntreeTemperature> = {
  nombreSalles: 8, ris: "Xplore", contacts: decideur, qualifBudget: true, qualifBesoin: true, decisionAttendueLe: "2026-12-15",
};

describe("temperature : le référentiel", () => {
  it("compte 11 points possibles et nomme les trois niveaux", () => {
    expect(POINTS_POSSIBLES).toBe(11);
    expect(LIBELLES_TEMPERATURE).toEqual({ FROID: "Froid", TIEDE: "Tiède", CHAUD: "Chaud" });
  });
  it("détaille les six critères dans l'ordre, une fiche vide est froide à 0", () => {
    const r = calcul({});
    expect(r.points.criteres.map((c) => [c.cle, c.points, c.possibles])).toEqual([
      ["taille", 0, 2], ["ris", 0, 2], ["decideur", 0, 2], ["budget", 0, 2], ["decision", 0, 2], ["besoin", 0, 1],
    ]);
    expect(r.points.total).toBe(0);
    expect(r.calculee).toBe("FROID");
    expect(r.affichee).toBe("FROID");
  });
});

describe("temperature : taille (sallesDuDossier : centres, puis fiche, puis équipements)", () => {
  it("6 salles ou plus : 2 points", () => expect(critere({ nombreSalles: 6 }, "taille")).toMatchObject({ points: 2, valeur: "6 salles déclarées sur la fiche" }));
  it("3 à 5 salles : 1 point", () => {
    expect(critere({ nombreSalles: 3 }, "taille").points).toBe(1);
    expect(critere({ nombreSalles: 5 }, "taille").points).toBe(1);
  });
  it("moins de 3 salles : 0 point", () => {
    expect(critere({ nombreSalles: 2 }, "taille")).toMatchObject({ points: 0, valeur: "2 salles déclarées sur la fiche" });
    expect(critere({ nombreSalles: 1 }, "taille").valeur).toBe("1 salle déclarée sur la fiche");
  });
  it("inconnu : 0 point, et l'écran dit pourquoi", () => expect(critere({}, "taille")).toMatchObject({ points: 0, valeur: "Nombre de salles inconnu" }));
  it("additionne les salles saisies dans les centres", () => {
    expect(critere({ centres: [{ ris: null, salles: 4 }, { ris: null, salles: 3 }] }, "taille"))
      .toMatchObject({ points: 2, valeur: "7 salles saisies dans les centres" });
  });
  it("les salles saisies dans les centres l'emportent sur le nombre de la fiche", () => {
    expect(critere({ nombreSalles: 8, centres: [{ ris: null, salles: 2 }] }, "taille")).toMatchObject({ points: 0, valeur: "2 salles saisies dans les centres" });
  });
  it("des centres sans salle saisie laissent la fiche décider", () => {
    expect(critere({ nombreSalles: 8, centres: [{ ris: null, salles: 0 }] }, "taille")).toMatchObject({ points: 2, valeur: "8 salles déclarées sur la fiche" });
    expect(critere({ centres: [{ ris: null, salles: 0 }] }, "taille").valeur).toBe("Nombre de salles inconnu");
  });
  it("0 sur la fiche compte comme non renseigné", () => {
    expect(critere({ nombreSalles: 0, centres: [{ ris: null, salles: 4 }] }, "taille")).toMatchObject({ points: 1, valeur: "4 salles saisies dans les centres" });
    expect(critere({ nombreSalles: 0 }, "taille")).toMatchObject({ points: 0, valeur: "Nombre de salles inconnu" });
    expect(critere({ nombreSalles: 0, centres: [{ ris: null, salles: 0 }] }, "taille").valeur).toBe("Nombre de salles inconnu");
  });
  it("sans salle saisie ni nombre de salles, additionne les équipements déclarés sur la fiche", () => {
    expect(critere({ nombreIrm: 2, nombreScanners: 1, nombreRadio: 3, nombreEcho: null, nombreMammo: 1 }, "taille"))
      .toMatchObject({ points: 2, valeur: "7 équipements déclarés" });
    expect(critere({ nombreEcho: 3 }, "taille")).toMatchObject({ points: 1, valeur: "3 équipements déclarés" });
    expect(critere({ nombreMammo: 1 }, "taille")).toMatchObject({ points: 0, valeur: "1 équipement déclaré" });
  });
  it("le nombre de salles de la fiche l'emporte sur les équipements", () => {
    expect(critere({ nombreSalles: 2, nombreIrm: 9 }, "taille")).toMatchObject({ points: 0, valeur: "2 salles déclarées sur la fiche" });
  });
  it("0 salle sur la fiche : les équipements prennent le relais", () => {
    expect(critere({ nombreSalles: 0, nombreScanners: 4, nombreIrm: 2 }, "taille")).toMatchObject({ points: 2, valeur: "6 équipements déclarés" });
  });
  it("les salles saisies dans les centres l'emportent sur les équipements", () => {
    expect(critere({ nombreRadio: 6, centres: [{ ris: null, salles: 2 }] }, "taille")).toMatchObject({ points: 0, valeur: "2 salles saisies dans les centres" });
  });
  it("tout à 0 ou vide : taille inconnue", () => {
    expect(critere({ nombreSalles: 0, nombreIrm: 0, nombreScanners: 0, nombreRadio: 0, nombreEcho: 0, nombreMammo: 0, centres: [{ ris: null, salles: 0 }] }, "taille"))
      .toMatchObject({ points: 0, valeur: "Nombre de salles inconnu" });
  });
  it("un nombre négatif ne retire rien", () => {
    expect(critere({ nombreIrm: -3, nombreScanners: 3 }, "taille")).toMatchObject({ points: 1, valeur: "3 équipements déclarés" });
  });
  it.each([
    [[1, 1], 0, "2 salles saisies dans les centres"], [[1, 2], 1, "3 salles saisies dans les centres"],
    [[2, 3], 1, "5 salles saisies dans les centres"], [[3, 3], 2, "6 salles saisies dans les centres"],
    [[0, 6], 2, "6 salles saisies dans les centres"], [[1, 1, 1], 1, "3 salles saisies dans les centres"],
    [[2, 2, 2], 2, "6 salles saisies dans les centres"], [[1], 0, "1 salle saisie dans les centres"],
  ] as const)("centres à %j salles : %i point(s)", (salles, points, valeur) => {
    expect(critere({ centres: salles.map((n) => ({ ris: null, salles: n })) }, "taille")).toMatchObject({ points, valeur });
  });
});

describe("temperature : RIS", () => {
  it("Xplore, sous toutes ses écritures : 2 points", () => {
    for (const ris of ["Xplore", "Xplore (EDL)", "EDL Explore", "xplore v8"]) expect(critere({ ris }, "ris")).toMatchObject({ points: 2, valeur: "Xplore (EDL)" });
  });
  it("un autre RIS connu : 1 point", () => expect(critere({ ris: "Softway (One Manager)" }, "ris")).toMatchObject({ points: 1, valeur: "Softway" }));
  it("un éditeur hors liste reste un RIS connu : 1 point", () => expect(critere({ ris: "Rivoli" }, "ris")).toMatchObject({ points: 1, valeur: "Rivoli" }));
  it("« Plusieurs RIS » : 1 point", () => expect(critere({ ris: "Plusieurs RIS" }, "ris")).toMatchObject({ points: 1, valeur: "Plusieurs RIS" }));
  it("« Aucun RIS » n'est pas un RIS connu : 0 point", () => expect(critere({ ris: "Aucun RIS" }, "ris")).toMatchObject({ points: 0, valeur: "Aucun RIS" }));
  it("vide : 0 point, RIS inconnu", () => {
    expect(critere({}, "ris")).toMatchObject({ points: 0, valeur: "RIS inconnu" });
    expect(critere({ ris: "   " }, "ris").valeur).toBe("RIS inconnu");
  });
  it("sans RIS sur la fiche, lit celui des centres", () => {
    expect(critere({ centres: [{ ris: null, salles: 0 }, { ris: "Xplore", salles: 0 }] }, "ris"))
      .toMatchObject({ points: 2, valeur: "Xplore (EDL), RIS des centres" });
  });
  it("des centres sous deux familles sans Xplore valent « Plusieurs RIS », 1 point", () => {
    expect(critere({ centres: [{ ris: "Softway", salles: 0 }, { ris: "Enovacom", salles: 0 }] }, "ris"))
      .toMatchObject({ points: 1, valeur: "Plusieurs RIS, RIS des centres" });
  });
  it("un centre sous Xplore parmi d'autres RIS : 2 points, « Xplore et d'autres RIS »", () => {
    expect(critere({ centres: [{ ris: "Xplore", salles: 0 }, { ris: "Enovacom", salles: 0 }] }, "ris"))
      .toMatchObject({ points: 2, valeur: "Xplore et d'autres RIS, RIS des centres" });
  });
  it("une fiche qui dit « Plusieurs RIS » laisse les centres préciser", () => {
    expect(critere({ ris: "Plusieurs RIS", centres: [{ ris: "Xplore", salles: 0 }] }, "ris"))
      .toMatchObject({ points: 2, valeur: "Xplore et d'autres RIS, RIS des centres" });
    expect(critere({ ris: "Plusieurs RIS", centres: [{ ris: "Softway", salles: 0 }] }, "ris")).toMatchObject({ points: 1, valeur: "Plusieurs RIS" });
  });
  it.each(["Inconnu", "inconnu", "Inconnue", "inconnue", "Inconnu.", "NC", "nc", "N.C.", "N/A", "n/a", "?", "??", "-", "À vérifier", "à vérifier", "A verifier",
    "A vérifier avec le client", "Non renseigné", "non renseignée", "Pas encore", "Pas encore choisi"])(
    "« %s » dit qu'on ne sait pas : comme vide, 0 point, « RIS inconnu »", (ris) => expect(critere({ ris }, "ris")).toMatchObject({ points: 0, valeur: "RIS inconnu" }));
  it.each(["NCR Radiologie", "Navis", "Nacre", "Avérifix", "Inconnue Soft", "Medis ?"])("« %s » reste un nom d'éditeur : 1 point", (ris) =>
    expect(critere({ ris }, "ris").points).toBe(1));
  it.each(["Aucun RIS", "Aucun", "Aucune", "Aucune solution", "AUCUNE SOLUTION", "Non", "non", "Pas de RIS", "Sans RIS", "Sans", "Néant", "neant", "Rien", "0"])(
    "« %s » dit qu'il n'y a pas de RIS : 0 point, « Aucun RIS »", (ris) => expect(critere({ ris }, "ris")).toMatchObject({ points: 0, valeur: "Aucun RIS" }));
  it("une négation l'emporte sur le mot Xplore trouvé dans la saisie", () => {
    expect(critere({ ris: "Non Xplore" }, "ris")).toMatchObject({ points: 0, valeur: "Aucun RIS" });
    expect(critere({ ris: "Pas de RIS mais Xplore RDV" }, "ris")).toMatchObject({ points: 0, valeur: "Aucun RIS" });
    expect(critere({ centres: [{ ris: "Non Xplore", salles: 0 }] }, "ris")).toMatchObject({ points: 0, valeur: "Aucun RIS, RIS des centres" });
  });
  it("« Sans doute Xplore » est une incertitude, pas une négation : 2 points", () =>
    expect(critere({ ris: "Sans doute Xplore" }, "ris")).toMatchObject({ points: 2, valeur: "Xplore (EDL)" }));
  it("une fiche qui ne sait pas laisse les centres préciser", () => {
    expect(critere({ ris: "Inconnu", centres: [{ ris: "Xplore", salles: 0 }] }, "ris")).toMatchObject({ points: 2, valeur: "Xplore (EDL), RIS des centres" });
    expect(critere({ ris: "NC", centres: [{ ris: "Softway", salles: 0 }] }, "ris")).toMatchObject({ points: 1, valeur: "Softway, RIS des centres" });
    expect(critere({ ris: "À vérifier", centres: [{ ris: "Aucun RIS", salles: 0 }] }, "ris")).toMatchObject({ points: 0, valeur: "Aucun RIS, RIS des centres" });
    expect(critere({ ris: "?", centres: [{ ris: "NC", salles: 0 }] }, "ris")).toMatchObject({ points: 0, valeur: "RIS inconnu" });
  });
  it("une fiche « Aucun RIS » laisse aussi les centres préciser : un centre sous Xplore vaut 2", () => {
    expect(critere({ ris: "Aucun RIS", centres: [{ ris: "Xplore", salles: 0 }] }, "ris")).toMatchObject({ points: 2, valeur: "Xplore (EDL), RIS des centres" });
    expect(critere({ ris: "Aucun RIS", centres: [{ ris: "Softway", salles: 0 }] }, "ris")).toMatchObject({ points: 1, valeur: "Softway, RIS des centres" });
    expect(critere({ ris: "Aucun RIS", centres: [{ ris: null, salles: 0 }, { ris: "Inconnu", salles: 0 }] }, "ris")).toMatchObject({ points: 0, valeur: "Aucun RIS" });
  });
  it.each(["Nonobstant", "Aucunement", "Sansone", "Inconnue Soft", "Pasdebol"])("« %s » commence comme une négation sans en être une : 1 point", (ris) =>
    expect(critere({ ris }, "ris").points).toBe(1));
  it("des centres mêlés : un « Aucun RIS » ne masque pas le RIS d'un autre centre", () => {
    expect(critere({ centres: [{ ris: "Aucun RIS", salles: 0 }, { ris: "Xplore", salles: 0 }] }, "ris"))
      .toMatchObject({ points: 2, valeur: "Xplore (EDL), RIS des centres" });
    expect(critere({ centres: [{ ris: "Xplore", salles: 0 }, { ris: "Aucune solution", salles: 0 }, { ris: null, salles: 0 }] }, "ris"))
      .toMatchObject({ points: 2, valeur: "Xplore (EDL), RIS des centres" });
    expect(critere({ centres: [{ ris: "Inconnu", salles: 0 }, { ris: "Softway", salles: 0 }] }, "ris"))
      .toMatchObject({ points: 1, valeur: "Softway, RIS des centres" });
  });
  it("des centres tous sans RIS : « Aucun RIS », 0 point", () => {
    expect(critere({ centres: [{ ris: "Aucun RIS", salles: 0 }, { ris: "Non", salles: 0 }] }, "ris"))
      .toMatchObject({ points: 0, valeur: "Aucun RIS, RIS des centres" });
  });
  it("des centres mêlés, Xplore et un autre : 2 points, même avec un centre sans RIS", () => {
    expect(critere({ centres: [{ ris: "Xplore", salles: 0 }, { ris: "Aucun RIS", salles: 0 }, { ris: "Softway", salles: 0 }] }, "ris"))
      .toMatchObject({ points: 2, valeur: "Xplore et d'autres RIS, RIS des centres" });
  });
  it("des centres « NC » et « À vérifier » ne masquent pas un vrai RIS", () => {
    expect(critere({ centres: [{ ris: "NC", salles: 0 }, { ris: "À vérifier", salles: 0 }, { ris: "Softway", salles: 0 }] }, "ris"))
      .toMatchObject({ points: 1, valeur: "Softway, RIS des centres" });
  });
  it("le RIS de la fiche l'emporte sur celui des centres", () => {
    expect(critere({ ris: "Therasoft", centres: [{ ris: "Xplore", salles: 0 }] }, "ris")).toMatchObject({ points: 1, valeur: "Therasoft" });
  });
});

describe("temperature : décideur", () => {
  it("un décideur parmi les contacts : 2 points", () => {
    expect(critere({ contacts: [{ roleDecision: "UTILISATEUR" }, { roleDecision: "DECIDEUR" }] }, "decideur"))
      .toMatchObject({ points: 2, valeur: "Décideur parmi les contacts" });
  });
  it("un prescripteur seulement : 1 point", () => {
    expect(critere({ contacts: [{ roleDecision: "PRESCRIPTEUR" }, { roleDecision: "TECHNIQUE" }] }, "decideur"))
      .toMatchObject({ points: 1, valeur: "Prescripteur seulement, aucun décideur" });
  });
  it("aucun décideur ni prescripteur : 0 point", () => {
    expect(critere({ contacts: [{ roleDecision: "UTILISATEUR" }, { roleDecision: "INCONNU" }] }, "decideur"))
      .toMatchObject({ points: 0, valeur: "Aucun décideur parmi les contacts" });
    expect(critere({}, "decideur").points).toBe(0);
  });
  it("un décideur et un prescripteur ensemble : le décideur l'emporte, quel que soit l'ordre", () => {
    for (const contacts of [[{ roleDecision: "PRESCRIPTEUR" as const }, { roleDecision: "DECIDEUR" as const }], [{ roleDecision: "DECIDEUR" as const }, { roleDecision: "PRESCRIPTEUR" as const }]]) {
      expect(critere({ contacts }, "decideur")).toMatchObject({ points: 2, valeur: "Décideur parmi les contacts" });
    }
  });
  it("la case « Décideur rencontré » ne compte plus", () => {
    expect(critere({ qualifDecideur: true }, "decideur").points).toBe(0);
    expect(calcul({ qualifDecideur: true }).points.total).toBe(0);
  });
});

describe("temperature : budget et besoin", () => {
  it("budget évoqué : 2 points", () => {
    expect(critere({ qualifBudget: true }, "budget")).toMatchObject({ points: 2, valeur: "Budget évoqué" });
    expect(critere({}, "budget")).toMatchObject({ points: 0, valeur: "Budget pas encore évoqué" });
  });
  it("besoin exprimé : 1 point", () => {
    expect(critere({ qualifBesoin: true }, "besoin")).toMatchObject({ points: 1, valeur: "Besoin exprimé" });
    expect(critere({}, "besoin")).toMatchObject({ points: 0, valeur: "Besoin pas encore exprimé" });
  });
});

describe("temperature : date de décision", () => {
  it("aujourd'hui : 2 points", () => expect(critere({ decisionAttendueLe: "2026-11-18" }, "decision").points).toBe(2));
  it("à exactement 3 mois : 2 points", () => {
    expect(critere({ decisionAttendueLe: "2027-02-18" }, "decision")).toMatchObject({ points: 2, valeur: "Décision attendue le 18 février 2027, dans les 3 mois" });
  });
  it("la veille des 3 mois : 2 points", () => expect(critere({ decisionAttendueLe: "2027-02-17" }, "decision").points).toBe(2));
  it("le lendemain des 3 mois : 1 point", () => {
    expect(critere({ decisionAttendueLe: new Date("2027-02-19T00:00:00Z") }, "decision"))
      .toMatchObject({ points: 1, valeur: "Décision attendue le 19 février 2027, au-delà de 3 mois" });
  });
  it("une date passée : 0 point, et la raison le dit", () => {
    const r = calcul({ decisionAttendueLe: "2026-11-17" });
    expect(r.points.criteres.find((c) => c.cle === "decision")).toMatchObject({ points: 0, valeur: "Date de décision passée : 17 novembre 2026" });
    expect(r.raisons).toContain("Date de décision passée : mettez-la à jour.");
  });
  it("vide : 0 point", () => expect(critere({}, "decision")).toMatchObject({ points: 0, valeur: "Date de décision inconnue" }));
  it.each(["", "pas une date", "2026-13-45", "NaN", "   "])("une date illisible (%j) vaut 0 point, comme une date vide, sans « NaN »", (illisible) => {
    const r = calcul({ decisionAttendueLe: illisible });
    expect(r.points.criteres[4]).toMatchObject({ points: 0, valeur: "Date de décision inconnue" });
    expect(r.raisons).not.toContain("Date de décision passée : mettez-la à jour.");
    expect(JSON.stringify(r)).not.toContain("NaN");
  });
  it("une Date invalide, ou undefined, vaut aussi 0 point", () => {
    for (const illisible of [new Date("pas une date"), undefined as never]) {
      const r = calcul({ decisionAttendueLe: illisible });
      expect(r.points.criteres[4]).toMatchObject({ points: 0, valeur: "Date de décision inconnue" });
      expect(JSON.stringify(r)).not.toContain("NaN");
    }
  });
  it("une date illisible ne change pas le niveau par rapport à une date vide", () => {
    expect(calcul({ ...plein, decisionAttendueLe: "n'importe quoi" })).toEqual(calcul({ ...plein, decisionAttendueLe: null }));
  });
  it("un 30 novembre se borne au dernier jour de février", () => {
    const fin = new Date("2026-11-30T23:00:00Z");
    expect(temperature({ ...vide, decisionAttendueLe: "2027-02-28" }, fin).points.criteres[4].points).toBe(2);
    expect(temperature({ ...vide, decisionAttendueLe: "2027-03-01" }, fin).points.criteres[4].points).toBe(1);
  });
  it("la case « Calendrier connu » ne compte plus", () => {
    expect(critere({ qualifCalendrier: true }, "decision").points).toBe(0);
    expect(calcul({ qualifCalendrier: true }).points.total).toBe(0);
  });
});

describe("temperature : seuils", () => {
  // 4 points : RIS Xplore (2) et budget (2).
  it("4 points : froid, et ce qui manque pour tiède", () => {
    const r = calcul({ ris: "Xplore", qualifBudget: true });
    expect([r.points.total, r.calculee]).toEqual([4, "FROID"]);
    expect(r.raisons[0]).toBe("Froid : 4 points sur 11. Encore 1 point pour passer à Tiède.");
  });
  it("5 points : tiède", () => expect(calcul({ ris: "Xplore", qualifBudget: true, qualifBesoin: true }).calculee).toBe("TIEDE"));
  it("8 points : tiède, et ce qui manque pour chaud", () => {
    const r = calcul({ ris: "Xplore", qualifBudget: true, contacts: decideur, decisionAttendueLe: "2026-12-01" });
    expect([r.points.total, r.calculee]).toEqual([8, "TIEDE"]);
    expect(r.raisons[0]).toBe("Tiède : 8 points sur 11. Encore 1 point pour passer à Chaud.");
  });
  it("9 points : chaud", () => {
    const r = calcul({ ris: "Xplore", qualifBudget: true, contacts: decideur, decisionAttendueLe: "2026-12-01", qualifBesoin: true });
    expect([r.points.total, r.calculee]).toEqual([9, "CHAUD"]);
    expect(r.raisons[0]).toBe("Chaud : 9 points sur 11.");
  });
  it("liste les critères où il reste des points à gagner", () => {
    expect(calcul({ ris: "Xplore", qualifBudget: true }).raisons).toContain("Points à gagner : nombre de salles, décideur, date de décision, besoin.");
    expect(calcul(plein).raisons).toEqual(["Chaud : 11 points sur 11."]);
  });
});

describe("temperature : garde-fou du décideur", () => {
  it("11 points moins le décideur, avec un prescripteur : 10 points mais tiède", () => {
    const r = calcul({ ...plein, contacts: [{ roleDecision: "PRESCRIPTEUR" }] });
    expect([r.points.total, r.calculee]).toEqual([10, "TIEDE"]);
    expect(r.raisons[0]).toBe("Tiède : pas de décideur identifié.");
    expect(r.raisons[1]).toBe("10 points sur 11. Ajoutez un décideur parmi les contacts pour passer à Chaud.");
  });
  it("9 points sans aucun décideur ni prescripteur : tiède", () => {
    const r = calcul({ ...plein, contacts: [] });
    expect([r.points.total, r.calculee]).toEqual([9, "TIEDE"]);
    expect(r.raisons[0]).toBe("Tiède : pas de décideur identifié.");
  });
  it("ne joue pas en dessous de chaud", () => expect(calcul({ ris: "Xplore", qualifBudget: true }).raisons[0]).not.toContain("décideur identifié"));
  it("tiède sans décideur : la marche vers chaud cite le décideur", () => {
    const r = calcul({ ris: "Xplore", qualifBudget: true, qualifBesoin: true, nombreSalles: 6 });
    expect([r.points.total, r.calculee]).toEqual([7, "TIEDE"]);
    expect(r.raisons[0]).toBe("Tiède : 7 points sur 11. Pour passer à Chaud : 9 points, dont un décideur parmi les contacts.");
  });
});

describe("temperature : forçage", () => {
  const le = new Date("2026-11-10T09:00:00Z");
  it("sans forçage, la température affichée est le calcul", () => {
    const r = calcul(plein);
    expect([r.forcage, r.affichee, r.forceeDiffere]).toEqual([null, "CHAUD", false]);
  });
  it("un forçage égal au calcul ne diffère pas", () => {
    const r = calcul({ ...plein, temperatureForcee: "CHAUD", temperatureForceeParId: 7, temperatureForceeLe: le });
    expect(r.forcage).toEqual({ temperature: "CHAUD", parId: 7, le });
    expect([r.affichee, r.forceeDiffere]).toEqual(["CHAUD", false]);
  });
  it("un forçage différent l'emporte, et la raison donne le calcul", () => {
    const r = calcul({ temperatureForcee: "CHAUD", temperatureForceeParId: 7, temperatureForceeLe: "2026-11-10T09:00:00.000Z" });
    expect(r.forcage).toEqual({ temperature: "CHAUD", parId: 7, le });
    expect([r.calculee, r.affichee, r.forceeDiffere]).toEqual(["FROID", "CHAUD", true]);
    expect(r.raisons[0]).toBe("Forcée à Chaud. Le calcul dit Froid.");
  });
  it("un auteur supprimé laisse le forçage sans auteur", () => {
    expect(calcul({ temperatureForcee: "TIEDE", temperatureForceeParId: null, temperatureForceeLe: le }).forcage).toEqual({ temperature: "TIEDE", parId: null, le });
  });
});

describe("temperature : hors étapes commerciales", () => {
  const commerciales: CrmEtapeCommerciale[] = ["PROSPECT", "POURPARLERS", "VISIO_TECHNIQUE", "PROPOSITION"];
  it("chaque étape commerciale a une température", () => {
    for (const etape of commerciales) expect(calcul({ ...plein, etape }).calculee).toBe("CHAUD");
  });
  it.each(["SIGNE", "EN_INTEGRATION", "EN_PRODUCTION", "ARRETE"] as const)("%s, après la signature : sans objet", (etape) => {
    const r = calcul({ ...plein, etape });
    expect([r.sansObjet, r.calculee, r.affichee, r.forcage, r.forceeDiffere]).toEqual([true, null, null, null, false]);
    expect(r.raisons).toEqual(["Sans objet après la signature."]);
  });
  it.each(["PERDU", "EN_SOMMEIL"] as const)("%s, en sortie : sans objet", (etape) => {
    const r = calcul({ ...plein, etape });
    expect([r.sansObjet, r.calculee, r.affichee]).toEqual([true, null, null]);
    expect(r.raisons).toEqual(["Sans objet pour un dossier perdu ou en pause."]);
  });
  it("un forçage resté en base est ignoré après la signature", () => {
    const r = calcul({ etape: "SIGNE", temperatureForcee: "CHAUD", temperatureForceeParId: 7, temperatureForceeLe: new Date("2026-11-10T09:00:00Z") });
    expect([r.affichee, r.forcage, r.forceeDiffere]).toEqual([null, null, false]);
  });
  it("un forçage resté en base est ignoré pour un dossier perdu", () => {
    expect(calcul({ etape: "PERDU", temperatureForcee: "FROID", temperatureForceeParId: 7, temperatureForceeLe: new Date() }).affichee).toBeNull();
  });
});

describe("temperature : bornes du calendrier", () => {
  const points = (decision: string, aujourdhui: string) => temperature({ ...vide, decisionAttendueLe: decision }, new Date(aujourdhui)).points.criteres[4].points;
  it.each([
    ["année bissextile : 29 novembre 2027 + 3 mois = 29 février 2028", "2027-11-29T10:00:00Z", "2028-02-29", "2028-03-01"],
    ["30 novembre 2027 + 3 mois : borné au 29 février 2028", "2027-11-30T10:00:00Z", "2028-02-29", "2028-03-01"],
    ["31 mai 2026 + 3 mois = 31 août (31 jours)", "2026-05-31T10:00:00Z", "2026-08-31", "2026-09-01"],
    ["31 août 2026 + 3 mois : borné au 30 novembre", "2026-08-31T10:00:00Z", "2026-11-30", "2026-12-01"],
    ["31 octobre 2026 + 3 mois : borné au 31 janvier 2027 (passage d'année)", "2026-10-31T10:00:00Z", "2027-01-31", "2027-02-01"],
    ["30 novembre 2026 + 3 mois : borné au 28 février 2027 (non bissextile)", "2026-11-30T10:00:00Z", "2027-02-28", "2027-03-01"],
    ["15 décembre 2026 + 3 mois = 15 mars 2027 (passage d'année)", "2026-12-15T10:00:00Z", "2027-03-15", "2027-03-16"],
    ["31 décembre 2026 + 3 mois = 31 mars 2027", "2026-12-31T23:59:59Z", "2027-03-31", "2027-04-01"],
    ["départ un 29 février 2028 + 3 mois = 29 mai", "2028-02-29T10:00:00Z", "2028-05-29", "2028-05-30"],
    ["30 novembre 2028 + 3 mois : borné au 28 février 2029", "2028-11-30T10:00:00Z", "2029-02-28", "2029-03-01"],
  ])("%s : le dernier jour proche vaut 2 points, le lendemain 1", (_nom, aujourdhui, dernierProche, lendemain) => {
    expect(points(dernierProche, aujourdhui)).toBe(2);
    expect(points(lendemain, aujourdhui)).toBe(1);
  });
  it("la veille d'aujourd'hui est passée, aujourd'hui ne l'est pas, en bord d'année", () => {
    expect(points("2025-12-31", "2026-01-01T00:00:00Z")).toBe(0);
    expect(points("2026-01-01", "2026-01-01T00:00:00Z")).toBe(2);
  });
});

describe("temperature : indépendance à l'heure du jour et à l'horloge", () => {
  afterEach(() => vi.useRealTimers());
  const heures = ["00:00:00.000", "00:00:00.001", "08:30:00.000", "12:00:00.000", "23:30:00.000", "23:59:59.999"];
  const critereDecision = (e: Fiche, jour: string, heure: string) => temperature({ ...vide, ...e }, new Date(`${jour}T${heure}Z`)).points.criteres[4];
  it.each(heures)("à %s, un jour donné compte les mêmes points", (heure) => {
    expect(critereDecision({ decisionAttendueLe: "2027-02-18" }, "2026-11-18", heure).points).toBe(2);
    expect(critereDecision({ decisionAttendueLe: "2027-02-19" }, "2026-11-18", heure).points).toBe(1);
    expect(critereDecision({ decisionAttendueLe: "2026-11-18" }, "2026-11-18", heure).points).toBe(2);
    expect(critereDecision({ decisionAttendueLe: "2026-11-17" }, "2026-11-18", heure).points).toBe(0);
  });
  it.each(heures)("la date de décision a une heure (%s) : seul son jour compte", (heure) => {
    const decision = new Date(`2026-11-18T${heure}Z`);
    expect(critereDecision({ decisionAttendueLe: decision }, "2026-11-18", "00:00:00.000").points).toBe(2);
    expect(critereDecision({ decisionAttendueLe: decision }, "2026-11-18", "23:59:59.999").points).toBe(2);
    expect(critereDecision({ decisionAttendueLe: decision }, "2026-11-19", "00:00:00.000").points).toBe(0);
  });
  it("le jour donné change le résultat, pas l'horloge du système", () => {
    const e = { ...vide, decisionAttendueLe: "2027-02-19" };
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
    const avant = temperature(e, maintenant);
    vi.setSystemTime(new Date("2030-06-15T23:59:59Z"));
    expect(temperature(e, maintenant)).toEqual(avant);
    expect(avant.points.criteres[4].points).toBe(1);
    expect(temperature(e, new Date("2026-11-19T08:00:00Z")).points.criteres[4].points).toBe(2);
    expect(temperature(e, new Date("2027-02-20T08:00:00Z")).points.criteres[4].points).toBe(0);
  });
});

describe("temperature : forçage, cas limites", () => {
  const le = new Date("2026-11-10T09:00:00Z");
  /** 9 points sans décideur : le barème dit chaud, le garde-fou ramène à tiède. */
  const sansDecideur: Partial<EntreeTemperature> = { ...plein, contacts: [] };
  it("forcer Chaud sans décideur est permis et affiché tel quel : c'est un jugement humain (C-44)", () => {
    const r = calcul({ temperatureForcee: "CHAUD", temperatureForceeParId: 7, temperatureForceeLe: le });
    expect(r.points.criteres.find((c) => c.cle === "decideur")!.points).toBe(0);
    expect([r.calculee, r.affichee, r.forceeDiffere]).toEqual(["FROID", "CHAUD", true]);
    expect(r.forcage).toEqual({ temperature: "CHAUD", parId: 7, le });
    expect(r.raisons[0]).toBe("Forcée à Chaud. Le calcul dit Froid.");
  });
  it("forcer Chaud sur un dossier que le garde-fou ramène à tiède : affiché Chaud, la raison garde le garde-fou", () => {
    const r = calcul({ ...sansDecideur, temperatureForcee: "CHAUD", temperatureForceeParId: 7, temperatureForceeLe: le });
    expect([r.points.total, r.calculee, r.affichee, r.forceeDiffere]).toEqual([9, "TIEDE", "CHAUD", true]);
    expect(r.raisons[0]).toBe("Forcée à Chaud. Le calcul dit Tiède.");
    expect(r.raisons).toContain("Tiède : pas de décideur identifié.");
  });
  it("forcer Tiède, égal à ce que donne le garde-fou : pas d'écart", () => {
    const r = calcul({ ...sansDecideur, temperatureForcee: "TIEDE", temperatureForceeParId: 7, temperatureForceeLe: le });
    expect([r.calculee, r.affichee, r.forceeDiffere]).toEqual(["TIEDE", "TIEDE", false]);
    expect(r.forcage).toEqual({ temperature: "TIEDE", parId: 7, le });
    expect(r.raisons.some((raison) => raison.startsWith("Forcée"))).toBe(false);
  });
  it("forcer Froid sur un dossier chaud : affiché Froid, la raison dit que le calcul est Chaud", () => {
    const r = calcul({ ...plein, temperatureForcee: "FROID", temperatureForceeParId: 7, temperatureForceeLe: le });
    expect([r.points.total, r.calculee, r.affichee, r.forceeDiffere]).toEqual([11, "CHAUD", "FROID", true]);
    expect(r.raisons[0]).toBe("Forcée à Froid. Le calcul dit Chaud.");
  });
  it("une ligne ancienne, sans auteur ni date : le forçage vaut quand même", () => {
    const r = calcul({ ...plein, temperatureForcee: "FROID", temperatureForceeParId: null, temperatureForceeLe: null });
    expect(r.forcage).toEqual({ temperature: "FROID", parId: null, le: null });
    expect([r.affichee, r.forceeDiffere]).toEqual(["FROID", true]);
  });
  it("une date de forçage illisible est ramenée à « sans date », jamais à une Date invalide", () => {
    const r = calcul({ temperatureForcee: "TIEDE", temperatureForceeParId: 7, temperatureForceeLe: "pas une date" });
    expect(r.forcage).toEqual({ temperature: "TIEDE", parId: 7, le: null });
  });
  it("sans forçage stocké, un auteur ou une date restés en base ne forcent rien", () => {
    const r = calcul({ ...plein, temperatureForcee: null, temperatureForceeParId: 7, temperatureForceeLe: le });
    expect([r.forcage, r.affichee, r.forceeDiffere]).toEqual([null, "CHAUD", false]);
  });
});

describe("temperature : une seule vérité pour les étapes", () => {
  it.each(Object.values(CrmEtapeCommerciale))("%s : la température et le droit de forcer disent la même chose", (etape) => {
    expect(forcagePossible(etape)).toBe(!calcul({ etape }).sansObjet);
    const forcee = calcul({ etape, temperatureForcee: "CHAUD", temperatureForceeParId: 7, temperatureForceeLe: new Date("2026-11-10T09:00:00Z") });
    expect(forcee.forcage !== null).toBe(forcagePossible(etape));
    expect(forcee.affichee !== null).toBe(forcagePossible(etape));
  });
});
