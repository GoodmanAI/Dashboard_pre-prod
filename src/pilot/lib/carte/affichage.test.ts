import { describe, expect, it } from "vitest";
import { CARTE, TEMPERATURE } from "@/pilot/jetons";
import {
  A_FAIRE_EN_RETARD_MS, AIDE_ADRESSE, adresseFiltres, ajusterFiltres, assemblerCentres, compterFiltres, dateCourte, estSurLaCarte, familleCarte, famillesPresentes,
  filtrer, genreCarte, htmlMarqueur, largeursBulle, legende, lienFiche, limites, lireFiltres, localisationEnRetard, modeConcurrents, nomMarqueur,
  perimetreDuMode, phraseCompteurs, raisonPosition, repartirParPosition, styleMarqueur, teinteConcurrent,
  type CentreCarte, type ConcurrentCarte,
} from "./affichage";

let sequence = 0;
function centre(sur: Partial<CentreCarte> = {}): CentreCarte {
  sequence += 1;
  return {
    id: sequence, organisationId: sequence, organisation: `Organisation ${sequence}`, centre: "Site principal", ville: "Amiens",
    statut: "OK", enRetard: false, latitude: "49.897442", longitude: "2.290084", genre: "PROSPECT", etape: "PROSPECT", temperature: "FROID", temperatureForcee: false,
    montant: null, concurrentId: null, dateSortie: null, responsableId: null, responsable: null, famille: null, ...sur,
  };
}
const concurrents: ConcurrentCarte[] = [{ id: 7, nom: "Robot Alpha Voix" }, { id: 3, nom: "Centre d'appels Beta" }];
const valides = { concurrents: [3, 7], comptes: [1, 2, 5], familles: ["Xplore (EDL)", "Softway"], moiId: 5 };
const MAINTENANT = new Date("2026-11-19T10:00:00Z");

describe("genre d'un dossier sur la carte", () => {
  it("prospect : étapes commerciales et pause ; client : signé à en service ; le reste n'y est pas", () => {
    for (const e of ["PROSPECT", "POURPARLERS", "VISIO_TECHNIQUE", "PROPOSITION", "EN_SOMMEIL"] as const) expect(genreCarte(e)).toBe("PROSPECT");
    for (const e of ["SIGNE", "EN_INTEGRATION", "EN_PRODUCTION"] as const) expect(genreCarte(e)).toBe("CLIENT");
    for (const e of ["PERDU", "ARRETE"] as const) expect(genreCarte(e)).toBeNull();
  });
  it("une affaire perdue contre un concurrent (un gagnant) a son genre ; perdue sans gagnant ou terminée, non", () => {
    expect(genreCarte("PERDU", 3)).toBe("PERDU");
    expect(genreCarte("PERDU", null)).toBeNull();
    expect(genreCarte("ARRETE", 3)).toBeNull();
  });
});

