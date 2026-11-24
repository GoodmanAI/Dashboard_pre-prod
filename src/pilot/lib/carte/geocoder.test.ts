import { describe, expect, it } from "vitest";
import {
  adresseChangee, analyserReponse, appelerService, codePostalSaisi, construireRequete, decimalMillionieme, echecDuService, entierDecale, geocodageActif,
  geocodageARelancer, HOTE_GEOCODAGE, lireCorpsBorne, LONGUEUR_MAX_REQUETE, memeDepartement, NOMBRE_RESULTATS, PAUSE_APRES_DEBIT_MS, PAUSE_DEBIT_MAX_MS,
  pauseApresDebit, TAILLE_MAX_CORPS, urlGeocodage, USER_AGENT_GEOCODAGE,
} from "./geocoder";
// Réponses du service. trouve-amiens : l'exemple public de sa documentation,
// tel que le service l'a rendu. Les autres reprennent ce format exact.
import trouveAmiens from "./fixtures/trouve-amiens.json";
import trouveDoublonProche from "./fixtures/trouve-doublon-proche.json";
import ambiguScoreFaible from "./fixtures/ambigu-score-faible.json";
import ambiguDeuxLieux from "./fixtures/ambigu-deux-lieux.json";
import communeSeule from "./fixtures/commune-seule.json";
import introuvableDevine from "./fixtures/introuvable-devine.json";
import rien from "./fixtures/rien.json";

