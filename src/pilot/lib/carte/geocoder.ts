/**
 * Géocodage d'un centre (lot U) : l'adresse publique du site devient une
 * position sur la carte. Ce module n'importe pas la base : la requête et
 * l'analyse de la réponse sont des fonctions pures, testées sur des réponses
 * enregistrées (`geocoder.test.ts`, `fixtures/`), et l'appel réseau prend son
 * `fetch` en paramètre. L'écriture en base vit dans `localiser.ts`.
 *
 * Ce qui part vers le service : la rue, le code postal et la ville, rien
 * d'autre. Jamais un nom de contact, ni le nom ou l'identifiant d'une fiche.
 * Une seule adresse de destination, fixe, sans aucune donnée d'environnement.
 */
import { departementDuCodePostal } from "@/pilot/lib/prospection/regles";

/** Service de géocodage de la Géoplateforme (IGN), successeur d'api-adresse.data.gouv.fr. Pas de clé. */
export const HOTE_GEOCODAGE = "https://data.geopf.fr/geocodage/search";
/** Nomme l'application, jamais une personne ni une adresse e-mail. */
export const USER_AGENT_GEOCODAGE = "LyraePilot/1.0 (CRM interne)";
/** Au-delà, l'appel est abandonné : le centre reste à faire, on réessaiera. */
export const DELAI_GEOCODAGE_MS = 8_000;
/** Plusieurs résultats, pour reconnaître deux lieux qui se valent. */
export const NOMBRE_RESULTATS = 5;
/** Le service refuse une requête de plus de 200 signes. */
export const LONGUEUR_MAX_REQUETE = 200;
/**
 * 10 requêtes par seconde au plus depuis Pilot, bien sous la limite du service
 * (50 par seconde et par adresse IP, constatée le 19/11/2026).
 */
export const INTERVALLE_MIN_MS = 100;
/** Le corps d'une réponse n'est lu que jusqu'à cette taille : au-delà, l'appel est annulé et la réponse dite illisible. */
export const TAILLE_MAX_CORPS = 256 * 1024;
/** Les types de contenu acceptés : JSON ou GeoJSON. */
const TYPE_JSON = /^application\/(?:json|geo\+json|vnd\.geo\+json)\s*(?:;|$)/i;
/** Après un refus pour débit (429) : la pause demandée par `Retry-After`, sinon celle-ci, et jamais plus que la borne. */
export const PAUSE_APRES_DEBIT_MS = 5_000;
export const PAUSE_DEBIT_MAX_MS = 60_000;

/**
 * Seuils de l'analyse, en millièmes du score du service (de 0 à 1 côté service).
 * - Au moins SCORE_OK : la position est retenue (OK), sauf lieu concurrent.
 * - Sous SCORE_INTROUVABLE : le service a deviné, rien de crédible (INTROUVABLE).
 * - Entre les deux : AMBIGU, la position la plus probable est gardée.
 * - Un second résultat à moins de ECART_SCORE_PROCHE du premier et à plus de
 *   DISTANCE_PROCHE (en millionièmes de degré, environ 500 m) : deux lieux se
 *   valent, AMBIGU.
 * - Un premier résultat de type « commune » : seule la ville a été reconnue,
 *   la position est le centre de la commune, AMBIGU.
 * - Un premier résultat hors du département du code postal saisi : INTROUVABLE.
 */
export const SCORE_OK = 700;
export const SCORE_INTROUVABLE = 300;
export const ECART_SCORE_PROCHE = 50;
export const DISTANCE_PROCHE = 5_000;

export type StatutGeocodage = "A_FAIRE" | "OK" | "AMBIGU" | "INTROUVABLE" | "ADRESSE_INCOMPLETE";

/** Les seuls champs d'un centre qui servent au géocodage. */
export type AdresseCentre = { adresse: string | null; codePostal: string | null; ville: string | null };
export const CHAMPS_ADRESSE = ["adresse", "codePostal", "ville"] as const;

/**
 * Ce qu'on écrit sur un centre dont l'adresse change, dans la même transaction :
 * la position précédente ne correspond plus.
 */
export const GEOCODAGE_A_REFAIRE = {
  geocodageStatut: "A_FAIRE", latitude: null, longitude: null, geocodageScore: null, geocodeLe: null,
} as const;

const propre = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ");

/** Vrai si une écriture change la rue, le code postal ou la ville (champs absents : inchangés ; espaces ignorés). */
export function adresseChangee(avant: AdresseCentre, apres: Partial<AdresseCentre>): boolean {
  return CHAMPS_ADRESSE.some((c) => apres[c] !== undefined && propre(apres[c]) !== propre(avant[c]));
}