describe("assemblerCentres", () => {
  type Etape = "PROSPECT" | "PERDU" | "EN_PRODUCTION";
  const org = (id: number, etape: Etape, ris: string | null = null, liens: { concurrentId?: number; concurrentGagnantId?: number } = {}) => ({
    id, nom: `Org ${id}`, etape, ris, concurrentId: liens.concurrentId ?? null, concurrentGagnantId: liens.concurrentGagnantId ?? null,
    dateSortie: etape === "PERDU" ? "2026-10-02" : null, responsableId: 1, responsable: "Camille",
    temperature: etape === "PROSPECT" ? { niveau: "CHAUD" as const, forcee: true } : null, montant: { centimes: 120000, libelle: "signé" },
  });
  const lu = (id: number, organisationId: number, ris: string | null = null, statut: "OK" | "A_FAIRE" = "OK", majLe = MAINTENANT) => ({
    id, organisationId, nom: "Site", ville: "Lille", ris, geocodageStatut: statut, majLe,
    latitude: statut === "OK" ? "50.629250" : null, longitude: statut === "OK" ? "3.057256" : null,
  });
  it("joint l'organisation, retire les dossiers perdus sans gagnant et les centres sans organisation lue", () => {
    const r = assemblerCentres([org(1, "PROSPECT"), org(2, "PERDU"), org(3, "EN_PRODUCTION")], [lu(10, 1), lu(11, 2), lu(12, 3), lu(13, 99)], MAINTENANT);
    expect(r.map((c) => [c.id, c.genre])).toEqual([[10, "PROSPECT"], [12, "CLIENT"]]);
    expect(r[0]).toMatchObject({ organisation: "Org 1", temperature: "CHAUD", temperatureForcee: true, responsable: "Camille", latitude: "50.629250" });
    expect(r[1]!.temperature).toBeNull();
    // Ni rue ni code postal ne partent vers le navigateur.
    expect(Object.keys(r[0]!)).not.toContain("codePostal");
    expect(Object.keys(r[0]!)).not.toContain("adresse");
  });
  it("le RIS se lit comme dans le barème : la fiche d'abord, puis le centre, ramené à sa famille", () => {
    const r = assemblerCentres([org(1, "PROSPECT", "Softway Medical"), org(2, "PROSPECT", null), org(3, "PROSPECT", "Inconnu")],
      [lu(10, 1, "EDL Explore"), lu(11, 1), lu(12, 2, "EDL Explore"), lu(13, 2), lu(14, 3, "Softway")], MAINTENANT);
    expect(r.map((c) => c.famille)).toEqual(["Softway", "Softway", "Xplore (EDL)", null, "Softway"]);
  });
  it("familleCarte : mêmes cas « inconnu » et « aucun » que la température", () => {
    expect(familleCarte(null, null)).toBeNull();
    expect(familleCarte("NC", "À vérifier")).toBeNull();
    expect(familleCarte("Aucun RIS", null)).toBe("Aucun RIS");
    expect(familleCarte(null, "Néant")).toBe("Aucun RIS");
    expect(familleCarte("Aucun RIS", "Xplore")).toBe("Xplore (EDL)");
    expect(familleCarte("Non Xplore", null)).toBe("Aucun RIS");
    expect(familleCarte("Plusieurs RIS", "Softway")).toBe("Softway");
    expect(familleCarte("Plusieurs RIS", null)).toBe("Plusieurs RIS");
    expect(familleCarte("Xplore", "Softway")).toBe("Xplore (EDL)");
  });
  it("le concurrent est celui qui équipe : le gagnant d'une affaire perdue, jamais pour un client", () => {
    const r = assemblerCentres([
      org(1, "PROSPECT", null, { concurrentId: 7 }),
      org(2, "EN_PRODUCTION", null, { concurrentId: 7 }),
      org(3, "PERDU", null, { concurrentId: 7, concurrentGagnantId: 3 }),
    ], [lu(10, 1), lu(11, 2), lu(12, 3)], MAINTENANT);
    expect(r.map((c) => [c.genre, c.concurrentId])).toEqual([["PROSPECT", 7], ["CLIENT", null], ["PERDU", 3]]);
    // L'affaire perdue : sa date de sortie, jamais de montant.
    expect(r[2]).toMatchObject({ montant: null, dateSortie: "2026-10-02" });
    expect(r[0]!.dateSortie).toBeNull();
  });
  it("dit si un centre attend sa position depuis plus de 30 minutes", () => {
    const vieux = new Date(MAINTENANT.getTime() - A_FAIRE_EN_RETARD_MS - 1);
    const r = assemblerCentres([org(1, "PROSPECT")], [lu(10, 1, null, "A_FAIRE", vieux), lu(11, 1, null, "A_FAIRE"), lu(12, 1, null, "OK", vieux)], MAINTENANT);
    expect(r.map((c) => c.enRetard)).toEqual([true, false, false]);
  });
});

describe("famillesPresentes", () => {
  it("de la plus fréquente à la plus rare, sans les centres sans RIS", () => {
    const c = (famille: string | null) => ({ famille });
    expect(famillesPresentes([c("Softway"), c("Xplore (EDL)"), c(null), c("Xplore (EDL)")])).toEqual(["Xplore (EDL)", "Softway"]);
  });
});

