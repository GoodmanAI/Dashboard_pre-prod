import { describe, expect, it } from "vitest";
import { champsChanges } from "./diff";

describe("champsChanges", () => {
  const avant = { nom: "Site", nombre: 1, date: new Date("2026-01-01") as Date | null, code: null as string | null };
  it("ignore les champs absents ou inchangés", () => expect(champsChanges(avant, { nom: "Site", nombre: undefined }, ["nom", "nombre"])).toEqual({ avant: {}, apres: {} }));
  it("ne prend que les clés demandées et réellement changées", () => expect(champsChanges(avant, { nom: "Autre", nombre: 2, code: "A" }, ["nom", "code"]))
    .toEqual({ avant: { nom: "Site", code: null }, apres: { nom: "Autre", code: "A" } }));
  it("compare les dates par instant", () => expect(champsChanges(avant, { date: new Date("2026-01-01") }, ["date"])).toEqual({ avant: {}, apres: {} }));
  it("détecte une date changée ou effacée", () => {
    expect(champsChanges(avant, { date: null }, ["date"])).toEqual({ avant: { date: avant.date }, apres: { date: null } });
    expect(champsChanges(avant, { date: new Date("2026-01-02") }, ["date"]).apres.date).toEqual(new Date("2026-01-02"));
  });
  it("ne mute pas ses entrées", () => {
    const apres = Object.freeze({ nombre: 0 });
    champsChanges(Object.freeze(avant), apres, ["nombre"]);
    expect(avant.nombre).toBe(1);
    expect(apres.nombre).toBe(0);
  });
});
