import { expect, it } from "vitest";
import { MESSAGE_ACTION_SANS_DATE, MESSAGE_DATE_SANS_ACTION, modificationEchange, saisieEchange, suiteAction } from "./echange";
import { creationProspect } from "./prospect";
import { messageValidation } from "./messages";

const corps = { organisationId: 1, type: "APPEL", surveneuLe: "2026-10-26" };
it("transforme les deux dates en Date", () => {
  const resultat = saisieEchange.parse({ ...corps, prochaineAction: "Rappeler", prochaineActionLe: "2026-11-01" });
  expect(resultat.surveneuLe).toEqual(new Date("2026-10-26"));
  expect(resultat.prochaineActionLe).toEqual(new Date("2026-11-01"));
});
it.each(["", " ", "pas une date"])("refuse une date invalide : %s", (date) => {
  expect(saisieEchange.safeParse({ ...corps, surveneuLe: date }).success).toBe(false);
  expect(saisieEchange.safeParse({ ...corps, prochaineActionLe: date }).success).toBe(false);
});
it("une prochaine action se date, et une date dit quoi faire (C-92)", () => {
  const sansDate = saisieEchange.safeParse({ ...corps, prochaineAction: "Rappeler le directeur" });
  expect(sansDate.success).toBe(false);
  if (!sansDate.success) expect(messageValidation(sansDate.error)).toBe(MESSAGE_ACTION_SANS_DATE);
  const sansTexte = saisieEchange.safeParse({ ...corps, prochaineAction: "  ", prochaineActionLe: "2026-11-01" });
  expect(sansTexte.success).toBe(false);
  if (!sansTexte.success) expect(messageValidation(sansTexte.error)).toBe(MESSAGE_DATE_SANS_ACTION);
  expect(saisieEchange.safeParse(corps).success).toBe(true);
  expect(suiteAction.safeParse({ type: "APPEL", prochaineAction: "Relancer" }).success).toBe(false);
  expect(modificationEchange.safeParse({ operation: "realiser", prochaineAction: "Relancer" }).success).toBe(false);
  expect(modificationEchange.safeParse({ operation: "realiser", prochaineAction: "Relancer", prochaineActionLe: "2026-11-01" }).success).toBe(true);
  expect(modificationEchange.safeParse({ operation: "annuler" }).success).toBe(true);
});
it("le premier contact d'un prospect suit la même règle", () => {
  const prospect = { organisation: { raisonSocialeNom: "Test", type: "CABINET", responsableId: 1 }, site: { ville: "Brest" },
    premierContact: { type: "APPEL", surveneuLe: "2026-10-26", prochaineAction: "Rappeler" } };
  expect(creationProspect.safeParse(prospect).success).toBe(false);
  expect(creationProspect.safeParse({ ...prospect, premierContact: { ...prospect.premierContact, prochaineActionLe: "2026-11-01" } }).success).toBe(true);
});
it("refuse les types inconnus et les identifiants décimaux", () => {
  expect(saisieEchange.safeParse({ ...corps, type: "INCONNU" }).success).toBe(false);
  expect(saisieEchange.safeParse({ ...corps, organisationId: 1.5 }).success).toBe(false);
});