describe("filtres dans l'adresse (C-36)", () => {
  it("lit les codes valides, ignore le reste, prend la première valeur d'une liste", () => {
    expect(lireFiltres({ qui: "clients", temperature: "CHAUD", concurrent: "7", commercial: "2", ris: "Softway", couleurs: "concurrents" }, valides))
      .toEqual({ qui: "clients", temperature: "CHAUD", concurrent: "7", commercial: "2", ris: "Softway", couleurs: "concurrents" });
    expect(lireFiltres({ qui: ["prospects", "clients"], concurrent: "tous", commercial: "moi" }, valides)).toEqual({ qui: "prospects", concurrent: "tous", commercial: "moi" });
    expect(lireFiltres({ commercial: "inconnu", ris: "inconnu" }, valides)).toEqual({ commercial: "inconnu", ris: "inconnu" });
  });
  it("son propre identifiant de commercial est ramené à « moi »", () => {
    expect(lireFiltres({ commercial: "5" }, valides)).toEqual({ commercial: "moi" });
    expect(lireFiltres({ commercial: "5" }, { ...valides, comptes: [1, 2] })).toEqual({ commercial: "moi" });
  });
  it("ignore une valeur inconnue : un identifiant absent, une famille inventée, un texte saisi", () => {
    expect(lireFiltres({ qui: "tous", temperature: "BRULANT", concurrent: "99", commercial: "abc", ris: "Inventé", couleurs: "oui", q: "Dupont" }, valides)).toEqual({});
    expect(lireFiltres({ concurrent: "7; DROP TABLE", commercial: "1e3" }, valides)).toEqual({});
    // Le cas de la vérification : rien de reconnu, aucune erreur.
    expect(lireFiltres({ concurrent: "999999", ris: "texte", qui: "nimporte" }, valides)).toEqual({});
  });
  it("écrit l'adresse dans un ordre fixe, et rien sans filtre", () => {
    expect(adresseFiltres({})).toBe("");
    expect(adresseFiltres({ ris: "Xplore (EDL)", qui: "clients" })).toBe("?qui=clients&ris=Xplore+%28EDL%29");
    const f = { qui: "prospects", temperature: "TIEDE", concurrent: "tous", commercial: "moi", ris: "inconnu", couleurs: "concurrents" } as const;
    expect(lireFiltres(Object.fromEntries(new URLSearchParams(adresseFiltres(f))), valides)).toEqual(f);
    expect(compterFiltres(f)).toBe(6);
    expect(compterFiltres({})).toBe(0);
  });
});

describe("filtrer", () => {
  const prospect = centre({ temperature: "CHAUD", concurrentId: 7, responsableId: 1, famille: "Xplore (EDL)" });
  const froid = centre({ temperature: "FROID", concurrentId: 3, responsableId: 2, famille: "Softway" });
  const client = centre({ genre: "CLIENT", etape: "EN_PRODUCTION", temperature: null, concurrentId: null, responsableId: null, famille: null });
  const tous = [prospect, froid, client];
  const ids = (f: Parameters<typeof filtrer>[1]) => filtrer(tous, f, 1).map((c) => c.id);
  it("sans filtre, tout", () => expect(ids({})).toEqual([prospect.id, froid.id, client.id]));
  it("prospects ou clients", () => {
    expect(ids({ qui: "prospects" })).toEqual([prospect.id, froid.id]);
    expect(ids({ qui: "clients" })).toEqual([client.id]);
  });
  it("température : un client n'y répond pas", () => {
    expect(ids({ temperature: "CHAUD" })).toEqual([prospect.id]);
    expect(ids({ temperature: "TIEDE" })).toEqual([]);
  });
  it("concurrent en place : un seul, ou n'importe lequel", () => {
    expect(ids({ concurrent: "3" })).toEqual([froid.id]);
    expect(ids({ concurrent: "tous" })).toEqual([prospect.id, froid.id]);
  });
  it("le mode concurrents ne garde que les centres équipés", () => expect(ids({ couleurs: "concurrents" })).toEqual([prospect.id, froid.id]));
  it("commercial : moi, un compte, non attribué", () => {
    expect(ids({ commercial: "moi" })).toEqual([prospect.id]);
    expect(ids({ commercial: "2" })).toEqual([froid.id]);
    expect(ids({ commercial: "inconnu" })).toEqual([client.id]);
  });
  it("famille de RIS, ou non renseigné", () => {
    expect(ids({ ris: "Softway" })).toEqual([froid.id]);
    expect(ids({ ris: "inconnu" })).toEqual([client.id]);
  });
  it("les filtres se cumulent", () => expect(ids({ qui: "prospects", ris: "Xplore (EDL)", commercial: "moi", concurrent: "7" })).toEqual([prospect.id]));
  it("un centre non localisé suit les mêmes filtres", () => {
    const sans = centre({ statut: "ADRESSE_INCOMPLETE", latitude: null, longitude: null, genre: "CLIENT", etape: "SIGNE", temperature: null });
    expect(filtrer([sans, prospect], { qui: "clients" }, 1)).toEqual([sans]);
  });
});