/**
 * Faut-il relancer le géocodage après cette écriture ? Oui si l'adresse change
 * (la transaction a alors repassé le centre en A_FAIRE). Oui aussi quand un champ
 * d'adresse est réécrit sans changer au sens de `adresseChangee` (des espaces)
 * alors que le centre est encore A_FAIRE : un géocodage en cours a lu l'ancienne
 * écriture, sa condition d'écriture échouera, et le centre resterait à faire
 * jusqu'au rattrapage planifié.
 */
export function geocodageARelancer(avant: AdresseCentre & { geocodageStatut: StatutGeocodage }, champsEcrits: Partial<AdresseCentre>): boolean {
  if (adresseChangee(avant, champsEcrits)) return true;
  return avant.geocodageStatut === "A_FAIRE" && CHAMPS_ADRESSE.some((c) => champsEcrits[c] !== undefined && (champsEcrits[c] ?? null) !== avant[c]);
}

export type RequeteGeocodage =
  | { complete: true; q: string }
  | { complete: false; manque: "rue" | "commune" };

/**
 * La requête à partir de l'adresse du centre. Il faut la rue et une commune :
 * code postal ou ville, un code postal écrit dans l'adresse, comme dans les
 * sites repris du calculateur (« Rue du Nord, 59000 Lille »), ou un mot après une
 * virgule, comme dans le champ unique d'un site de l'apport (« 3 avenue Foch,
 * Lille ») : la requête part, et le score du service décide. Sans la rue, la
 * position serait celle de la commune : l'adresse est dite incomplète et rien
 * ne part vers le service.
 */
export function construireRequete(centre: AdresseCentre): RequeteGeocodage {
  const rue = propre(centre.adresse), codePostal = propre(centre.codePostal), ville = propre(centre.ville);
  if (!rue) return { complete: false, manque: "rue" };
  const rueMinuscule = rue.toLocaleLowerCase("fr");
  const codeDansRue = /\b\d{5}\b/.test(rue);
  const communeApresVirgule = /,\s*\p{L}/u.test(rue);
  if (!codePostal && !ville && !codeDansRue && !communeApresVirgule) return { complete: false, manque: "commune" };
  const parties = [rue];
  if (codePostal && !rueMinuscule.includes(codePostal.toLocaleLowerCase("fr"))) parties.push(codePostal);
  if (ville && !rueMinuscule.includes(ville.toLocaleLowerCase("fr"))) parties.push(ville);
  let q = parties.join(" ");
  if (q.length > LONGUEUR_MAX_REQUETE) {
    // Coupé sur un espace : le début d'une adresse porte le numéro et la voie.
    q = q.slice(0, LONGUEUR_MAX_REQUETE);
    const espace = q.lastIndexOf(" ");
    if (espace > LONGUEUR_MAX_REQUETE / 2) q = q.slice(0, espace);
  }
  return { complete: true, q };
}

/**
 * Le code postal saisi pour le centre : le champ, sinon un code à cinq chiffres
 * écrit dans l'adresse. Sert à vérifier que le service a trouvé le bon
 * département. Null sans code.
 */
export function codePostalSaisi(centre: AdresseCentre): string | null {
  const champ = (centre.codePostal ?? "").replace(/\s/g, "");
  if (/^\d{5}$/.test(champ)) return champ;
  return /\b(\d{5})\b/.exec(centre.adresse ?? "")?.[1] ?? null;
}

/** L'URL de l'appel : l'hôte fixe, la requête et le nombre de résultats, rien d'autre. */
export function urlGeocodage(q: string): string {
  const url = new URL(HOTE_GEOCODAGE);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(NOMBRE_RESULTATS));
  return url.toString();
}

/**
 * Un nombre reçu en JSON, décalé de `decimales` chiffres et arrondi à l'entier
 * le plus proche (moitié : on s'éloigne de zéro), sans calcul flottant : on
 * travaille sur l'écriture décimale du nombre. 2.290084 et 6 décimales donnent
 * 2290084 ; 0.97072 et 3 décimales donnent 971. Null si la valeur n'est pas un
 * nombre fini ou dépasse `max` en valeur absolue.
 */
export function entierDecale(n: unknown, decimales: number, max: number): number | null {
  if (typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > max) return null;
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(n));
  if (!m) return null;
  const [, signe, entier, fraction = "", exposant = "0"] = m;
  let chiffres = entier + fraction;
  let virgule = entier.length + Number(exposant);
  if (virgule < 0) { chiffres = "0".repeat(-virgule) + chiffres; virgule = 0; }
  const fin = virgule + decimales;
  chiffres = chiffres.padEnd(fin + 1, "0");
  let valeur = Number(chiffres.slice(0, fin) || "0");
  if (chiffres[fin] >= "5") valeur += 1;
  return signe && valeur !== 0 ? -valeur : valeur;
}

