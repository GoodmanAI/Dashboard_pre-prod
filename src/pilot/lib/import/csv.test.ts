import { describe, expect, it } from "vitest";
import { lireCsv, validerLigne, resumerImport, COLONNES } from "./csv";
const ligne = (valeurs: Record<string, string>) => validerLigne({ ligne: 7, valeurs: { cle: "demo", nom: "Cabinet Démo", ...valeurs } });
describe("lireCsv", () => {
  it("BOM, en-têtes, point-virgule et lignes vides", () => {
    expect(lireCsv("\uFEFF Clé ; NOM ; Contact Email\r\n\r\na;Alpha;a@exemple.test\r\n;;\r\n")).toEqual([
      { ligne: 3, valeurs: { cle: "a", nom: "Alpha", contact_email: "a@exemple.test" } },
    ]);
  });
  it("virgules, champ cité, guillemets échappés et retours cités", () => {
    const lignes = lireCsv('cle,nom,notes\n1,"Alpha, Beta","Une ""citation""\net une suite"\n2,Gamma,');
    expect(lignes[0]).toEqual({ ligne: 2, valeurs: { cle: "1", nom: "Alpha, Beta", notes: 'Une "citation"\net une suite' } });
    expect(lignes[1].ligne).toBe(4);
  });
  it("détecte le séparateur hors des guillemets de l'en-tête", () => expect(lireCsv('"cle";"nom"\na;Alpha')[0].valeurs.nom).toBe("Alpha"));
  it("refuse les colonnes inconnues avec la liste acceptée", () => {
    expect(() => lireCsv("cle;nom;inconnue\na;Alpha;x")).toThrow(COLONNES.join(", "));
  });
  it.each(['cle;nom\n1;"sans fin', 'cle;nom\n1;a"b', 'cle;nom\n1;"a"x', "cle;cle;nom", "nom;notes", ""])("refuse un CSV mal formé : %s", (csv) => expect(() => lireCsv(csv)).toThrow());
  it("nomme une ligne dont le nombre de colonnes est incorrect", () => {
    const r = validerLigne(lireCsv("cle;nom\n1;Alpha;extra")[0]);
    expect(r.valide).toBe(false);
    if (!r.valide) expect(r.refus.raison).toContain("Ligne 2");
  });
});
describe("validerLigne", () => {
  it.each([["GROUPE_PRIVE", "GROUPE_PRIVE"], ["groupe prive", "GROUPE_PRIVE"], ["hÔpital", "HOPITAL"], ["GIE", "GIE"], ["cabinet", "CABINET"]])("type %s", (type, attendu) => {
    const r = ligne({ type });
    expect(r.valide && r.donnees.type).toBe(attendu);
  });
  it.each([["VISIO_TECHNIQUE", "VISIO_TECHNIQUE"], ["visio technique", "VISIO_TECHNIQUE"], ["signé", "SIGNE"], ["En intégration", "EN_INTEGRATION"]])("étape %s", (etape, attendu) => {
    const r = ligne({ etape }); expect(r.valide && r.donnees.etape).toBe(attendu);
  });
  it("étape Prospect par défaut", () => { const r = ligne({}); expect(r.valide && r.donnees.etape).toBe("PROSPECT"); });
  it.each(["PERDU", "en sommeil", "ARRETE", "Arrêté"])("refuse la sortie %s", (etape) => {
    const r = ligne({ etape }); expect(r.valide).toBe(false);
    if (!r.valide) expect(r.refus.raison).toContain("Étape de sortie : à poser dans Pilot avec sa raison.");
  });
  it.each([
    ["cle", ""], ["nom", ""], ["type", "inconnu"], ["etape", "inconnue"],
    ["nombre_sites", "0"], ["nombre_sites", "-1"], ["nombre_sites", "1.5"], ["nombre_sites", "2147483648"],
    ["responsable_email", "invalide"], ["chef_de_projet_email", "invalide"], ["contact_email", "invalide"],
    ["dernier_echange_le", "2026-02-30"], ["dernier_echange_le", "31/04/2026"], ["dernier_echange_le", "hier"],
  ])("refus nommé : %s=%s", (cle, valeur) => {
    const r = ligne({ [cle]: valeur }); expect(r.valide).toBe(false);
    if (!r.valide) { expect(r.refus.ligne).toBe(7); expect(r.refus.raison).toContain(cle); expect(r.refus.raison).toContain("Ligne 7"); }
  });
  it.each(["2024-02-29", "29/02/2024"])("date valide %s", (date) => {
    const r = ligne({ dernier_echange_le: date, nombre_sites: "2" });
    expect(r.valide && r.donnees.dernier_echange_le?.toISOString()).toBe("2024-02-29T00:00:00.000Z");
    expect(r.valide && r.donnees.nombre_sites).toBe(2);
  });
});

describe("resumerImport", () => {
  it("accorde chaque compte", () => {
    const vide = { inchangees: 0, avertissements: [] };
    expect(resumerImport({ ...vide, creees: 1, misesAJour: 1, refusees: [{ ligne: 2, raison: "x" }] })).toBe("1 créée, 1 mise à jour, 1 refusée");
    expect(resumerImport({ ...vide, creees: 3, misesAJour: 2, refusees: [] })).toBe("3 créées, 2 mises à jour, 0 refusée");
  });
});
