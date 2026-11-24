import { describe, expect, it } from "vitest";
import { conseilCritere, libelleAccessible, NIVEAUX_TEMPERATURE, phraseForcage, pourLEcran, rangTemperature, resumeTemperature } from "./temperatureAffichage";
import { temperature, type EntreeTemperature } from "./temperature";

const maintenant = new Date("2026-11-18T10:00:00Z");
const vide: EntreeTemperature = {
  etape: "PROSPECT", nombreSalles: null, nombreIrm: null, nombreScanners: null, nombreRadio: null, nombreEcho: null, nombreMammo: null, ris: null, centres: [], contacts: [], qualifBudget: false, qualifBesoin: false,
  decisionAttendueLe: null, temperatureForcee: null, temperatureForceeParId: null, temperatureForceeLe: null,
};

describe("resumeTemperature", () => {
  it("donne le niveau calculé d'un prospect, non forcé", () => {
    expect(resumeTemperature(temperature(vide, maintenant))).toEqual({ niveau: "FROID", forcee: false });
  });
  it("donne le niveau forcé et le dit", () => {
    const r = temperature({ ...vide, temperatureForcee: "CHAUD", temperatureForceeParId: 1, temperatureForceeLe: "2026-11-18T09:00:00Z" }, maintenant);
    expect(resumeTemperature(r)).toEqual({ niveau: "CHAUD", forcee: true });
  });
  it("ne donne rien après la signature", () => {
    expect(resumeTemperature(temperature({ ...vide, etape: "SIGNE" }, maintenant))).toBeNull();
  });
  it("ne donne rien pour un dossier perdu ou en pause, même forcé", () => {
    expect(resumeTemperature(temperature({ ...vide, etape: "PERDU", temperatureForcee: "CHAUD" }, maintenant))).toBeNull();
    expect(resumeTemperature(temperature({ ...vide, etape: "EN_SOMMEIL" }, maintenant))).toBeNull();
  });
});

describe("pourLEcran", () => {
  it("passe les dates en chaîne et garde le nom de l'auteur", () => {
    const r = temperature({ ...vide, temperatureForcee: "CHAUD", temperatureForceeParId: 4, temperatureForceeLe: "2026-11-18T09:00:00Z" }, maintenant);
    const e = pourLEcran(r, "Camille Alpha");
    expect(e.forcage).toEqual({ temperature: "CHAUD", le: "2026-11-18T09:00:00.000Z", parNom: "Camille Alpha" });
    expect(() => JSON.stringify(e)).not.toThrow();
  });
  it("garde le détail des points d'un dossier avant signature", () => {
    expect(pourLEcran(temperature(vide, maintenant), null).points.criteres).toHaveLength(6);
  });
  it("masque le détail des points quand la température est sans objet", () => {
    const e = pourLEcran(temperature({ ...vide, etape: "EN_PRODUCTION" }, maintenant), null);
    expect(e.sansObjet).toBe(true);
    expect(e.points.criteres).toEqual([]);
    expect(e.raisons).toEqual(["Sans objet après la signature."]);
  });
  it("rend un forçage nul quand il n'y en a pas", () => {
    expect(pourLEcran(temperature(vide, maintenant), null).forcage).toBeNull();
  });
});

describe("rangTemperature", () => {
  it("range du plus chaud au plus froid, sans température en dernier", () => {
    expect([null, "FROID", "CHAUD", "TIEDE"].map((n) => rangTemperature(n as never))).toEqual([3, 2, 0, 1]);
    expect(NIVEAUX_TEMPERATURE.map(rangTemperature)).toEqual([0, 1, 2]);
  });
});

describe("libelleAccessible", () => {
  it("dit la température en toutes lettres", () => {
    expect(libelleAccessible({ niveau: "TIEDE", forcee: false })).toBe("Température : tiède");
    expect(libelleAccessible({ niveau: "CHAUD", forcee: true })).toBe("Température : chaud, forcée");
  });
});

