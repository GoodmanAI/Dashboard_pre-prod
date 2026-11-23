import { afterEach, describe, expect, it, vi } from "vitest";
import { CrmTypeConcurrent } from "@prisma/client";
import { LIBELLES_TYPE_CONCURRENT, MESSAGE_DOUBLON, MESSAGE_FORCAGE_IMPOSSIBLE } from "@/pilot/lib/concurrents/regles";
import {
  creationConcurrent, creationReleve, messageConcurrent, modificationConcurrent, modificationReleve, RELEVE_FUTUR, SITE_WEB_INVALIDE, suppressionReleve,
} from "./concurrent";
import { forcageTemperature, retraitTemperature } from "./temperature";

const TIRETS = /[\u2014\u2013]/;
/** La version d'un relev\u00e9 lue par l'\u00e9cran. */
const LU = "2026-11-18T09:00:00.000Z";

const minimal = { nom: "Robot Alpha Voix", type: "ROBOT_VOCAL" };
describe("validation d'un concurrent", () => {
  it("crée le minimum, nettoie le nom et efface les champs vides", () => {
    const c = creationConcurrent.parse({ nom: "  Robot   Alpha  Voix ", type: "ROBOT_VOCAL", offre: " ", siteWeb: "", notes: "" });
    expect(c).toEqual({ nom: "Robot Alpha Voix", type: "ROBOT_VOCAL", offre: null, siteWeb: null, notes: null });
  });
  it("normalise le site web comme celui d'une organisation", () => {
    expect(creationConcurrent.parse({ ...minimal, siteWeb: "alpha.test" }).siteWeb).toBe("https://alpha.test");
    expect(creationConcurrent.parse({ ...minimal, siteWeb: "http://alpha.test" }).siteWeb).toBe("http://alpha.test");
  });
  it.each([
    { nom: "" }, { nom: "   " }, { nom: "a".repeat(121) }, { nom: undefined }, { type: "INCONNU" }, { type: undefined },
    { offre: "a".repeat(2001) }, { notes: "a".repeat(2001) }, { siteWeb: "a".repeat(301) }, { siteWeb: "ftp://alpha.test" },
    { siteWeb: "pas une adresse" }, { prix: 100 },
  ])("refuse une création invalide : %j", (champs) => expect(creationConcurrent.safeParse({ ...minimal, ...champs }).success).toBe(false));
  it("un nom fait seulement d'espaces insécables, fines ou idéographiques est refusé", () => {
    for (const nom of ["\u00A0\u00A0", "\u2009", "\u3000", " \t\n ", "\u00A0\u3000\u2009"]) expect(creationConcurrent.safeParse({ ...minimal, nom }).success, JSON.stringify(nom)).toBe(false);
  });
  it("un nom fait seulement de caractères de largeur nulle est refusé", () => {
    for (const nom of ["\u200B", "\u200C", "\u200D", "\u2060", "\uFEFF", "\u200B\u200C\u200D\u2060\uFEFF", " \u200B \u00A0"]) {
      expect(creationConcurrent.safeParse({ ...minimal, nom }).success, JSON.stringify(nom)).toBe(false);
    }
  });
  it("les caractères de largeur nulle sont retirés d'un nom qui en contient", () => {
    expect(creationConcurrent.parse({ ...minimal, nom: "Ro\u200Bbot\uFEFF Alpha\u2060" }).nom).toBe("Robot Alpha");
  });
  it("les espaces insécables, fines et idéographiques se compactent", () => {
    expect(creationConcurrent.parse({ ...minimal, nom: "\u00A0Robot\u2009\u3000Alpha\u00A0" }).nom).toBe("Robot Alpha");
  });
  it("É décomposé est enregistré composé", () => {
    expect(creationConcurrent.parse({ ...minimal, nom: "E\u0301diteur Beta" }).nom).toBe("\u00C9diteur Beta");
  });
  it("la longueur maximale s'applique au nom enregistré, après la compaction des espaces", () => {
    const espace = " ".repeat(10);
    // 126 caractères saisis, 117 une fois les espaces compactés : accepté.
    expect(creationConcurrent.parse({ ...minimal, nom: "a" + espace + "b".repeat(115) }).nom).toBe("a " + "b".repeat(115));
    // 120 caractères enregistrés, entourés d'espaces : accepté.
    expect(creationConcurrent.parse({ ...minimal, nom: espace + "a".repeat(120) + espace }).nom).toBe("a".repeat(120));
    // 121 caractères enregistrés : refusé, même entouré d'espaces.
    expect(creationConcurrent.safeParse({ ...minimal, nom: espace + "a".repeat(121) + espace }).success).toBe(false);
    expect(creationConcurrent.safeParse({ ...minimal, nom: "a".repeat(60) + " " + "b".repeat(60) }).success).toBe(false);
  });
  it("accepte les limites", () => {
    expect(creationConcurrent.safeParse({ nom: "a".repeat(120), type: "AUTRE", offre: "a".repeat(2000), notes: "b".repeat(2000) }).success).toBe(true);
  });
  const majLe = "2026-11-18T10:00:00.000Z";
  it("une modification porte la version lue et au moins un champ", () => {
    expect(modificationConcurrent.parse({ majLe, notes: "Nouvelle note" })).toMatchObject({ notes: "Nouvelle note", majLe: new Date(majLe) });
    expect(modificationConcurrent.parse({ majLe, offre: "" }).offre).toBeNull();
  });
  it.each([{}, { notes: "x" }, { majLe }, { majLe: "pas une date", notes: "x" }, { majLe, nom: "" }, { majLe, type: "INCONNU" }])(
    "refuse une modification invalide : %j", (v) => expect(modificationConcurrent.safeParse(v).success).toBe(false));
});