describe("analyse de la réponse du service", () => {
  it("trouvé avec un bon score : OK, position exacte au millionième, longitude puis latitude dans la réponse", () => {
    expect(analyserReponse(trouveAmiens, null)).toEqual({ statut: "OK", latitude: "49.897442", longitude: "2.290084", score: 971 });
  });
  it("deux résultats au même endroit ne rendent pas ambigu", () => {
    expect(analyserReponse(trouveDoublonProche, null)).toEqual({ statut: "OK", latitude: "50.629250", longitude: "3.057256", score: 864 });
  });
  it("score faible : ambigu, la position la plus probable est gardée", () => {
    expect(analyserReponse(ambiguScoreFaible, null)).toEqual({ statut: "AMBIGU", latitude: "45.764043", longitude: "4.835659", score: 552 });
  });
  it("deux lieux éloignés aux scores proches : ambigu, même avec un bon score", () => {
    expect(analyserReponse(ambiguDeuxLieux, null)).toEqual({ statut: "AMBIGU", latitude: "47.902964", longitude: "1.909251", score: 812 });
  });
  it("seule la commune est reconnue : ambigu", () => {
    expect(analyserReponse(communeSeule, null).statut).toBe("AMBIGU");
  });
  it("rien trouvé : introuvable, sans position ni score", () => {
    expect(analyserReponse(rien, null)).toEqual({ statut: "INTROUVABLE", latitude: null, longitude: null, score: null });
  });
  it("un résultat deviné (score très faible) : introuvable, sans position", () => {
    expect(analyserReponse(introuvableDevine, null)).toEqual({ statut: "INTROUVABLE", latitude: null, longitude: null, score: 213 });
  });
  it("réponse malformée : à refaire, rien n'est conclu", () => {
    const aRefaire = { statut: "A_FAIRE", latitude: null, longitude: null, score: null };
    for (const corps of [
      null, "texte", 42, [], {}, { features: "non" }, { features: [null] }, { features: [{}] },
      { features: [{ geometry: { coordinates: [2.29] }, properties: { score: 0.9 } }] },
      { features: [{ geometry: { coordinates: ["2.29", 49.89] }, properties: { score: 0.9 } }] },
      { features: [{ geometry: { coordinates: [2.29, 49.89] }, properties: {} }] },
      { features: [{ geometry: { coordinates: [2.29, 49.89] }, properties: { score: 1.5 } }] },
      { features: [{ geometry: { coordinates: [2.29, 49.89] }, properties: { score: -0.1 } }] },
      // Latitude hors bornes : l'ordre inversé par erreur se voit.
      { features: [{ geometry: { coordinates: [49.89, 120.5] }, properties: { score: 0.9 } }] },
      { features: [{ geometry: { coordinates: [200, 45] }, properties: { score: 0.9 } }] },
    ]) expect(analyserReponse(corps, null)).toEqual(aRefaire);
  });
  it("le code postal saisi du même département ne change rien", () => {
    expect(analyserReponse(trouveAmiens, "80000")).toEqual({ statut: "OK", latitude: "49.897442", longitude: "2.290084", score: 971 });
    expect(analyserReponse(ambiguDeuxLieux, "45000").statut).toBe("AMBIGU");
  });
  it("un résultat dans un autre département n'est pas placé : introuvable, sans position", () => {
    const paris = { features: [{ geometry: { coordinates: [2.382, 48.884] }, properties: { score: 0.93, type: "housenumber", postcode: "75019", depcode: "75" } }] };
    // Lyon saisi, Paris trouvé.
    expect(analyserReponse(paris, "69002")).toEqual({ statut: "INTROUVABLE", latitude: null, longitude: null, score: 930 });
    expect(analyserReponse(paris, "75019").statut).toBe("OK");
    // Le code postal écrit dans l'adresse compte aussi.
    expect(analyserReponse(paris, codePostalSaisi({ adresse: "Rue du Nord, 69002 Lyon", codePostal: null, ville: null })).statut).toBe("INTROUVABLE");
  });
  it("Corse : 2A et 2B se distinguent", () => {
    const ajaccio = { features: [{ geometry: { coordinates: [8.738, 41.919] }, properties: { score: 0.95, postcode: "20000", depcode: "2A" } }] };
    const bastia = { features: [{ geometry: { coordinates: [9.45, 42.7] }, properties: { score: 0.95, postcode: "20200", depcode: "2B" } }] };
    expect(analyserReponse(ajaccio, "20000").statut).toBe("OK");
    expect(analyserReponse(bastia, "20200").statut).toBe("OK");
    expect(analyserReponse(bastia, "20000").statut).toBe("INTROUVABLE");
    expect(analyserReponse(ajaccio, "20200").statut).toBe("INTROUVABLE");
    // Sans depcode, le code postal du résultat suffit.
    const sansDepcode = { features: [{ geometry: { coordinates: [9.45, 42.7] }, properties: { score: 0.95, postcode: "20200" } }] };
    expect(analyserReponse(sansDepcode, "20600").statut).toBe("OK");
    expect(analyserReponse(sansDepcode, "20090").statut).toBe("INTROUVABLE");
  });
  it("outre-mer : le département à trois chiffres", () => {
    const fortDeFrance = { features: [{ geometry: { coordinates: [-61.07, 14.6] }, properties: { score: 0.9, postcode: "97200", depcode: "972" } }] };
    expect(analyserReponse(fortDeFrance, "97200").statut).toBe("OK");
    expect(analyserReponse(fortDeFrance, "97100").statut).toBe("INTROUVABLE");
  });
  it("une commune au code postal d'un département voisin : son depcode suffit", () => {
    expect(memeDepartement({ departements: ["04", "05"] }, "04200")).toBe(true);
    expect(memeDepartement({ departements: ["04", "05"] }, "05110")).toBe(true);
    expect(memeDepartement({ departements: ["04"] }, "06000")).toBe(false);
  });
  it("rien à comparer : pas de code saisi, ou résultat sans département", () => {
    expect(memeDepartement({ departements: ["75"] }, null)).toBe(true);
    expect(memeDepartement({ departements: [] }, "69002")).toBe(true);
    expect(memeDepartement({ departements: ["75"] }, "98000")).toBe(true);
  });
  it("un second résultat illisible n'empêche pas de conclure sur le premier", () => {
    const corps = { features: [...trouveAmiens.features, { geometry: null }] };
    expect(analyserReponse(corps, null).statut).toBe("OK");
  });
});

