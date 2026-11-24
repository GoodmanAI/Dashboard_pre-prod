import { describe, expect, it } from "vitest";
import { casseTitre, identifiantSaisi, lireReponse, memeLieu, memePersonne, metierDuDirigeant, motsDeRepli, nomsDesCentres, parametresRecherche, rueSeule, type Etablissement } from "./regles";

// Une réponse inventée, de la forme du service (noms neutres, C-10).
const etab = (siret: string, extra: Record<string, unknown> = {}) => ({
  siret, adresse: "12 AVENUE DES TILLEULS 29000 QUIMPER", code_postal: "29000", libelle_commune: "QUIMPER",
  activite_principale: "86.22A", etat_administratif: "A", est_siege: false, liste_enseignes: null, liste_finess: null, ...extra,
});
const reponse = {
  results: [{
    siren: "123456789", nom_complet: "IMAGERIE DU LITTORAL (IDL)", nom_raison_sociale: "IMAGERIE DU LITTORAL", nature_juridique: "5785",
    activite_principale: "86.22A", date_creation: "2004-03-01", nombre_etablissements_ouverts: 3,
    siege: etab("12345678900011", { est_siege: false }),
    dirigeants: [
      { type_dirigeant: "personne physique", nom: "MARTIN", prenoms: "Claire Anne", qualite: "PRESIDENT DE SAS" },
      { type_dirigeant: "personne morale", denomination: "HOLDING ALPHA", qualite: "Directeur général" },
      { type_dirigeant: "personne physique", nom: null },
    ],
    matching_etablissements: [
      etab("12345678900029", { adresse: "3 RUE DU PORT 29900 CONCARNEAU", code_postal: "29900", libelle_commune: "CONCARNEAU", liste_enseignes: ["CENTRE D'IMAGERIE DU PORT"], liste_finess: ["290000017"] }),
      etab("12345678900011"),
      etab("12345678900037", { etat_administratif: "F" }),
      etab("123"),
    ],
  }, { siren: "12", nom_complet: "Invalide" }, null],
};

describe("lecture de la réponse de l'annuaire (C-89)", () => {
  const [e, ...reste] = lireReponse(reponse);
  it("garde les entreprises au SIREN valide", () => expect(reste).toHaveLength(0));
  it("l'identité légale", () => expect(e).toMatchObject({
    siren: "123456789", nom: "Imagerie du Littoral (Idl)", denomination: "IMAGERIE DU LITTORAL", formeJuridique: "5785",
    activite: "86.22A", creeLe: "2004-03-01", etablissementsOuverts: 3,
  }));
  it("le siège, sa rue sans le code postal ni la ville", () => expect(e.siege).toMatchObject({
    siret: "12345678900011", adresse: "12 Avenue des Tilleuls", codePostal: "29000", ville: "Quimper", estSiege: true,
  }));
  it("les établissements ouverts, le siège en premier, sans doublon", () => {
    expect(e.etablissements.map((x) => x.siret)).toEqual(["12345678900011", "12345678900029"]);
    expect(e.etablissements[1]).toMatchObject({ nom: "Centre d'Imagerie du Port", finess: "290000017", ville: "Concarneau", estSiege: false });
  });
  it("les dirigeants, personnes et sociétés", () => expect(e.dirigeants).toEqual([
    { nom: "Claire MARTIN", qualite: "President de sas" }, { nom: "Holding Alpha", qualite: "Directeur général" },
  ]));
  it("une réponse illisible ne donne rien", () => {
    expect(lireReponse(null)).toEqual([]);
    expect(lireReponse({ results: "non" })).toEqual([]);
  });
});

describe("mise en forme", () => {
  it("casse titre, mots de liaison en minuscules", () => expect(casseTitre("CENTRE D'IMAGERIE DE LA GARE")).toBe("Centre d'Imagerie de la Gare"));
  it("retire le complément d'adresse", () => expect(rueSeule({ adresse: "BAT A 5 RUE NEUVE 75001 PARIS", complement_adresse: "BAT A", code_postal: "75001", libelle_commune: "PARIS" })).toBe("5 Rue Neuve"));
});

describe("recherche", () => {
  it("reconnaît un SIREN ou un SIRET, espaces compris", () => {
    expect(identifiantSaisi("123 456 789")).toBe("123456789");
    expect(identifiantSaisi("123 456 789 00011")).toBe("12345678900011");
    expect(identifiantSaisi("Imagerie 29")).toBeNull();
  });
  it("un identifiant cherche une seule entreprise", () => {
    const p = parametresRecherche("123 456 789");
    expect(p.get("q")).toBe("123456789");
    expect(p.get("per_page")).toBe("1");
  });
  it("le repli santé", () => expect(parametresRecherche("Imagerie", { sante: true }).get("section_activite_principale")).toBe("Q"));
  it("les mots du repli écartent formes et mots vides", () => expect(motsDeRepli("SELARL Centre d'imagerie Kerfeunteun")).toEqual(["Kerfeunteun", "imagerie"]));
});

const lieu = (codePostal: string, adresse: string): Pick<Etablissement, "codePostal" | "adresse"> => ({ codePostal, adresse });
describe("rapprochement avec un centre saisi", () => {
  it("même code postal, même numéro, deux mots communs", () => expect(memeLieu({ codePostal: "29000", adresse: "12 av. des Tilleuls, bâtiment B" }, lieu("29000", "12 Avenue des Tilleuls"))).toBe(true));
  it("un autre numéro de rue n'est pas le même lieu", () => expect(memeLieu({ codePostal: "29000", adresse: "14 avenue des Tilleuls" }, lieu("29000", "12 Avenue des Tilleuls"))).toBe(false));
  it("un autre code postal non plus", () => expect(memeLieu({ codePostal: "29200", adresse: "12 avenue des Tilleuls" }, lieu("29000", "12 Avenue des Tilleuls"))).toBe(false));
  it("sans code postal, jamais", () => expect(memeLieu({ codePostal: null, adresse: "12 avenue des Tilleuls" }, lieu("29000", "12 Avenue des Tilleuls"))).toBe(false));
});

describe("noms des centres créés", () => {
  const e = (nom: string | null, ville: string, adresse: string) => ({ siret: "1".repeat(14), nom, adresse, codePostal: "29000", ville, activite: null, finess: null, estSiege: false });
  it("l'enseigne, sinon la ville, la rue quand deux partagent la ville, unique chez le client", () => {
    expect(nomsDesCentres([e("Imagerie du Port", "Concarneau", "3 Rue du Port"), e(null, "Quimper", "1 Rue A"), e(null, "Quimper", "2 Rue B"), e(null, "Brest", "1 Rue C")], ["Brest"]))
      .toEqual(["Imagerie du Port", "Quimper, 1 Rue A", "Quimper, 2 Rue B", "Brest (2)"]);
  });
});

describe("dirigeants", () => {
  it("même personne, mots dans n'importe quel ordre", () => expect(memePersonne("MARTIN Claire", "Claire Martin")).toBe(true));
  it("un gérant ou un président est proposé comme Gérant", () => {
    expect(metierDuDirigeant("Président de SAS")).toBe("Gérant");
    expect(metierDuDirigeant("Gérant")).toBe("Gérant");
    expect(metierDuDirigeant("Commissaire aux comptes")).toBeNull();
  });
});
