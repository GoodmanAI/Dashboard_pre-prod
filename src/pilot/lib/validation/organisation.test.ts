import { describe, expect, it } from "vitest";
import { changementEtape, creationOrganisation, majOrganisation } from "./organisation";

const minimale = { raisonSocialeNom: " Cabinet ", type: "CABINET", responsableId: 1 };
describe("validation organisation", () => {
  it("crée le minimum et nettoie le nom", () => expect(creationOrganisation.parse(minimale).raisonSocialeNom).toBe("Cabinet"));
  it.each([
    { raisonSocialeNom: "" }, { raisonSocialeNom: " " }, { raisonSocialeNom: "a".repeat(201) },
    { type: "INCONNU" }, { responsableId: undefined }, { responsableId: null }, { responsableId: -1 },
    { nombreSites: -1 }, { nombreSalles: 1.5 }, { volumeAppelsEstime: 2147483648 },
    { chefDeProjetId: 0 }, { contactPrincipal: { nom: " " } }, { etape: "SIGNE" },
  ])("refuse une création invalide : %j", (champs) => expect(creationOrganisation.safeParse({ ...minimale, ...champs }).success).toBe(false));
  it("accepte les limites et le contact facultatif", () => {
    const org = creationOrganisation.parse({ ...minimale, raisonSocialeNom: "a".repeat(200), nombreSites: 0, nombreSalles: null,
      ris: " ", chefDeProjetId: null, contactPrincipal: { nom: " Contact ", email: "" } });
    expect(org.ris).toBeNull();
    expect(org.contactPrincipal).toMatchObject({ nom: "Contact", email: null, roleDecision: "INCONNU", principal: false });
  });
  it.each([{}, { etape: "SIGNE" }, { raisonSocialeNom: "" }, { nombreSites: -1 }, { responsableId: undefined }, { ris: "X", etape: "SIGNE" }])(
    "refuse une modification invalide : %j", (v) => expect(majOrganisation.safeParse(v).success).toBe(false));
  it("modifie un seul champ et permet d'effacer les liens facultatifs", () => {
    expect(majOrganisation.parse({ utilisateurId: null })).toEqual({ utilisateurId: null });
    expect(majOrganisation.parse({ ris: "" })).toEqual({ ris: null });
  });
});

describe("concurrent d'une organisation (lot R)", () => {
  it("le PATCH accepte un concurrent en place, ou null pour le retirer", () => {
    expect(majOrganisation.parse({ concurrentId: 3 })).toEqual({ concurrentId: 3 });
    expect(majOrganisation.parse({ concurrentId: null })).toEqual({ concurrentId: null });
  });
  it.each([0, -1, 1.5, "3", 2147483648])("le PATCH refuse un identifiant de concurrent invalide : %j", (concurrentId) =>
    expect(majOrganisation.safeParse({ concurrentId }).success).toBe(false));
  it("la création ne prend pas de concurrent : il se pose sur une fiche existante", () =>
    expect(creationOrganisation.safeParse({ ...minimale, concurrentId: 3 }).success).toBe(false));
  it("la sortie accepte le gagnant avec Perdu et le motif Concurrent", () => {
    expect(changementEtape.parse({ etape: "PERDU", raisonSortie: "Parti", raisonSortieCode: "CONCURRENT", concurrentGagnantId: 2 }).concurrentGagnantId).toBe(2);
    expect(changementEtape.safeParse({ etape: "PERDU", raisonSortie: "Parti", raisonSortieCode: "CONCURRENT", concurrentGagnantId: null }).success).toBe(true);
  });
  it.each([
    { etape: "PERDU", raisonSortie: "Prix", raisonSortieCode: "PRIX", concurrentGagnantId: 2 },
    { etape: "PERDU", raisonSortie: "Parti", concurrentGagnantId: 2 },
    { etape: "EN_SOMMEIL", raisonSortie: "Parti", raisonSortieCode: "CONCURRENT", concurrentGagnantId: 2 },
    { etape: "PROSPECT", concurrentGagnantId: 2 },
    { etape: "PERDU", raisonSortie: "Parti", raisonSortieCode: "CONCURRENT", concurrentGagnantId: 0 },
  ])("la sortie refuse un gagnant sans le motif ou l'étape qui le justifient : %j", (corps) =>
    expect(changementEtape.safeParse(corps).success).toBe(false));
  it("les changements d'étape sans gagnant restent valides", () => {
    expect(changementEtape.safeParse({ etape: "PROSPECT" }).success).toBe(true);
    expect(changementEtape.safeParse({ etape: "PERDU", raisonSortie: "x", raisonSortieCode: "PRIX" }).success).toBe(true);
  });
});