describe("arrondi sans flottant", () => {
  it("décale l'écriture décimale et arrondit la moitié loin de zéro", () => {
    expect(entierDecale(2.290084, 6, 180)).toBe(2290084);
    expect(entierDecale(49.8974425, 6, 90)).toBe(49897443);
    expect(entierDecale(-1.5536214, 6, 180)).toBe(-1553621);
    expect(entierDecale(-0.0000005, 6, 180)).toBe(-1);
    expect(entierDecale(0.97072, 3, 1)).toBe(971);
    expect(entierDecale(0.9995, 3, 1)).toBe(1000);
    expect(entierDecale(1, 3, 1)).toBe(1000);
    expect(entierDecale(0, 6, 90)).toBe(0);
    expect(entierDecale(1e-7, 6, 90)).toBe(0);
    expect(entierDecale(45, 6, 90)).toBe(45000000);
    // Les scores réels ont jusqu'à seize décimales (réponse enregistrée).
    expect(entierDecale(0.4318687390029325, 3, 1)).toBe(432);
    expect(entierDecale(0.33312370288248344, 3, 1)).toBe(333);
  });
  it("refuse ce qui n'est pas un nombre fini dans ses bornes", () => {
    for (const v of [NaN, Infinity, "2.29", null, undefined, 91]) expect(entierDecale(v, 6, 90)).toBeNull();
  });
  it("écrit un décimal exact à six chiffres", () => {
    expect(decimalMillionieme(2290084)).toBe("2.290084");
    expect(decimalMillionieme(-500000)).toBe("-0.500000");
    expect(decimalMillionieme(-1553621)).toBe("-1.553621");
    expect(decimalMillionieme(0)).toBe("0.000000");
    expect(decimalMillionieme(180000000)).toBe("180.000000");
  });
});

