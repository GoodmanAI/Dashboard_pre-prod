import { expect, it } from "vitest";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { operationAttente } from "@/pilot/lib/validation/attente";
import { ATTENTE_VIDE, LIBELLES_TIERS, champsAttente, libelleAttente, preparerAttente, relanceDue, verifierAttente } from "./reglesAttentes";

const maintenant = new Date("2026-10-26T12:00:00Z");
it.each([
  ["LYRAE", "Lyrae", "de Lyrae"], ["CLIENT", "Le client", "du client"], ["EDL", "EDL", "d'EDL"],
  ["OPERATEUR_TELEPHONIE", "L'opérateur téléphonique", "de l'opérateur téléphonique"],
  ["PRESTATAIRE_SITE_WEB", "Le prestataire du site web", "du prestataire du site web"], ["AUTRE", "Un autre tiers", "d'un autre tiers"],
] as const)("libellé et accord pour %s", (tiers, libelle, complement) => {
  expect(LIBELLES_TIERS[tiers]).toBe(libelle); expect(libelleAttente(tiers)).toBe(`En attente ${complement}`);
});
it("la demande est datée d'aujourd'hui par défaut, sans cochage", () => {
  expect(preparerAttente({ enAttenteDe: "CLIENT" }, maintenant)).toEqual({ enAttenteDe: "CLIENT", demandeeLe: new Date("2026-10-26"), derniereRelanceLe: null, echeanceLe: null });
});
it.each([new Date("2026-10-27"), new Date("invalide")])("refuse une date de demande future ou invalide", (demandeeLe) => {
  expect(() => preparerAttente({ enAttenteDe: "EDL", demandeeLe }, maintenant)).toThrow(ErreurMetier);
});
it("refuse une échéance avant la demande, accepte le même jour", () => {
  const demandeeLe = new Date("2026-10-20");
  expect(() => preparerAttente({ enAttenteDe: "EDL", demandeeLe, echeanceLe: new Date("2026-10-19") }, maintenant)).toThrow(ErreurMetier);
  expect(preparerAttente({ enAttenteDe: "EDL", demandeeLe, echeanceLe: demandeeLe }, maintenant).echeanceLe).toEqual(demandeeLe);
});
it.each(["declarer", "relancer", "lever"] as const)("%s refuse les étapes faites, automatiques comprises", (operation) => {
  expect(() => verifierAttente({ cle: "JETON_XPLORE", mode: "AUTOMATIQUE", faite: true, enAttenteDe: "EDL" }, operation)).toThrow("Cette étape est faite");
  expect(() => verifierAttente({ cle: "FORMATION_SECRETAIRES", mode: "MANUEL", faite: true, enAttenteDe: "CLIENT" }, operation)).toThrow("Cette étape est faite");
});
it("une étape automatique pas encore faite accepte une attente d'EDL (C-86)", () => {
  expect(() => verifierAttente({ cle: "JETON_XPLORE", mode: "AUTOMATIQUE", faite: false, enAttenteDe: null }, "declarer")).not.toThrow();
  expect(() => verifierAttente({ cle: "JETON_XPLORE", mode: "AUTOMATIQUE", faite: false, enAttenteDe: "EDL" }, "relancer")).not.toThrow();
});
it("déclarer accepte manuel et mixte, relancer et lever exigent une attente", () => {
  for (const mode of ["MANUEL", "MIXTE"] as const) {
    const e = { cle: "FORMATION_SECRETAIRES" as const, mode, faite: false, enAttenteDe: null };
    expect(() => verifierAttente(e, "declarer")).not.toThrow();
    for (const operation of ["lever", "relancer"] as const) {
      expect(() => verifierAttente(e, operation)).toThrow("Cette étape n'a pas d'attente");
      expect(() => verifierAttente({ ...e, enAttenteDe: "EDL" }, operation)).not.toThrow();
    }
  }
});
it("les instantanés ne portent que les quatre champs d'attente", () => {
  const e = { ...ATTENTE_VIDE, commentaire: "Ne doit pas sortir", faite: true };
  expect(champsAttente(e)).toEqual(ATTENTE_VIDE);
});
it("les relances sont dues après sept jours civils, selon le dernier contact", () => {
  expect(relanceDue({ demandeeLe: new Date("2026-10-18"), derniereRelanceLe: null }, maintenant)).toBe(true);
  expect(relanceDue({ demandeeLe: new Date("2026-10-19"), derniereRelanceLe: null }, maintenant)).toBe(false);
  expect(relanceDue({ demandeeLe: new Date("2026-10-01"), derniereRelanceLe: new Date("2026-10-24") }, maintenant)).toBe(false);
  expect(relanceDue({ demandeeLe: null, derniereRelanceLe: null }, maintenant)).toBe(false);
});
it("valide l'union des opérations sans champs libres ni dates invalides", () => {
  for (const operation of ["lever", "relancer"]) expect(operationAttente.safeParse({ operation }).success).toBe(true);
  for (const entree of [{ operation: "autre" }, { operation: "declarer", enAttenteDe: "INCONNU" },
    { operation: "declarer", enAttenteDe: "EDL", demandeeLe: "invalide" }, { operation: "relancer", commentaire: "privé" }]) {
    expect(operationAttente.safeParse(entree).success).toBe(false);
  }
});