describe("affaires perdues et mode concurrents", () => {
  const prospect = centre({ concurrentId: 7, famille: "Softway" });
  const client = centre({ genre: "CLIENT", etape: "EN_PRODUCTION", temperature: null, concurrentId: null, famille: "Xplore (EDL)" });
  const perdue = centre({ genre: "PERDU", etape: "PERDU", temperature: null, concurrentId: 3, dateSortie: "2026-10-02", famille: "Enovacom" });
  const libre = centre({ concurrentId: null, famille: null });
  const tous = [prospect, client, perdue, libre];
  const ids = (f: Parameters<typeof filtrer>[1]) => filtrer(tous, f, 1).map((c) => c.id);
  it("hors mode concurrents, les affaires perdues restent absentes", () => {
    expect(ids({})).toEqual([prospect.id, client.id, libre.id]);
    expect(perimetreDuMode(tous, {})).not.toContain(perdue);
  });
  it("en mode concurrents : les établissements équipés et les affaires perdues, jamais un client", () => {
    expect(ids({ couleurs: "concurrents" })).toEqual([prospect.id, perdue.id]);
    expect(ids({ concurrent: "tous" })).toEqual([prospect.id, perdue.id]);
  });
  it("le filtre d'un concurrent compare au concurrent effectif : le gagnant pour une affaire perdue", () => {
    expect(ids({ concurrent: "3" })).toEqual([perdue.id]);
    expect(ids({ concurrent: "7" })).toEqual([prospect.id]);
  });
  it("« qui » exclut les affaires perdues", () => {
    expect(ids({ couleurs: "concurrents", qui: "prospects" })).toEqual([prospect.id]);
    expect(ids({ couleurs: "concurrents", qui: "clients" })).toEqual([]);
  });
  it("les familles de RIS proposées suivent le périmètre du mode", () => {
    expect(famillesPresentes(perimetreDuMode(tous, {}))).toEqual(["Softway", "Xplore (EDL)"]);
    expect(famillesPresentes(perimetreDuMode(tous, { couleurs: "concurrents" }))).toEqual(["Enovacom", "Softway"]);
  });
  it("une famille absente du mode choisi est retirée des filtres, les autres restent", () => {
    expect(ajusterFiltres({ couleurs: "concurrents", ris: "Xplore (EDL)" }, tous)).toEqual({ couleurs: "concurrents" });
    expect(ajusterFiltres({ ris: "Enovacom" }, tous)).toEqual({});
    const garde = { couleurs: "concurrents", ris: "Enovacom" } as const;
    expect(ajusterFiltres(garde, tous)).toBe(garde);
    expect(ajusterFiltres({ ris: "inconnu", couleurs: "concurrents" }, tous)).toEqual({ ris: "inconnu", couleurs: "concurrents" });
  });
  it("une affaire perdue : un losange à la teinte du gagnant, et un nom qui le dit", () => {
    const f = { couleurs: "concurrents" } as const;
    expect(styleMarqueur(perdue, f)).toMatchObject({ cle: "concurrent-3", forme: "losange", ...teinteConcurrent(3) });
    expect(nomMarqueur(perdue, f, concurrents)).toBe("Affaire perdue contre Centre d'appels Beta");
    expect(nomMarqueur(centre({ genre: "PERDU", etape: "PERDU", concurrentId: 99 }), f, concurrents)).toBe("Affaire perdue contre un concurrent");
  });
  it("la légende ajoute « Losange : affaire perdue », et la ligne du concurrent montre un rond", () => {
    const l = legende([perdue, centre({ concurrentId: 3 })], { couleurs: "concurrents" }, concurrents);
    expect(l.map((e) => e.libelle)).toEqual(["Centre d'appels Beta", "Rond : prospect", "Losange : affaire perdue"]);
    expect(l[0]).toMatchObject({ forme: "rond", nombre: 2 });
    expect(l.at(-1)).toMatchObject({ forme: "losange", nombre: null });
  });
});