describe("requête à partir de l'adresse du centre", () => {
  it("rue, code postal et ville, et rien d'autre", () => {
    expect(construireRequete({ adresse: " 8  boulevard du Port ", codePostal: "80000", ville: "Amiens" }))
      .toEqual({ complete: true, q: "8 boulevard du Port 80000 Amiens" });
  });
  it("ne répète pas le code postal et la ville déjà écrits dans l'adresse (sites du calculateur)", () => {
    expect(construireRequete({ adresse: "Rue du Nord, 59000 Lille", codePostal: null, ville: null }))
      .toEqual({ complete: true, q: "Rue du Nord, 59000 Lille" });
    expect(construireRequete({ adresse: "Rue du Nord, 59000 Lille", codePostal: "59000", ville: "lille" }))
      .toEqual({ complete: true, q: "Rue du Nord, 59000 Lille" });
  });
  it("la rue et la ville suffisent, la rue et le code postal aussi", () => {
    expect(construireRequete({ adresse: "2 rue de l'Exemple", codePostal: null, ville: "Lyon" })).toEqual({ complete: true, q: "2 rue de l'Exemple Lyon" });
    expect(construireRequete({ adresse: "2 rue de l'Exemple", codePostal: "69002", ville: "" })).toEqual({ complete: true, q: "2 rue de l'Exemple 69002" });
  });
  it("sans rue : incomplète, rien ne part", () => {
    expect(construireRequete({ adresse: null, codePostal: "69002", ville: "Lyon" })).toEqual({ complete: false, manque: "rue" });
    expect(construireRequete({ adresse: "   ", codePostal: null, ville: null })).toEqual({ complete: false, manque: "rue" });
  });
  it("sans commune : incomplète", () => {
    expect(construireRequete({ adresse: "2 rue de l'Exemple", codePostal: null, ville: null })).toEqual({ complete: false, manque: "commune" });
    // Une virgule seule, ou suivie d'un chiffre, ne suffit pas.
    expect(construireRequete({ adresse: "2 rue de l'Exemple,", codePostal: null, ville: null })).toEqual({ complete: false, manque: "commune" });
    expect(construireRequete({ adresse: "Bâtiment B, 2 rue de l'Exemple", codePostal: null, ville: null })).toEqual({ complete: false, manque: "commune" });
  });
  it("une virgule suivie d'un mot (le champ unique d'un site de l'apport) : la requête part, le score décide", () => {
    expect(construireRequete({ adresse: "3 avenue Foch, Lille", codePostal: null, ville: null })).toEqual({ complete: true, q: "3 avenue Foch, Lille" });
    expect(construireRequete({ adresse: "3 avenue Foch,Évry", codePostal: null, ville: null })).toEqual({ complete: true, q: "3 avenue Foch,Évry" });
    expect(construireRequete({ adresse: "12 rue Haute, 2", codePostal: null, ville: null })).toEqual({ complete: false, manque: "commune" });
  });
  it("le code postal saisi : le champ, sinon celui écrit dans l'adresse", () => {
    expect(codePostalSaisi({ adresse: "Rue du Nord, 59000 Lille", codePostal: " 69 002 ", ville: null })).toBe("69002");
    expect(codePostalSaisi({ adresse: "Rue du Nord, 59000 Lille", codePostal: null, ville: null })).toBe("59000");
    expect(codePostalSaisi({ adresse: "3 avenue Foch, Lille", codePostal: "", ville: "Lille" })).toBeNull();
  });
  it("coupe une requête trop longue sur un espace", () => {
    const r = construireRequete({ adresse: "Bâtiment B ".repeat(30), codePostal: "75001", ville: "Paris" });
    expect(r.complete && r.q.length <= LONGUEUR_MAX_REQUETE && !r.q.endsWith(" ")).toBe(true);
  });
  it("l'URL vise l'hôte fixe avec la requête et le nombre de résultats seulement", () => {
    const url = new URL(urlGeocodage("8 boulevard du Port 80000 Amiens"));
    expect(`${url.origin}${url.pathname}`).toBe(HOTE_GEOCODAGE);
    expect([...url.searchParams.keys()]).toEqual(["q", "limit"]);
    expect(url.searchParams.get("q")).toBe("8 boulevard du Port 80000 Amiens");
    expect(url.searchParams.get("limit")).toBe(String(NOMBRE_RESULTATS));
  });
});

describe("changement d'adresse", () => {
  const avant = { adresse: "2 rue de l'Exemple", codePostal: "69002", ville: "Lyon" };
  it("la rue, le code postal ou la ville changent", () => {
    expect(adresseChangee(avant, { adresse: "4 rue de l'Exemple" })).toBe(true);
    expect(adresseChangee(avant, { codePostal: "69003" })).toBe(true);
    expect(adresseChangee(avant, { ville: null })).toBe(true);
  });
  it("un champ absent, ou les mêmes valeurs aux espaces près, ne changent rien", () => {
    expect(adresseChangee(avant, {})).toBe(false);
    expect(adresseChangee(avant, { adresse: " 2  rue de l'Exemple " })).toBe(false);
    expect(adresseChangee({ adresse: null, codePostal: null, ville: null }, { ville: "" })).toBe(false);
  });
});

describe("relancer le géocodage après une écriture", () => {
  const avant = { adresse: "2 rue de l'Exemple", codePostal: "69002", ville: "Lyon" };
  it("l'adresse change : oui, quel que soit le statut", () => {
    expect(geocodageARelancer({ ...avant, geocodageStatut: "OK" }, { ville: "Lille" })).toBe(true);
  });
  it("réécrite aux espaces près : oui si le centre est encore à faire, non sinon", () => {
    expect(geocodageARelancer({ ...avant, geocodageStatut: "A_FAIRE" }, { adresse: "2  rue de l'Exemple" })).toBe(true);
    expect(geocodageARelancer({ ...avant, geocodageStatut: "OK" }, { adresse: "2  rue de l'Exemple" })).toBe(false);
  });
  it("aucun champ d'adresse touché, ou la même valeur : non", () => {
    expect(geocodageARelancer({ ...avant, geocodageStatut: "A_FAIRE" }, {})).toBe(false);
    expect(geocodageARelancer({ ...avant, geocodageStatut: "A_FAIRE" }, { adresse: "2 rue de l'Exemple" })).toBe(false);
  });
});