/** Un entier en millionièmes écrit en décimal exact, six chiffres après la virgule : 2290084 donne « 2.290084 ». */
export function decimalMillionieme(v: number): string {
  const absolu = Math.abs(v);
  return `${v < 0 ? "-" : ""}${Math.floor(absolu / 1_000_000)}.${String(absolu % 1_000_000).padStart(6, "0")}`;
}

export type ResultatGeocodage = {
  /** A_FAIRE : la réponse est inexploitable, rien n'est écrit, on réessaiera. */
  statut: Exclude<StatutGeocodage, "ADRESSE_INCOMPLETE">;
  /** Décimal exact au millionième (« 49.897442 »), ou null sans position. */
  latitude: string | null;
  longitude: string | null;
  /** Score du premier résultat en millièmes, ou null. */
  score: number | null;
};

type Candidat = { latitude: number; longitude: number; score: number; commune: boolean; departements: string[] };

/** Un résultat lisible, ou null : coordonnées [longitude, latitude] dans leurs bornes, score entre 0 et 1. */
function lireCandidat(f: unknown): Candidat | null {
  if (typeof f !== "object" || f === null) return null;
  const { geometry, properties } = f as { geometry?: unknown; properties?: unknown };
  const coordonnees = (geometry as { coordinates?: unknown } | null | undefined)?.coordinates;
  if (!Array.isArray(coordonnees) || coordonnees.length < 2) return null;
  const longitude = entierDecale(coordonnees[0], 6, 180), latitude = entierDecale(coordonnees[1], 6, 90);
  const proprietes = (typeof properties === "object" && properties !== null ? properties : {}) as { score?: unknown; type?: unknown; depcode?: unknown; postcode?: unknown };
  const score = entierDecale(proprietes.score, 3, 1);
  if (longitude === null || latitude === null || score === null || score < 0) return null;
  if (Math.abs(longitude) > 180_000_000 || Math.abs(latitude) > 90_000_000) return null;
  // Le département du résultat : son `depcode`, et celui que donne son code postal (Corse et outre-mer compris).
  const departements = [
    typeof proprietes.depcode === "string" ? proprietes.depcode.trim().toUpperCase() : null,
    typeof proprietes.postcode === "string" ? departementDuCodePostal(proprietes.postcode) : null,
  ].filter((d): d is string => !!d);
  return { latitude, longitude, score, commune: proprietes.type === "municipality", departements };
}

/**
 * Le résultat est-il dans le département du code postal saisi ? Vrai si l'un des
 * deux départements du résultat (son `depcode`, celui de son code postal)
 * correspond : quelques communes ont le code postal d'un département voisin, le
 * `depcode` les rattrape. Vrai aussi quand l'un des deux côtés est inconnu (pas
 * de code saisi, résultat sans département) : rien à comparer.
 */
export function memeDepartement(candidat: { departements: readonly string[] }, codePostal: string | null): boolean {
  const saisi = departementDuCodePostal(codePostal);
  if (!saisi || !candidat.departements.length) return true;
  return candidat.departements.includes(saisi);
}

const A_REFAIRE: ResultatGeocodage = { statut: "A_FAIRE", latitude: null, longitude: null, score: null };

/**
 * Lit la réponse du service (FeatureCollection GeoJSON, coordonnées dans l'ordre
 * longitude puis latitude) et dit ce qu'on en retient. Une réponse malformée,
 * ou dont le premier résultat est illisible, rend A_FAIRE : on ne conclut rien.
 * Un meilleur résultat hors du département du code postal saisi n'est pas placé :
 * INTROUVABLE, sans position (une rue homonyme dans une autre ville).
 */
export function analyserReponse(corps: unknown, codePostal: string | null): ResultatGeocodage {
  if (typeof corps !== "object" || corps === null) return A_REFAIRE;
  const features = (corps as { features?: unknown }).features;
  if (!Array.isArray(features)) return A_REFAIRE;
  if (features.length === 0) return { statut: "INTROUVABLE", latitude: null, longitude: null, score: null };
  const premier = lireCandidat(features[0]);
  if (!premier) return A_REFAIRE;
  if (premier.score < SCORE_INTROUVABLE || !memeDepartement(premier, codePostal)) {
    return { statut: "INTROUVABLE", latitude: null, longitude: null, score: premier.score };
  }
  const concurrent = features.slice(1).map(lireCandidat).some((c) => c !== null
    && premier.score - c.score <= ECART_SCORE_PROCHE
    && (Math.abs(c.latitude - premier.latitude) > DISTANCE_PROCHE || Math.abs(c.longitude - premier.longitude) > DISTANCE_PROCHE));
  const statut = premier.score >= SCORE_OK && !concurrent && !premier.commune ? "OK" : "AMBIGU";
  return { statut, latitude: decimalMillionieme(premier.latitude), longitude: decimalMillionieme(premier.longitude), score: premier.score };
}