describe("modificationConcurrent : strict", () => {
  const majLe = "2026-11-18T10:00:00.000Z";
  it.each([{ prix: 1 }, { id: 3 }, { concurrentId: 3 }, { creeLe: "2026-01-01" }])("refuse un champ inconnu : %j", (extra) => {
    expect(modificationConcurrent.safeParse({ majLe, notes: "x", ...extra }).success).toBe(false);
    expect(modificationConcurrent.safeParse({ majLe, ...extra }).success).toBe(false);
  });
  it("accepte chaque champ connu, un par un", () => {
    for (const champs of [{ nom: "Beta" }, { type: "AUTRE" }, { offre: "x" }, { siteWeb: "beta.test" }, { notes: "x" }]) {
      expect(modificationConcurrent.safeParse({ majLe, ...champs }).success, JSON.stringify(champs)).toBe(true);
    }
  });
  it("le nom d'une modification est nettoyé comme celui d'une création", () => {
    expect(modificationConcurrent.parse({ majLe, nom: " Ro\u200Bbot   Beta " }).nom).toBe("Robot Beta");
    expect(modificationConcurrent.safeParse({ majLe, nom: "\u200B" }).success).toBe(false);
  });
});

describe("validation d'un relevé", () => {
  const complet = { releveLe: "2026-10-01", prixSalleMoisCentimes: 12000, prixInstallationCentimes: 0, conditions: "Engagement 12 mois", source: "Devis reçu" };
  it("accepte un relevé complet et un relevé réduit à sa date", () => {
    expect(creationReleve.parse(complet)).toMatchObject({ releveLe: new Date("2026-10-01"), prixSalleMoisCentimes: 12000, prixInstallationCentimes: 0 });
    expect(creationReleve.safeParse({ releveLe: "2026-10-01" }).success).toBe(true);
    expect(creationReleve.parse({ ...complet, prixInstallationCentimes: null, conditions: " " })).toMatchObject({ prixInstallationCentimes: null, conditions: null });
  });
  it.each([
    { releveLe: undefined }, { releveLe: "pas une date" }, { releveLe: "" },
    { prixSalleMoisCentimes: -1 }, { prixInstallationCentimes: -100 }, { prixSalleMoisCentimes: 12.5 }, { prixSalleMoisCentimes: "120" },
    { prixSalleMoisCentimes: 2147483648 }, { conditions: "a".repeat(2001) }, { source: "a".repeat(2001) }, { concurrentId: 3 },
  ])("refuse un relevé invalide : %j", (champs) => expect(creationReleve.safeParse({ ...complet, ...champs }).success).toBe(false));
  it("refuse une date dans le futur et le dit", () => {
    const demain = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const analyse = creationReleve.safeParse({ ...complet, releveLe: demain });
    expect(analyse.success).toBe(false);
    if (!analyse.success) expect(messageConcurrent(analyse.error)).toBe(RELEVE_FUTUR);
  });
  it("accepte les montants limites", () => {
    expect(creationReleve.safeParse({ releveLe: "2026-10-01", prixSalleMoisCentimes: 2147483647 }).success).toBe(true);
  });
  const montants = ["prixSalleMoisCentimes", "prixInstallationCentimes"] as const;
  it.each(montants)("%s : refuse ce qui n'est pas un entier de centimes", (champ) => {
    for (const valeur of [1e21, 2 ** 53, NaN, Infinity, -Infinity, 0.1 + 0.2, 12.5, true, false, [], {}, "120", "", -1, 2147483648]) {
      expect(creationReleve.safeParse({ releveLe: "2026-10-01", [champ]: valeur }).success, String(valeur)).toBe(false);
      expect(modificationReleve.safeParse({ majLe: LU, [champ]: valeur }).success, String(valeur)).toBe(false);
    }
  });
  it.each(montants)("%s : accepte 0, 12.0, 1e2, la borne et l'absence", (champ) => {
    for (const [valeur, attendu] of [[0, 0], [12.0, 12], [1e2, 100], [2147483647, 2147483647], [null, null], [undefined, undefined]] as const) {
      const analyse = creationReleve.safeParse({ releveLe: "2026-10-01", [champ]: valeur });
      expect(analyse.success, String(valeur)).toBe(true);
      if (analyse.success) expect(analyse.data[champ]).toBe(attendu);
    }
  });
  it("un relevé daté d'aujourd'hui s'accepte, quel que soit le moment de la journée UTC", () => {
    for (const heure of ["00:00:00.000", "00:30:00.000", "12:00:00.000", "23:30:00.000", "23:59:59.999"]) {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(`2026-11-18T${heure}Z`));
      expect(creationReleve.safeParse({ releveLe: "2026-11-18" }).success, heure).toBe(true);
      expect(modificationReleve.safeParse({ majLe: LU, releveLe: "2026-11-18" }).success, heure).toBe(true);
      expect(creationReleve.safeParse({ releveLe: "2026-11-17" }).success, heure).toBe(true);
    }
  });
  it("à 23 h 30 UTC, le jour UTC passe et le lendemain UTC est refusé", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T23:30:00.000Z"));
    expect(creationReleve.safeParse({ releveLe: "2026-11-18" }).success).toBe(true);
    expect(creationReleve.safeParse({ releveLe: "2026-11-18T23:30:00.000Z" }).success).toBe(true);
    const lendemain = creationReleve.safeParse({ releveLe: "2026-11-19" });
    expect(lendemain.success).toBe(false);
    if (!lendemain.success) expect(messageConcurrent(lendemain.error)).toBe(RELEVE_FUTUR);
    expect(modificationReleve.safeParse({ majLe: LU, releveLe: "2026-11-19" }).success).toBe(false);
  });
  it("juste après minuit UTC, la veille et le jour passent, le lendemain est refusé", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T00:30:00.000Z"));
    expect(creationReleve.safeParse({ releveLe: "2026-11-18" }).success).toBe(true);
    expect(creationReleve.safeParse({ releveLe: "2026-11-19" }).success).toBe(true);
    expect(creationReleve.safeParse({ releveLe: "2026-11-20" }).success).toBe(false);
  });
  it("une date inexistante est refusée, avec le message générique du champ", () => {
    for (const releveLe of ["2026-02-30", "2027-02-29", "Nov 18 2026", "1"]) {
      const analyse = creationReleve.safeParse({ releveLe });
      expect(analyse.success, releveLe).toBe(false);
      if (!analyse.success) expect(messageConcurrent(analyse.error)).toBe("Vérifiez le champ « Date du relevé ».");
    }
  });
  afterEach(() => vi.useRealTimers());
  it("la date d'un relevé ne s'efface pas", () => {
    expect(modificationReleve.safeParse({ majLe: LU, releveLe: null }).success).toBe(false);
    expect(modificationReleve.safeParse({ majLe: LU, releveLe: "" }).success).toBe(false);
    expect(modificationReleve.safeParse({ majLe: LU, releveLe: null, source: "Devis" }).success).toBe(false);
    expect(modificationReleve.safeParse({ majLe: LU, releveLe: undefined }).success).toBe(false);
    expect(creationReleve.safeParse({ releveLe: null }).success).toBe(false);
  });
  it("modificationReleve est strict : un champ inconnu est refusé, seul ou avec un champ valide", () => {
    for (const extra of [{ concurrentId: 3 }, { id: 1 }, { prix: 100 }, { creeLe: "2026-01-01" }]) {
      expect(modificationReleve.safeParse({ majLe: LU, ...extra }).success, JSON.stringify(extra)).toBe(false);
      expect(modificationReleve.safeParse({ majLe: LU, source: "Devis", ...extra }).success, JSON.stringify(extra)).toBe(false);
    }
    expect(modificationReleve.safeParse({ majLe: LU, source: "Devis" }).success).toBe(true);
  });
  it("une modification demande la version lue et au moins un champ, et garde les mêmes bornes", () => {
    expect(modificationReleve.safeParse({}).success).toBe(false);
    expect(modificationReleve.safeParse({ majLe: LU }).success).toBe(false);
    expect(modificationReleve.safeParse({ source: "Devis" }).success).toBe(false);
    expect(modificationReleve.safeParse({ majLe: "pas une date", source: "Devis" }).success).toBe(false);
    expect(modificationReleve.parse({ majLe: LU, source: "Devis" })).toEqual({ majLe: new Date(LU), source: "Devis" });
    expect(modificationReleve.parse({ majLe: LU, prixInstallationCentimes: null })).toEqual({ majLe: new Date(LU), prixInstallationCentimes: null });
    expect(modificationReleve.safeParse({ majLe: LU, releveLe: new Date(Date.now() + 86400000).toISOString() }).success).toBe(false);
    expect(modificationReleve.safeParse({ majLe: LU, prixSalleMoisCentimes: -5 }).success).toBe(false);
  });
});

