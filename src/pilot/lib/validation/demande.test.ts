import { expect, it } from "vitest";
import { nouvelleDemande } from "./demande";

const base = { organisationId: 1, type: "PREPARER_DEVIS", destinataireId: 2 };

it("accepte le jour d'un champ date, et la date ISO déjà validée par le navigateur", () => {
  const court = nouvelleDemande.parse({ ...base, echeanceLe: "2026-11-12" });
  expect(court.echeanceLe?.toISOString()).toBe("2026-11-12T00:00:00.000Z");
  // Le navigateur valide puis renvoie la valeur transformée : elle doit repasser au serveur.
  const relu = nouvelleDemande.parse(JSON.parse(JSON.stringify(court)));
  expect(relu.echeanceLe?.toISOString()).toBe("2026-11-12T00:00:00.000Z");
});

it("refuse une date mal formée, accepte l'absence d'échéance", () => {
  expect(nouvelleDemande.safeParse({ ...base, echeanceLe: "12/11/2026" }).success).toBe(false);
  expect(nouvelleDemande.parse({ ...base, echeanceLe: "" }).echeanceLe).toBeNull();
  expect(nouvelleDemande.parse(base).echeanceLe).toBeNull();
});
