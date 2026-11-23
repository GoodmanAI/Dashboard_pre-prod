import { expect, it } from "vitest";
import { prerequisDeploiement, PREREQUIS } from "./prerequis";
it("rattache les cinq prérequis sans doubler les sources existantes", () => {
  expect(PREREQUIS.map((p) => p.cle)).toEqual(["INTERFACAGE_TELEPHONIQUE", null, "BON_COMMANDE_EDL", null, "JETON_XPLORE"]);
  const p = prerequisDeploiement({ ris: "Xplore", produit: "LyraeTalk", cases: [{ cle: "INTERFACAGE_TELEPHONIQUE", faite: true }, { cle: "JETON_XPLORE", faite: true }] });
  expect(p.map((p) => p.faite)).toEqual([true, true, false, false, true]);
  expect(p.every((p) => p.applicable)).toBe(true);
  expect(p[2].detail).toContain("check-list");
  expect(p[3].detail).toContain("Contacts");
});
it("un RIS inconnu demande sa saisie sans dispenser des attentes EDL", () => {
  const p = prerequisDeploiement({ ris: "À vérifier", produit: "LyraeTalk", cases: [] });
  expect(p[1].faite).toBe(false); expect(p[1].detail).toContain("Renseignez"); expect(p[2].applicable).toBe(true);
});
it("Konnect sans EDL dit pourquoi la téléphonie et EDL sont sans objet", () => {
  const p = prerequisDeploiement({ ris: "Evolucare", produit: "Konnect", cases: [] });
  expect(p.filter((p) => !p.applicable).map((p) => p.id)).toEqual(["telephonie", "commande-edl", "commercial-edl"]);
  expect(p.filter((p) => !p.applicable).every((p) => p.detail.includes("Sans objet"))).toBe(true);
});
it("le commercial déjà identifié coche le prérequis, sans deuxième étape", () => {
  const p = prerequisDeploiement({ ris: "Xplore (EDL)", commercialEdl: true, produit: "LyraeTalk", cases: [] });
  expect(p[3]).toMatchObject({ cle: null, faite: true, applicable: true });
});