describe("modeConcurrents", () => {
  it("par le choix des couleurs ou par le filtre", () => {
    expect(modeConcurrents({})).toBe(false);
    expect(modeConcurrents({ couleurs: "concurrents" })).toBe(true);
    expect(modeConcurrents({ concurrent: "7" })).toBe(true);
    expect(modeConcurrents({ concurrent: "tous" })).toBe(true);
  });
});

describe("position d'un centre", () => {
  it("OK et AMBIGU avec position sont sur la carte, les autres statuts non", () => {
    expect(estSurLaCarte(centre())).toBe(true);
    expect(estSurLaCarte(centre({ statut: "AMBIGU" }))).toBe(true);
    for (const statut of ["A_FAIRE", "INTROUVABLE", "ADRESSE_INCOMPLETE"] as const) expect(estSurLaCarte(centre({ statut, latitude: null, longitude: null }))).toBe(false);
    // Jamais de marqueur sans les deux coordonnées, même si le statut dit OK.
    expect(estSurLaCarte(centre({ latitude: null }))).toBe(false);
    expect(estSurLaCarte(centre({ longitude: null }))).toBe(false);
  });
  it("répartit : à vérifier sont aussi sur la carte, les absents sont triés par organisation", () => {
    const a = centre({ organisation: "Zeta" }), v = centre({ statut: "AMBIGU", organisation: "Beta" });
    const b = centre({ statut: "INTROUVABLE", latitude: null, longitude: null, organisation: "Zulu" });
    const c = centre({ statut: "A_FAIRE", latitude: null, longitude: null, organisation: "Alpha" });
    const r = repartirParPosition([a, v, b, c]);
    expect(r.surLaCarte).toEqual([a, v]);
    expect(r.aVerifier).toEqual([v]);
    expect(r.pasLocalises.map((x) => x.organisation)).toEqual(["Alpha", "Zulu"]);
  });
  it("dit pourquoi, et la fiche pour y remédier, sauf quand cela se fait tout seul", () => {
    expect(raisonPosition("ADRESSE_INCOMPLETE")).toEqual({ raison: "Adresse incomplète : ajoutez la rue et le code postal ou la ville.", geste: "Compléter l'adresse" });
    expect(raisonPosition("INTROUVABLE").geste).toBe("Corriger l'adresse");
    expect(raisonPosition("AMBIGU").raison).toContain("plusieurs lieux");
    expect(raisonPosition("A_FAIRE")).toEqual({ raison: "Localisation en cours. Revenez dans quelques minutes.", geste: null });
  });
  it("après 30 minutes à faire, l'écran ne promet plus « quelques minutes »", () => {
    expect(raisonPosition("A_FAIRE", true)).toEqual({ raison: "Localisation pas encore faite. Elle sera retentée automatiquement.", geste: null });
    // Le retard ne concerne que l'attente : les autres raisons ne changent pas.
    expect(raisonPosition("INTROUVABLE", true)).toEqual(raisonPosition("INTROUVABLE"));
  });
  it("le retard : A_FAIRE seulement, strictement plus de 30 minutes après la dernière écriture", () => {
    const il = (ms: number) => new Date(MAINTENANT.getTime() - ms);
    expect(localisationEnRetard("A_FAIRE", il(A_FAIRE_EN_RETARD_MS + 1), MAINTENANT)).toBe(true);
    expect(localisationEnRetard("A_FAIRE", il(A_FAIRE_EN_RETARD_MS), MAINTENANT)).toBe(false);
    expect(localisationEnRetard("A_FAIRE", il(60_000), MAINTENANT)).toBe(false);
    for (const s of ["OK", "AMBIGU", "INTROUVABLE", "ADRESSE_INCOMPLETE"] as const) expect(localisationEnRetard(s, il(86_400_000), MAINTENANT)).toBe(false);
  });
  it("aucune phrase ne contient de tiret cadratin, d'emoji ni de vocabulaire interne", () => {
    for (const s of ["A_FAIRE", "OK", "AMBIGU", "INTROUVABLE", "ADRESSE_INCOMPLETE"] as const) {
      for (const retard of [false, true]) {
        const { raison, geste } = raisonPosition(s, retard);
        for (const t of [raison, geste ?? ""]) { expect(t).not.toMatch(/[—–]/); expect(t).not.toMatch(/geocod|npm|API|statut/i); }
      }
    }
    expect(AIDE_ADRESSE).toBe("Rue, code postal et ville. Pas de nom de personne.");
  });
  it("le lien de la fiche ouvre l'onglet des centres", () => expect(lienFiche(12)).toBe("/pilot/organisations/12?onglet=centres"));
});

