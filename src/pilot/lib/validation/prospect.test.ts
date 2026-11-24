import { describe, expect, it } from "vitest";
import { creationProspect } from "./prospect";
import { majOrganisation } from "./organisation";

const base = { organisation: { raisonSocialeNom: "Imagerie Test", type: "CABINET", responsableId: 1 }, site: { ville: "Quimper" } };

describe("fiche de saisie rapide (C-65)", () => {
  it("accepte le strict minimum : nom, type, commercial et ville", () => {
    expect(creationProspect.parse(base)).toMatchObject({ contacts: [], site: { ville: "Quimper" } });
  });
  it("exige la ville", () => {
    expect(creationProspect.safeParse({ ...base, site: { ville: " " } }).success).toBe(false);
  });
  it("complète le site web et vide les champs effacés", () => {
    const r = creationProspect.parse({ ...base, organisation: { ...base.organisation, siteWeb: "imagerie-test.fr", email: "", telephone: " " } });
    expect(r.organisation).toMatchObject({ siteWeb: "https://imagerie-test.fr", email: null, telephone: null });
  });
  it("refuse un email de standard invalide et une priorité inconnue", () => {
    expect(creationProspect.safeParse({ ...base, organisation: { ...base.organisation, email: "standard@" } }).success).toBe(false);
    expect(creationProspect.safeParse({ ...base, organisation: { ...base.organisation, priorite: "D" } }).success).toBe(false);
  });
  it("prend plusieurs contacts, dix au plus", () => {
    const contact = { nom: "Dr Exemple" };
    expect(creationProspect.parse({ ...base, contacts: [contact, contact] }).contacts).toHaveLength(2);
    expect(creationProspect.safeParse({ ...base, contacts: Array(11).fill(contact) }).success).toBe(false);
  });
  it("le premier contact passe par un canal de prospection, LinkedIn compris", () => {
    const premier = { type: "LINKEDIN", surveneuLe: "2026-11-06", compteRendu: "Message envoyé" };
    expect(creationProspect.parse({ ...base, premierContact: premier }).premierContact?.surveneuLe).toEqual(new Date("2026-11-06"));
    expect(creationProspect.safeParse({ ...base, premierContact: { ...premier, type: "JALON" } }).success).toBe(false);
  });
  it("le montant estimé est un entier de centimes positif, borné, avec les offres cochées (C-70)", () => {
    const montant = { montantMensuelCentimes: 124200, offres: ["TALK", "CONNECTEUR_RIS"] };
    expect(creationProspect.parse({ ...base, montantEstime: montant }).montantEstime).toEqual(montant);
    expect(creationProspect.parse(base).montantEstime).toBeUndefined();
    for (const faux of [0, -100, 12.5, 100_000_001, "1200", Number.NaN]) {
      expect(creationProspect.safeParse({ ...base, montantEstime: { ...montant, montantMensuelCentimes: faux } }).success).toBe(false);
    }
    expect(creationProspect.safeParse({ ...base, montantEstime: { ...montant, offres: ["DESK"] } }).success).toBe(false);
    expect(creationProspect.safeParse({ ...base, montantEstime: { ...montant, produitId: 3 } }).success).toBe(false);
  });
  it("une offre cochée deux fois est refusée", () => {
    const montant = { montantMensuelCentimes: 124200, offres: ["TALK", "TALK"] };
    const analyse = creationProspect.safeParse({ ...base, montantEstime: montant });
    expect(analyse.success).toBe(false);
    expect(analyse.error?.issues[0]?.message).toBe("Chaque offre ne se coche qu'une fois.");
    expect(creationProspect.safeParse({ ...base, montantEstime: { ...montant, offres: ["TALK", "KONNECT", "CONNECTEUR_RIS"] } }).success).toBe(true);
  });
  it("le concurrent en place part avec la création, facultatif (lot R)", () => {
    expect(creationProspect.parse({ ...base, organisation: { ...base.organisation, concurrentId: 7 } }).organisation.concurrentId).toBe(7);
    expect(creationProspect.parse({ ...base, organisation: { ...base.organisation, concurrentId: null } }).organisation.concurrentId).toBeNull();
    expect(creationProspect.parse(base).organisation.concurrentId).toBeUndefined();
    for (const faux of [0, -1, 1.5, "7", 2147483648]) {
      expect(creationProspect.safeParse({ ...base, organisation: { ...base.organisation, concurrentId: faux } }).success, String(faux)).toBe(false);
    }
  });
  it("le concurrent ne se glisse pas ailleurs que dans l'organisation", () => {
    expect(creationProspect.safeParse({ ...base, concurrentId: 7 }).success).toBe(false);
    expect(creationProspect.safeParse({ ...base, site: { ...base.site, concurrentId: 7 } }).success).toBe(false);
  });
  it("la fiche modifie la priorité et les coordonnées", () => {
    expect(majOrganisation.parse({ priorite: "A_PLUS", telephone: "02 98 00 00 00" })).toMatchObject({ priorite: "A_PLUS", telephone: "02 98 00 00 00" });
    expect(majOrganisation.parse({ priorite: null })).toEqual({ priorite: null });
  });
});
