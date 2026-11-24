import { describe, expect, it } from "vitest";
import { enRetard, LIBELLES_DEMANDE, refusAnnuler, refusCreer, refusTraiter, TYPES_DEMANDE, typeSuggere } from "./regles";

const jour = new Date("2026-11-06T00:00:00.000Z");
const ouverte = { statut: "OUVERTE" as const, demandeurId: 1, destinataireId: 2 };
const commercial = { id: 1, role: "ADMIN" };
const chefDeProjet = { id: 2, role: "ADMIN" };
const tiers = { id: 3, role: "ADMIN" };
const superAdmin = { id: 9, role: "SUPER_ADMIN" };

describe("demandes (C-58)", () => {
  it("chaque type a son libellé, sans tiret cadratin", () => {
    expect(TYPES_DEMANDE).toHaveLength(14);
    for (const t of TYPES_DEMANDE) expect(LIBELLES_DEMANDE[t]).not.toMatch(/—/);
  });

  it("seul le destinataire, ou un super-administrateur, marque faite", () => {
    expect(refusTraiter(ouverte, chefDeProjet)).toBeNull();
    expect(refusTraiter(ouverte, superAdmin)).toBeNull();
    expect(refusTraiter(ouverte, commercial)?.statut).toBe(403);
    expect(refusTraiter(ouverte, tiers)?.statut).toBe(403);
  });

  it("seul le demandeur, ou un super-administrateur, annule", () => {
    expect(refusAnnuler(ouverte, commercial)).toBeNull();
    expect(refusAnnuler(ouverte, superAdmin)).toBeNull();
    expect(refusAnnuler(ouverte, chefDeProjet)?.statut).toBe(403);
  });

  it("une demande traitée ne se retraite pas : 409", () => {
    for (const statut of ["FAITE", "ANNULEE"] as const) {
      expect(refusTraiter({ ...ouverte, statut }, chefDeProjet)?.statut).toBe(409);
      expect(refusAnnuler({ ...ouverte, statut }, commercial)?.statut).toBe(409);
    }
  });

  it("on ne se demande rien à soi-même, et l'échéance n'est pas passée", () => {
    expect(refusCreer({ destinataireId: 1, echeanceLe: null }, commercial, jour)?.statut).toBe(400);
    expect(refusCreer({ destinataireId: 2, echeanceLe: new Date("2026-11-05T00:00:00Z") }, commercial, jour)?.statut).toBe(400);
    expect(refusCreer({ destinataireId: 2, echeanceLe: jour }, commercial, jour)).toBeNull();
    expect(refusCreer({ destinataireId: 2, echeanceLe: null }, commercial, jour)).toBeNull();
  });

  it("en retard : ouverte avec une échéance avant aujourd'hui", () => {
    expect(enRetard({ statut: "OUVERTE", echeanceLe: "2026-11-05T00:00:00Z" }, jour)).toBe(true);
    expect(enRetard({ statut: "OUVERTE", echeanceLe: jour }, jour)).toBe(false);
    expect(enRetard({ statut: "FAITE", echeanceLe: "2026-11-01T00:00:00Z" }, jour)).toBe(false);
    expect(enRetard({ statut: "OUVERTE", echeanceLe: null }, jour)).toBe(false);
  });

  it("depuis une étape, la demande la plus fréquente est proposée", () => {
    expect(typeSuggere("JETON_XPLORE")).toBe("RELANCER_EDL");
    expect(typeSuggere("VISIO_TECHNIQUE")).toBe("OBTENIR_ACCES_RIS");
    expect(typeSuggere("TEST_CRENEAUX")).toBe("TESTER_CRENEAUX");
    expect(typeSuggere("MESSAGES_RAPPEL")).toBe("PARAMETRER_ROBOT");
    expect(typeSuggere(null)).toBe("AUTRE");
  });
});