describe("messageConcurrent", () => {
  it("nomme le champ à corriger, sinon reste générique", () => {
    const nom = creationConcurrent.safeParse({ ...minimal, nom: "" });
    const inconnu = creationConcurrent.safeParse({ ...minimal, prix: 1 });
    expect(nom.success || inconnu.success).toBe(false);
    if (!nom.success) expect(messageConcurrent(nom.error)).toBe("Vérifiez le champ « Nom ».");
    if (!inconnu.success) expect(messageConcurrent(inconnu.error)).toBe("Corps de requête invalide.");
  });
  it("aucun refus ne contient de tiret cadratin ni demi-cadratin", () => {
    const refus = [
      creationConcurrent.safeParse({}), creationConcurrent.safeParse({ ...minimal, nom: "\u200B" }), creationConcurrent.safeParse({ ...minimal, siteWeb: "ftp://x" }),
      creationConcurrent.safeParse({ ...minimal, offre: "a".repeat(2001) }), creationConcurrent.safeParse({ ...minimal, type: "INCONNU" }),
      creationReleve.safeParse({ releveLe: "2999-01-01" }), creationReleve.safeParse({}), creationReleve.safeParse({ releveLe: "2026-10-01", prixSalleMoisCentimes: -1 }),
      creationReleve.safeParse({ releveLe: "2026-10-01", conditions: "a".repeat(2001) }), creationReleve.safeParse({ releveLe: "2026-10-01", source: "a".repeat(2001) }),
      modificationConcurrent.safeParse({}), modificationReleve.safeParse({}),
    ];
    for (const analyse of refus) {
      expect(analyse.success).toBe(false);
      if (!analyse.success) expect(messageConcurrent(analyse.error)).not.toMatch(TIRETS);
    }
  });
  it("les messages fixes ne contiennent aucun tiret cadratin ni demi-cadratin", () => {
    for (const message of [RELEVE_FUTUR, SITE_WEB_INVALIDE, MESSAGE_DOUBLON, MESSAGE_FORCAGE_IMPOSSIBLE]) expect(message).not.toMatch(TIRETS);
  });
  it("un site web invalide est dit comme tel", () => {
    const analyse = creationConcurrent.safeParse({ ...minimal, siteWeb: "ftp://alpha.test" });
    expect(analyse.success).toBe(false);
    if (!analyse.success) expect(messageConcurrent(analyse.error)).toBe(SITE_WEB_INVALIDE);
  });
  it("chaque type valide a un libellé", () => {
    for (const type of Object.values(CrmTypeConcurrent)) {
      expect(creationConcurrent.safeParse({ ...minimal, type }).success, type).toBe(true);
      expect(LIBELLES_TYPE_CONCURRENT[type], type).toBeTruthy();
    }
  });
});

