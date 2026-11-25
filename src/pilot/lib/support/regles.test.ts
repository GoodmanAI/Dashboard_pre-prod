import { describe, expect, it } from "vitest";
import { ajouterJoursOuvres, destinatairesSupport, refusChangementStatut, relanceDue, statutApresMessage, statutInitial } from "./regles";

const equipe = [{ id: 1, actif: true }, { id: 2, actif: true }, { id: 3, actif: true }, { id: 4, actif: false }];

describe("destinataires", () => {
  it("le commercial du client en tête, les autres en copie, jamais l'auteur ni un compte retiré", () => {
    expect(destinatairesSupport({ responsableId: 2, equipe, auteurId: 1 })).toEqual({ principal: 2, copie: [3] });
  });
  it("le commercial qui écrit lui-même : tout le monde en copie, personne en tête", () => {
    expect(destinatairesSupport({ responsableId: 2, equipe, auteurId: 2 })).toEqual({ principal: null, copie: [1, 3] });
  });
  it("un commercial retiré ou absent ne reçoit rien", () => {
    expect(destinatairesSupport({ responsableId: 4, equipe, auteurId: 1 })).toEqual({ principal: null, copie: [2, 3] });
    expect(destinatairesSupport({ responsableId: null, equipe, auteurId: null })).toEqual({ principal: null, copie: [1, 2, 3] });
  });
});

describe("statuts", () => {
  it("un texte pour le client met à transmettre, une note rouvre un sujet résolu", () => {
    expect(statutInitial(true)).toBe("A_TRANSMETTRE");
    expect(statutInitial(false)).toBe("OUVERT");
    expect(statutApresMessage("TRANSMIS", true)).toBe("A_TRANSMETTRE");
    expect(statutApresMessage("RESOLU", false)).toBe("OUVERT");
    expect(statutApresMessage("TRANSMIS", false)).toBe("TRANSMIS");
  });
  it("transmis seulement depuis à transmettre, rouvrir seulement depuis résolu", () => {
    expect(refusChangementStatut("A_TRANSMETTRE", "TRANSMIS")).toBeNull();
    expect(refusChangementStatut("OUVERT", "TRANSMIS")).not.toBeNull();
    expect(refusChangementStatut("TRANSMIS", "RESOLU")).toBeNull();
    expect(refusChangementStatut("RESOLU", "OUVERT")).toBeNull();
    expect(refusChangementStatut("TRANSMIS", "OUVERT")).not.toBeNull();
    expect(refusChangementStatut("OUVERT", "A_TRANSMETTRE")).not.toBeNull();
    expect(refusChangementStatut("RESOLU", "RESOLU")).not.toBeNull();
  });
});

describe("relance à un jour ouvré", () => {
  it("saute le week-end", () => {
    const vendredi = new Date("2026-11-27T16:00:00Z");
    expect(ajouterJoursOuvres(vendredi, 1).toISOString()).toBe("2026-11-30T16:00:00.000Z");
  });
  it("due après un jour ouvré à transmettre, puis chaque jour ouvré", () => {
    const s = { statut: "A_TRANSMETTRE" as const, statutDepuisLe: new Date("2026-11-25T10:00:00Z"), derniereRelanceLe: null };
    expect(relanceDue(s, new Date("2026-11-26T09:59:00Z"))).toBe(false);
    expect(relanceDue(s, new Date("2026-11-26T10:00:00Z"))).toBe(true);
    expect(relanceDue({ ...s, derniereRelanceLe: new Date("2026-11-26T10:05:00Z") }, new Date("2026-11-26T18:00:00Z"))).toBe(false);
    expect(relanceDue({ ...s, derniereRelanceLe: new Date("2026-11-26T10:05:00Z") }, new Date("2026-11-27T10:05:00Z"))).toBe(true);
  });
  it("jamais pour un sujet transmis, ouvert ou résolu", () => {
    for (const statut of ["OUVERT", "TRANSMIS", "RESOLU"] as const) {
      expect(relanceDue({ statut, statutDepuisLe: new Date("2026-01-01T00:00:00Z"), derniereRelanceLe: null }, new Date())).toBe(false);
    }
  });
});