describe("marqueurs", () => {
  it("un prospect prend la couleur de sa température, un client le graphite, une pause le gris", () => {
    expect(styleMarqueur(centre({ temperature: "CHAUD" }), {})).toMatchObject({ cle: "temperature-CHAUD", point: TEMPERATURE.CHAUD.point, bord: TEMPERATURE.CHAUD.texte, forme: "rond" });
    expect(styleMarqueur(centre({ genre: "CLIENT", temperature: null }), {})).toMatchObject({ cle: "client", point: CARTE.client.point, forme: "carre" });
    expect(styleMarqueur(centre({ etape: "EN_SOMMEIL", temperature: null }), {})).toMatchObject({ cle: "pause", point: CARTE.pause.point, forme: "rond" });
  });
  it("le contour en pointillé dit une position à vérifier", () => {
    expect(styleMarqueur(centre({ statut: "AMBIGU" }), {}).pointille).toBe(true);
    expect(styleMarqueur(centre(), {}).pointille).toBe(false);
  });
  it("en mode concurrents, une teinte par concurrent, la forme garde prospect ou client", () => {
    const f = { couleurs: "concurrents" } as const;
    const a = styleMarqueur(centre({ concurrentId: 7 }), f), b = styleMarqueur(centre({ concurrentId: 3, genre: "CLIENT" }), f);
    expect(a.cle).toBe("concurrent-7"); expect(b.cle).toBe("concurrent-3");
    expect(a.point).not.toBe(b.point);
    expect([a.forme, b.forme]).toEqual(["rond", "carre"]);
  });
  it("la teinte d'un concurrent : son identifiant modulo la palette, stable si un autre concurrent disparaît", () => {
    const taille = CARTE.concurrents.length;
    expect(taille).toBe(8);
    expect(teinteConcurrent(3)).toEqual(CARTE.concurrents[3]);
    expect(teinteConcurrent(7)).toEqual(CARTE.concurrents[7]);
    expect(teinteConcurrent(8)).toEqual(CARTE.concurrents[0]);
    // Au-delà de 8, deux teintes se répètent : le nom les distingue.
    expect(teinteConcurrent(3 + taille)).toEqual(teinteConcurrent(3));
  });
  it("garde les couleurs du HTML : seulement #RRGGBB, sinon le gris de repli", () => {
    const piege = htmlMarqueur({ point: "red;background:url(https://exemple.test/x)", bord: '#12345"><img src=x onerror=alert(1)>', forme: "rond", pointille: false });
    expect(piege).not.toContain("url(");
    expect(piege).not.toContain("<img");
    expect(piege).not.toContain("red;");
    expect(piege).toContain(`background:${CARTE.pause.point}`);
    expect(piege).toContain(`2px solid ${CARTE.pause.bord}`);
    expect(htmlMarqueur({ point: "#abcdef", bord: "#ABCDEF", forme: "rond", pointille: false })).toContain("background:#abcdef");
    expect(htmlMarqueur({ point: "#abc", bord: "#000000", forme: "rond", pointille: false })).toContain(`background:${CARTE.pause.point}`);
  });
  it("le losange : un carré tourné, plus petit, dans la même place", () => {
    const l = htmlMarqueur({ point: "#123456", bord: "#654321", forme: "losange", pointille: false });
    expect(l).toContain("transform:rotate(45deg)");
    expect(l).toContain("width:15px");
  });
  it("le HTML n'est fait que de valeurs des jetons : forme, couleur, contour", () => {
    const rond = htmlMarqueur({ point: "#123456", bord: "#654321", forme: "rond", pointille: false });
    expect(rond).toContain("border-radius:50%"); expect(rond).toContain("background:#123456"); expect(rond).toContain("2px solid #654321");
    expect(rond).not.toContain("<img"); expect(rond).not.toContain("url(");
    const carre = htmlMarqueur({ point: "#123456", bord: "#654321", forme: "carre", pointille: true });
    expect(carre).toContain("border-radius:6px"); expect(carre).toContain("3px dashed #654321");
  });
  it("le nom d'un marqueur dit ce que la couleur dit", () => {
    expect(nomMarqueur(centre({ temperature: "TIEDE" }), {}, concurrents)).toBe("Prospect tiède");
    expect(nomMarqueur(centre({ genre: "CLIENT", temperature: null }), {}, concurrents)).toBe("Client");
    expect(nomMarqueur(centre({ etape: "EN_SOMMEIL", temperature: null }), {}, concurrents)).toBe("Prospect en pause, sans température");
    expect(nomMarqueur(centre({ concurrentId: 7 }), { concurrent: "7" }, concurrents)).toBe("Prospect, équipé par Robot Alpha Voix");
  });
});