describe("phraseForcage", () => {
  const le = "2026-11-18T09:00:00Z";
  it("nomme l'auteur, le jour et ce que dit le calcul", () => {
    expect(phraseForcage({ temperature: "CHAUD", le, parNom: "Camille Alpha" }, "TIEDE")).toBe("Forcée chaud par Camille Alpha le 18/11, le calcul dit tiède.");
  });
  it("dit quand le calcul donne le même niveau", () => {
    expect(phraseForcage({ temperature: "TIEDE", le, parNom: "Camille Alpha" }, "TIEDE")).toBe("Forcée tiède par Camille Alpha le 18/11, comme le calcul.");
  });
  it("se tait sur l'auteur et la date quand le compte ou la date manquent", () => {
    expect(phraseForcage({ temperature: "FROID", le: null, parNom: null }, "CHAUD")).toBe("Forcée froid, le calcul dit chaud.");
  });
  it("accepte une date en objet comme en chaîne", () => {
    expect(phraseForcage({ temperature: "FROID", le: new Date(le), parNom: null }, null)).toBe("Forcée froid le 18/11.");
  });
});

describe("conseilCritere", () => {
  const critere = (cle: Parameters<typeof conseilCritere>[0]["cle"], points: number, possibles: number) => ({ cle, points, possibles });
  it("ne dit rien d'un critère complet", () => {
    expect(conseilCritere(critere("decideur", 2, 2))).toEqual({ texte: null, action: null });
  });
  it("propose d'ajouter un décideur quand il n'y en a pas, et ouvre le contact", () => {
    expect(conseilCritere(critere("decideur", 0, 2))).toEqual({ texte: "Ajoutez un contact décideur.", action: "contact" });
  });
  it("propose de repérer le décideur quand il n'y a qu'un prescripteur", () => {
    expect(conseilCritere(critere("decideur", 1, 2)).texte).toContain("Repérez le décideur");
  });
  it("dit où se règle la date de décision", () => {
    expect(conseilCritere(critere("decision", 0, 2)).texte).toContain("« Décision attendue »");
    expect(conseilCritere(critere("decision", 1, 2)).texte).toContain("3 mois");
  });
  it("renvoie vers la modification de l'organisation pour les salles et le RIS", () => {
    expect(conseilCritere(critere("taille", 0, 2)).action).toBe("organisation");
    expect(conseilCritere(critere("taille", 1, 2)).texte).toContain("6 salles");
    expect(conseilCritere(critere("ris", 0, 2)).action).toBe("organisation");
    expect(conseilCritere(critere("ris", 1, 2)).texte).toContain("Xplore");
  });
  it("« Aucun RIS » a son propre conseil : renseigner le RIS ne servirait à rien", () => {
    const aucun = conseilCritere({ ...critere("ris", 0, 2), valeur: "Aucun RIS, RIS des centres" });
    expect(aucun.texte).toBe("Sans RIS, le dossier ne gagne pas ce point. Notez le RIS s'il en choisit un.");
    expect(aucun.action).toBe("organisation");
    expect(conseilCritere({ ...critere("ris", 0, 2), valeur: "RIS inconnu" }).texte).toBe("Renseignez le RIS utilisé par l'établissement.");
    const lu = temperature({ ...vide, ris: "Néant" }, maintenant).points.criteres.find((c) => c.cle === "ris")!;
    expect(conseilCritere(lu).texte).toContain("Sans RIS");
  });
  it("« Inconnu » n'est pas « Aucun RIS » : le conseil demande de renseigner le RIS", () => {
    for (const ris of ["Inconnu", "NC", "À vérifier", "N/A"]) {
      const lu = temperature({ ...vide, ris }, maintenant).points.criteres.find((c) => c.cle === "ris")!;
      expect(lu.valeur).toBe("RIS inconnu");
      expect(conseilCritere(lu)).toEqual({ texte: "Renseignez le RIS utilisé par l'établissement.", action: "organisation" });
    }
  });
  it("renvoie vers les cases pour le budget et le besoin", () => {
    expect(conseilCritere(critere("budget", 0, 2)).texte).toContain("Budget évoqué");
    expect(conseilCritere(critere("besoin", 0, 1)).texte).toContain("Besoin exprimé");
  });
  it("donne un conseil à chaque critère incomplet du barème", () => {
    for (const c of temperature(vide, maintenant).points.criteres) {
      expect(conseilCritere(c).texte, c.cle).toBeTruthy();
    }
  });
  it("n'emploie ni tiret cadratin ni emoji", () => {
    for (const c of temperature(vide, maintenant).points.criteres) expect(conseilCritere(c).texte).not.toMatch(/—/u);
  });
});