describe("pause après un refus pour débit", () => {
  const maintenant = new Date("2026-11-19T10:00:00Z");
  it("Retry-After en secondes, borné", () => {
    expect(pauseApresDebit("2", maintenant)).toBe(2000);
    expect(pauseApresDebit("0", maintenant)).toBe(0);
    expect(pauseApresDebit("3600", maintenant)).toBe(PAUSE_DEBIT_MAX_MS);
  });
  it("Retry-After en date HTTP", () => {
    expect(pauseApresDebit("Thu, 19 Nov 2026 10:00:07 GMT", maintenant)).toBe(7000);
    expect(pauseApresDebit("Thu, 19 Nov 2026 09:00:00 GMT", maintenant)).toBe(0);
  });
  it("absent ou illisible : 5 secondes", () => {
    for (const v of [null, undefined, "", "bientôt", "-3"]) expect(pauseApresDebit(v, maintenant)).toBe(PAUSE_APRES_DEBIT_MS);
  });
  it("les échecs du service, distincts d'une réponse illisible", () => {
    expect(["reseau", "debit", "http"].every((r) => echecDuService(r as "reseau"))).toBe(true);
    expect(echecDuService("illisible")).toBe(false);
    expect(echecDuService("malformee")).toBe(false);
  });
});

describe("lecture bornée du corps", () => {
  const flux = (morceaux: number[], annulations: string[] = []) => new ReadableStream<Uint8Array>({
    pull(controleur) {
      const taille = morceaux.shift();
      if (taille === undefined) controleur.close(); else controleur.enqueue(new Uint8Array(taille).fill(32));
    },
    cancel() { annulations.push("annulé"); },
  });
  it("lit un corps sous la limite", async () => {
    expect(await lireCorpsBorne(new Response("{\"a\":1}"))).toBe('{"a":1}');
  });
  it("annule au-delà de la limite, même sans Content-Length", async () => {
    const annulations: string[] = [];
    expect(await lireCorpsBorne(new Response(flux([TAILLE_MAX_CORPS, 10, 10], annulations)))).toBeNull();
    expect(annulations).toEqual(["annulé"]);
  });
  it("refuse d'emblée un Content-Length trop grand", async () => {
    const annulations: string[] = [];
    const r = new Response(flux([10], annulations), { headers: { "content-length": String(TAILLE_MAX_CORPS + 1) } });
    expect(await lireCorpsBorne(r)).toBeNull();
  });
  it("juste à la limite : lu", async () => {
    expect((await lireCorpsBorne(new Response(flux([TAILLE_MAX_CORPS - 1, 1]))))?.length).toBe(TAILLE_MAX_CORPS);
  });
});