export type ReponseService =
  | { ok: true; corps: unknown }
  /** debit : 429, avec la pause à respecter avant le prochain appel (`Retry-After` borné). */
  | { ok: false; raison: "debit"; pauseMs: number }
  /** reseau : injoignable ou délai dépassé ; http : autre refus ; illisible : pas du JSON, ou plus de 256 Kio. */
  | { ok: false; raison: "reseau" | "http" | "illisible" };

export type RaisonEchec = Exclude<ReponseService, { ok: true }>["raison"];

/** Les échecs qui disent que le service lui-même ne répond pas (et non que l'adresse pose problème) : on les compte d'affilée. */
export function echecDuService(raison: RaisonEchec | "malformee"): boolean {
  return raison === "reseau" || raison === "debit" || raison === "http";
}

/**
 * La pause après un 429 : `Retry-After` en secondes ou en date HTTP, bornée à
 * PAUSE_DEBIT_MAX_MS ; absent ou illisible, PAUSE_APRES_DEBIT_MS. Pure : l'instant
 * est un paramètre.
 */
export function pauseApresDebit(retryAfter: string | null | undefined, maintenant: Date): number {
  const valeur = (retryAfter ?? "").trim();
  let ms: number | null = null;
  if (/^\d+$/.test(valeur)) ms = Number(valeur) * 1000;
  else if (/^[A-Za-z]{3}, /.test(valeur)) {
    const date = Date.parse(valeur);
    if (Number.isFinite(date)) ms = Math.max(0, date - maintenant.getTime());
  }
  return ms === null ? PAUSE_APRES_DEBIT_MS : Math.min(PAUSE_DEBIT_MAX_MS, ms);
}

/**
 * Le corps d'une réponse, lu jusqu'à `max` octets. Au-delà (annoncé par
 * `Content-Length` ou constaté en lisant), la lecture est annulée et rend null.
 */
export async function lireCorpsBorne(reponse: Response, max: number = TAILLE_MAX_CORPS): Promise<string | null> {
  const annonce = Number(reponse.headers.get("content-length") ?? "");
  if (Number.isFinite(annonce) && annonce > max) { await reponse.body?.cancel().catch(() => undefined); return null; }
  if (!reponse.body) return "";
  const lecteur = reponse.body.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await lecteur.cancel().catch(() => undefined); return null; }
    morceaux.push(value);
  }
  const tout = new Uint8Array(total);
  let position = 0;
  for (const m of morceaux) { tout.set(m, position); position += m.byteLength; }
  return new TextDecoder("utf-8").decode(tout);
}

/** L'appel au service ; ne lève jamais d'exception. */
export type ServiceGeocodage = (q: string) => Promise<ReponseService>;

/**
 * Appelle le service sur un seul hôte, fixe, avec un délai d'expiration. Une
 * erreur réseau, un délai dépassé, un 429, un type de contenu qui n'est ni JSON
 * ni GeoJSON, un corps de plus de 256 Kio ou une réponse illisible sont rendus,
 * jamais levés : le centre reste à faire.
 */
export async function appelerService(q: string, options: { fetch?: typeof fetch; delaiMs?: number; maintenant?: () => Date } = {}): Promise<ReponseService> {
  const appel = options.fetch ?? globalThis.fetch;
  let reponse: Response;
  try {
    reponse = await appel(urlGeocodage(q), {
      method: "GET",
      headers: { "User-Agent": USER_AGENT_GEOCODAGE, Accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(options.delaiMs ?? DELAI_GEOCODAGE_MS),
    });
  } catch {
    return { ok: false, raison: "reseau" };
  }
  if (reponse.status === 429) {
    await reponse.body?.cancel().catch(() => undefined);
    return { ok: false, raison: "debit", pauseMs: pauseApresDebit(reponse.headers.get("retry-after"), (options.maintenant ?? (() => new Date()))()) };
  }
  if (!reponse.ok) { await reponse.body?.cancel().catch(() => undefined); return { ok: false, raison: "http" }; }
  if (!TYPE_JSON.test(reponse.headers.get("content-type") ?? "")) { await reponse.body?.cancel().catch(() => undefined); return { ok: false, raison: "illisible" }; }
  try {
    const texte = await lireCorpsBorne(reponse);
    if (texte === null) return { ok: false, raison: "illisible" };
    return { ok: true, corps: JSON.parse(texte) as unknown };
  } catch {
    // Délai dépassé pendant la lecture, ou JSON invalide.
    return { ok: false, raison: "illisible" };
  }
}

/**
 * Le géocodage automatique est coupé pendant les tests (NODE_ENV=test) et quand
 * PILOT_GEOCODAGE=0 : seed, serveur de vérification. Aucun appel ne part alors.
 */
export function geocodageActif(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "test" && env.PILOT_GEOCODAGE !== "0";
}