describe("validation du forçage de température", () => {
  it("demande la température et ce que l'écran a lu", () => {
    expect(forcageTemperature.parse({ temperature: "CHAUD", forceeLe: null })).toEqual({ temperature: "CHAUD", forceeLe: null });
    expect(forcageTemperature.parse({ temperature: "FROID", forceeLe: "2026-11-18T10:00:00.000Z" }).forceeLe).toEqual(new Date("2026-11-18T10:00:00.000Z"));
  });
  it.each([{}, { temperature: "CHAUD" }, { forceeLe: null }, { temperature: "BRULANT", forceeLe: null }, { temperature: "CHAUD", forceeLe: "x" }, { temperature: "CHAUD", forceeLe: null, etape: "SIGNE" }])(
    "refuse : %j", (v) => expect(forcageTemperature.safeParse(v).success).toBe(false));
  it("le retrait peut se faire sans rien rappeler", () => {
    expect(retraitTemperature.safeParse({}).success).toBe(true);
    expect(retraitTemperature.safeParse({ forceeLe: null }).success).toBe(true);
    expect(retraitTemperature.safeParse({ forceeLe: "pas une date" }).success).toBe(false);
  });
});

describe("suppressionReleve", () => {
  it("accepte un corps vide ou la version lue, rien d'autre", () => {
    expect(suppressionReleve.parse({})).toEqual({});
    expect(suppressionReleve.parse({ majLe: LU })).toEqual({ majLe: new Date(LU) });
    for (const corps of [{ majLe: "pas une date" }, { majLe: null }, { id: 3 }, null]) expect(suppressionReleve.safeParse(corps).success, JSON.stringify(corps)).toBe(false);
  });
});
