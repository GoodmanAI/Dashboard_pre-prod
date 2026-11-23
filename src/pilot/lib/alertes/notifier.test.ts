import { describe, expect, it } from "vitest";
import { notificationsDesAlertes } from "./notifier";
import type { Alerte } from "./types";

const alerte = (p: Partial<Alerte>): Alerte => ({
  cle: "silence-12", type: "SILENCE" as Alerte["type"], famille: "commerciale", niveau: "attention", titre: "Plus de contact depuis 30 jours",
  detail: "", organisationId: 12, organisationNom: "Centre A", responsableId: null, chefDeProjetId: null, lien: "/pilot/organisations/12",
  groupe: "suivi-12", attribution: { userId: 7, nom: "Camille", poste: "Direction générale", manuelle: false, par: null }, ...p,
});

describe("alertes vers la cloche commune", () => {
  it("une notification par cause, clé stable : le passage suivant ne la renvoie pas", () => {
    const [n] = notificationsDesAlertes([alerte({})]);
    expect(n).toEqual({ userId: 7, type: "pilot.alerte", lien: "/pilot/organisations/12", cle: "alerte-silence-12",
      message: "Alerte : Plus de contact depuis 30 jours, Centre A." });
    expect(notificationsDesAlertes([alerte({})])[0].cle).toBe(n.cle);
  });
  it("personne à prévenir : rien n'est écrit", () => {
    expect(notificationsDesAlertes([alerte({ attribution: { userId: null, nom: "", poste: "À attribuer", manuelle: false, par: null } })])).toEqual([]);
  });
  it("dit qu'une alerte bloque", () => {
    expect(notificationsDesAlertes([alerte({ niveau: "bloquant" })])[0].message.startsWith("Alerte bloquante :")).toBe(true);
  });
});