describe("appel au service (fetch injecté, aucun appel réel)", () => {
  type Appel = { url: string; init?: RequestInit };
  const faux = (reponse: () => Response | Promise<Response>, appels: Appel[] = []) =>
    (async (url: string, init?: RequestInit) => { appels.push({ url, init }); return reponse(); }) as unknown as typeof fetch;

  it("rend le corps lu, appelle l'hôte fixe et se nomme LyraePilot", async () => {
    const appels: Appel[] = [];
    const r = await appelerService("8 boulevard du Port 80000 Amiens", { fetch: faux(() => Response.json(trouveAmiens), appels) });
    expect(r.ok && analyserReponse(r.corps, null).statut).toBe("OK");
    expect(appels).toHaveLength(1);
    expect(appels[0].url.startsWith(HOTE_GEOCODAGE + "?")).toBe(true);
    const entetes = appels[0].init?.headers as Record<string, string>;
    expect(entetes["User-Agent"]).toBe(USER_AGENT_GEOCODAGE);
    expect(USER_AGENT_GEOCODAGE).not.toMatch(/@/);
    expect(appels[0].init?.redirect).toBe("error");
  });
  it("erreur réseau : rendue, jamais levée", async () => {
    const r = await appelerService("x y", { fetch: faux(() => { throw new TypeError("fetch failed"); }) });
    expect(r).toEqual({ ok: false, raison: "reseau" });
  });
  it("délai dépassé : erreur réseau", async () => {
    const lent = ((_: string, init?: RequestInit) => new Promise<Response>((_r, rejeter) => {
      init?.signal?.addEventListener("abort", () => rejeter(new DOMException("délai", "TimeoutError")));
    })) as unknown as typeof fetch;
    expect(await appelerService("x y", { fetch: lent, delaiMs: 20 })).toEqual({ ok: false, raison: "reseau" });
  });
  it("429 : débit, à refaire, avec la pause demandée", async () => {
    expect(await appelerService("x y", { fetch: faux(() => new Response("trop", { status: 429 })) })).toEqual({ ok: false, raison: "debit", pauseMs: PAUSE_APRES_DEBIT_MS });
    expect(await appelerService("x y", { fetch: faux(() => new Response("trop", { status: 429, headers: { "retry-after": "3" } })) }))
      .toEqual({ ok: false, raison: "debit", pauseMs: 3000 });
  });
  it("autre refus : http", async () => {
    expect(await appelerService("x y", { fetch: faux(() => new Response("panne", { status: 503 })) })).toEqual({ ok: false, raison: "http" });
  });
  it("pas du JSON : illisible", async () => {
    expect(await appelerService("x y", { fetch: faux(() => new Response("<html>", { status: 200 })) })).toEqual({ ok: false, raison: "illisible" });
    // Annoncé JSON mais invalide.
    expect(await appelerService("x y", { fetch: faux(() => new Response("{pas du json", { headers: { "content-type": "application/json" } })) }))
      .toEqual({ ok: false, raison: "illisible" });
  });
  it("le type de contenu doit être JSON ou GeoJSON", async () => {
    const avec = (type: string) => faux(() => new Response(JSON.stringify(trouveAmiens), { headers: { "content-type": type } }));
    for (const type of ["application/json", "application/json; charset=utf-8", "application/geo+json", "application/vnd.geo+json;charset=UTF-8"]) {
      expect((await appelerService("x y", { fetch: avec(type) })).ok).toBe(true);
    }
    for (const type of ["text/html", "text/plain", "application/jsonp", "application/octet-stream"]) {
      expect(await appelerService("x y", { fetch: avec(type) })).toEqual({ ok: false, raison: "illisible" });
    }
  });
  it("un corps de plus de 256 Kio : illisible", async () => {
    const gros = JSON.stringify({ features: [], bourrage: "x".repeat(TAILLE_MAX_CORPS) });
    expect(await appelerService("x y", { fetch: faux(() => new Response(gros, { headers: { "content-type": "application/json" } })) }))
      .toEqual({ ok: false, raison: "illisible" });
  });
});

describe("géocodage automatique coupé", () => {
  it("pendant les tests et avec PILOT_GEOCODAGE=0", () => {
    expect(geocodageActif({ NODE_ENV: "test" })).toBe(false);
    expect(geocodageActif({ NODE_ENV: "development", PILOT_GEOCODAGE: "0" })).toBe(false);
    expect(geocodageActif({ NODE_ENV: "production" })).toBe(true);
    expect(geocodageActif({ NODE_ENV: "development", PILOT_GEOCODAGE: "1" })).toBe(true);
  });
  it("les tests eux-mêmes tournent avec le géocodage coupé", () => {
    expect(geocodageActif()).toBe(false);
  });
});