describe("légende", () => {
  it("une ligne par couleur présente, dans l'ordre chaud, tiède, froid, pause, client, avec son nombre", () => {
    const affiches = [centre({ genre: "CLIENT", temperature: null }), centre({ temperature: "FROID" }), centre({ temperature: "CHAUD" }), centre({ temperature: "FROID" })];
    const l = legende(affiches, {}, concurrents);
    expect(l.map((e) => [e.libelle, e.nombre])).toEqual([["Prospect chaud", 1], ["Prospect froid", 2], ["Client", 1]]);
    expect(l.every((e) => e.libelle.length > 0)).toBe(true);
  });
  it("en mode concurrents, une ligne par concurrent affiché (par nom), puis les formes", () => {
    const affiches = [centre({ concurrentId: 7 }), centre({ concurrentId: 3, genre: "CLIENT" }), centre({ concurrentId: 7 })];
    const l = legende(affiches, { couleurs: "concurrents" }, concurrents);
    expect(l.map((e) => [e.libelle, e.nombre])).toEqual([["Centre d'appels Beta", 1], ["Robot Alpha Voix", 2], ["Rond : prospect", null], ["Carré : client", null]]);
  });
  it("une ligne pour le contour en pointillé quand une position est à vérifier", () => {
    const l = legende([centre({ statut: "AMBIGU" }), centre()], {}, concurrents);
    expect(l.at(-1)).toMatchObject({ cle: "verifier", libelle: "Position à vérifier", pointille: true, nombre: 1 });
  });
  it("vide sans centre affiché", () => expect(legende([], {}, concurrents)).toEqual([]));
});

describe("cadrage", () => {
  it("le cadre de toutes les positions, en nombres pour le tracé", () => {
    expect(limites([{ latitude: "49.5", longitude: "2.25" }, { latitude: "43.3", longitude: "5.4" }, { latitude: null, longitude: null }])).toEqual([[43.3, 2.25], [49.5, 5.4]]);
    expect(limites([{ latitude: "48.8", longitude: "2.3" }])).toEqual([[48.8, 2.3], [48.8, 2.3]]);
  });
  it("sans position, pas de cadre", () => {
    expect(limites([])).toBeNull();
    expect(limites([{ latitude: null, longitude: "2" }, { latitude: "x", longitude: "y" }])).toBeNull();
  });
});

describe("bulle", () => {
  it("sa largeur suit la carte : jamais plus de 300 px, jamais plus que la carte moins ses marges", () => {
    expect(largeursBulle(1200)).toEqual({ maxWidth: 300, minWidth: 220 });
    // 320 px d'écran, 16 px de marge de chaque côté : la carte fait 288 px.
    expect(largeursBulle(288)).toEqual({ maxWidth: 224, minWidth: 220 });
    expect(largeursBulle(250)).toEqual({ maxWidth: 186, minWidth: 186 });
    expect(largeursBulle(0).maxWidth).toBe(140);
  });
  it("écrit une date de sortie sans fuseau", () => {
    expect(dateCourte("2026-10-02")).toBe("02/10/2026");
    expect(dateCourte("inattendu")).toBe("inattendu");
  });
});

describe("compteur", () => {
  it("accorde les mots", () => {
    expect(phraseCompteurs(1, 0)).toBe("1 centre sur la carte");
    expect(phraseCompteurs(12, 3)).toBe("12 centres sur la carte, 3 pas encore localisés");
    expect(phraseCompteurs(0, 1)).toBe("0 centre sur la carte, 1 pas encore localisé");
  });
});
