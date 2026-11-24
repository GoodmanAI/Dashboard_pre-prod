import type { CrmEtapeCommerciale, CrmGeocodageStatut, CrmTemperature } from "@prisma/client";
import { CARTE, TEMPERATURE } from "@/pilot/jetons";
import { ETAPES_COMMERCIALES, estClient } from "@/pilot/lib/pipeline";
import { concurrentEffectif } from "@/pilot/lib/concurrents/effectif";
import { LIBELLES_TEMPERATURE, PLUSIEURS_RIS, VALEUR_AUCUN_RIS, lireRis } from "@/pilot/lib/organisations/temperature";
import { NIVEAUX_TEMPERATURE } from "@/pilot/lib/organisations/temperatureAffichage";
import { INCONNU } from "@/pilot/lib/prospection/regles";

/**
 * Ce que l'écran Carte montre (lot U) : des règles pures, sans base ni navigateur,
 * pour que la page, la bulle, la légende et la liste des centres non localisés
 * disent la même chose. La position vient de `localiser.ts` ; ici, seulement
 * le choix de ce qui s'affiche, de sa couleur et de ses mots.
 *
 * Les coordonnées restent des chaînes décimales jusqu'au tracé : elles ne servent
 * à aucun calcul stocké.
 */

export type GenreCarte = "PROSPECT" | "CLIENT" | "PERDU";

/**
 * Un prospect : les étapes commerciales et la pause (un dossier en pause se relance
 * plus tard). Un client : signé, en mise en service ou en service. Une affaire
 * perdue contre un concurrent (Perdu avec un gagnant) : elle dit où ce concurrent
 * est implanté, et ne se montre qu'en mode concurrents (`perimetreDuMode`). Un
 * autre dossier perdu, ou un contrat terminé, n'est plus une cible : il n'est pas
 * sur la carte.
 */
export function genreCarte(etape: CrmEtapeCommerciale, concurrentGagnantId: number | null = null): GenreCarte | null {
  if (estClient(etape)) return "CLIENT";
  if (ETAPES_COMMERCIALES.includes(etape) || etape === "EN_SOMMEIL") return "PROSPECT";
  if (etape === "PERDU" && concurrentGagnantId !== null) return "PERDU";
  return null;
}

/** Le montant du dossier, tel que le tableau Prospects le calcule (C-70) : jamais un chiffre d'affaires. */
export type MontantCarte = { centimes: number | null; libelle: string };

/**
 * Un centre avec ce que la carte en dit. Sérialisable : il traverse la frontière
 * vers le navigateur. Ni rue, ni code postal : la carte n'affiche que le nom du
 * centre, sa commune et sa position.
 */
export type CentreCarte = {
  id: number;
  organisationId: number;
  organisation: string;
  centre: string;
  ville: string | null;
  statut: CrmGeocodageStatut;
  /** A_FAIRE depuis plus de `A_FAIRE_EN_RETARD_MS` : l'écran ne dit plus « en cours ». Calculé par le serveur. */
  enRetard: boolean;
  /** Chaîne décimale de la base : convertie en nombre seulement pour tracer. */
  latitude: string | null;
  longitude: string | null;
  genre: GenreCarte;
  etape: CrmEtapeCommerciale;
  temperature: CrmTemperature | null;
  temperatureForcee: boolean;
  /** Le montant du dossier ; toujours null pour une affaire perdue. */
  montant: MontantCarte | null;
  /** Le concurrent qui équipe l'établissement (`concurrentEffectif`) : le gagnant d'une affaire perdue, jamais pour un client. */
  concurrentId: number | null;
  /** La date de sortie d'une affaire perdue (AAAA-MM-JJ), sinon null. */
  dateSortie: string | null;
  responsableId: number | null;
  responsable: string | null;
  /** La famille de RIS lue par `familleCarte` : la fiche, puis le centre, comme le barème de température (C-66, C-74). */
  famille: string | null;
};

export type OrganisationLue = {
  id: number; nom: string; etape: CrmEtapeCommerciale; ris: string | null;
  concurrentId: number | null; concurrentGagnantId: number | null; dateSortie: string | null;
  responsableId: number | null; responsable: string | null;
  temperature: { niveau: CrmTemperature; forcee: boolean } | null;
  montant: MontantCarte | null;
};
export type CentreLu = {
  id: number; organisationId: number; nom: string; ville: string | null; ris: string | null;
  geocodageStatut: CrmGeocodageStatut; latitude: string | null; longitude: string | null;
  /** Dernière écriture humaine du centre : un changement d'adresse le repasse en A_FAIRE à cette date. */
  majLe: Date;
};

/**
 * Au-delà de 30 minutes en A_FAIRE, le géocodage lancé après l'écriture a échoué
 * ou a été perdu : le rattrapage planifié (`npm run geocoder`, toutes les 15
 * minutes) le reprendra. L'écran le dit au lieu de promettre « quelques minutes ».
 * La date lue est la dernière écriture du centre : une autre modification la
 * rajeunit, l'écran dit alors « en cours » un peu plus longtemps, sans mentir sur
 * ce qui se fera.
 */
export const A_FAIRE_EN_RETARD_MS = 30 * 60 * 1000;

/** Vrai pour un centre en A_FAIRE dont la dernière écriture date de plus de 30 minutes. `maintenant` est un paramètre. */
export function localisationEnRetard(statut: CrmGeocodageStatut, majLe: Date, maintenant: Date): boolean {
  return statut === "A_FAIRE" && maintenant.getTime() - majLe.getTime() > A_FAIRE_EN_RETARD_MS;
}

/**
 * La famille de RIS d'un centre sur la carte, lue par `lireRis` (temperature.ts) :
 * la même lecture et le même ordre que le barème de température. Un RIS précis
 * sur la fiche l'emporte ; sinon (fiche vide, incertaine, « Aucun RIS » ou
 * seulement « Plusieurs RIS »), le RIS du centre précise. « Inconnu », « NC »,
 * « À vérifier » comptent comme vides (filtre « non renseigné ») ; « Aucun »,
 * « Néant » donnent « Aucun RIS », une famille du filtre comme une autre.
 */
export function familleCarte(risFiche: string | null, risCentre: string | null): string | null {
  const fiche = lireRis(risFiche);
  if (fiche.genre === "famille" && fiche.famille !== PLUSIEURS_RIS) return fiche.famille;
  const centre = lireRis(risCentre);
  if (centre.genre === "famille") return centre.famille;
  if (fiche.genre === "famille") return fiche.famille;
  if (fiche.genre === "aucun" || centre.genre === "aucun") return VALEUR_AUCUN_RIS;
  return null;
}

/** Associe chaque centre à son organisation, sans requête : tout est déjà lu. Les dossiers hors carte s'en vont. */
export function assemblerCentres(organisations: readonly OrganisationLue[], centres: readonly CentreLu[], maintenant: Date): CentreCarte[] {
  const parId = new Map(organisations.map((o) => [o.id, o]));
  return centres.flatMap((c): CentreCarte[] => {
    const o = parId.get(c.organisationId);
    const genre = o && genreCarte(o.etape, o.concurrentGagnantId);
    if (!o || !genre) return [];
    const perdu = genre === "PERDU";
    return [{
      id: c.id, organisationId: o.id, organisation: o.nom, centre: c.nom, ville: c.ville,
      statut: c.geocodageStatut, enRetard: localisationEnRetard(c.geocodageStatut, c.majLe, maintenant),
      latitude: c.latitude, longitude: c.longitude,
      genre, etape: o.etape, temperature: o.temperature?.niveau ?? null, temperatureForcee: o.temperature?.forcee ?? false,
      montant: perdu ? null : o.montant, concurrentId: concurrentEffectif(o), dateSortie: perdu ? o.dateSortie : null,
      responsableId: o.responsableId, responsable: o.responsable,
      famille: familleCarte(o.ris, c.ris),
    }];
  });
}

/** Les familles de RIS présentes dans les centres, de la plus fréquente à la plus rare : les choix du filtre. À calculer sur `perimetreDuMode`. */
export function famillesPresentes(centres: readonly Pick<CentreCarte, "famille">[]): string[] {
  const comptes = new Map<string, number>();
  for (const c of centres) if (c.famille) comptes.set(c.famille, (comptes.get(c.famille) ?? 0) + 1);
  return [...comptes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr")).map(([famille]) => famille);
}

/* ------------------------------- Les filtres ------------------------------- */

/**
 * Les filtres, dans l'adresse de la page (C-36) : des codes et des identifiants,
 * jamais un texte saisi.
 * - qui : prospects ou clients ; absent, les deux. Les affaires perdues n'y répondent pas.
 * - temperature : CHAUD, TIEDE ou FROID. Un client n'a pas de température : il n'y répond pas.
 * - concurrent : « tous » (un concurrent, quel qu'il soit) ou son identifiant,
 *   comparé au concurrent qui équipe l'établissement (`concurrentEffectif`).
 * - commercial : « moi », « inconnu » (non attribué) ou l'identifiant d'un compte ;
 *   son propre identifiant est ramené à « moi ».
 * - ris : une famille de RIS, ou « inconnu ».
 * - couleurs : « concurrents » colore par concurrent et ne montre que les
 *   établissements qu'un concurrent équipe, affaires perdues comprises.
 */
export type FiltresCarte = {
  qui?: "prospects" | "clients";
  temperature?: CrmTemperature;
  concurrent?: string;
  commercial?: string;
  ris?: string;
  couleurs?: "concurrents";
};
export const CLES_FILTRES = ["qui", "temperature", "concurrent", "commercial", "ris", "couleurs"] as const;
export const TOUS_LES_CONCURRENTS = "tous";

export type ValeursValides = { concurrents: readonly number[]; comptes: readonly number[]; familles: readonly string[]; moiId: number };

const premier = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** Lit l'adresse de la page : une valeur inconnue est ignorée, jamais une erreur. */
export function lireFiltres(brut: Record<string, string | string[] | undefined>, valides: ValeursValides): FiltresCarte {
  const f: FiltresCarte = {};
  const qui = premier(brut.qui);
  if (qui === "prospects" || qui === "clients") f.qui = qui;
  const temperature = NIVEAUX_TEMPERATURE.find((n) => n === premier(brut.temperature));
  if (temperature) f.temperature = temperature;
  const concurrent = premier(brut.concurrent);
  if (concurrent === TOUS_LES_CONCURRENTS || (concurrent && /^\d+$/.test(concurrent) && valides.concurrents.includes(Number(concurrent)))) f.concurrent = concurrent;
  const commercial = premier(brut.commercial);
  if (commercial === "moi" || commercial === INCONNU) f.commercial = commercial;
  else if (commercial && /^\d+$/.test(commercial)) {
    // Son propre identifiant : « À moi », la seule option qui le désigne dans la liste.
    if (Number(commercial) === valides.moiId) f.commercial = "moi";
    else if (valides.comptes.includes(Number(commercial))) f.commercial = commercial;
  }
  const ris = premier(brut.ris);
  if (ris === INCONNU || (ris && valides.familles.includes(ris))) f.ris = ris;
  if (premier(brut.couleurs) === "concurrents") f.couleurs = "concurrents";
  return f;
}

/** La partie de l'adresse qui porte les filtres : vide sans filtre, sinon « ?qui=clients&... », dans un ordre fixe. */
export function adresseFiltres(f: FiltresCarte): string {
  const p = new URLSearchParams();
  for (const cle of CLES_FILTRES) if (f[cle]) p.set(cle, f[cle]);
  const texte = p.toString();
  return texte ? `?${texte}` : "";
}

export const compterFiltres = (f: FiltresCarte): number => CLES_FILTRES.filter((c) => f[c]).length;

/** Les couleurs suivent le concurrent : par le filtre « concurrent », ou par le choix des couleurs. */
export const modeConcurrents = (f: FiltresCarte): boolean => f.couleurs === "concurrents" || f.concurrent !== undefined;

/**
 * Ce que le mode montre, avant les autres filtres. En mode concurrents : les
 * établissements qu'un concurrent équipe (`concurrentEffectif`), donc jamais un
 * client de Lyrae, et les affaires perdues contre un concurrent. Un concurrent
 * n'a pas d'adresse chez nous : ce sont ces établissements qui le situent.
 * Sinon : prospects et clients, sans les affaires perdues.
 */
export function perimetreDuMode<T extends Pick<CentreCarte, "genre" | "concurrentId">>(centres: readonly T[], f: FiltresCarte): T[] {
  return modeConcurrents(f) ? centres.filter((c) => c.concurrentId !== null) : centres.filter((c) => c.genre !== "PERDU");
}

/**
 * Une famille de RIS absente du périmètre du mode ne reste pas choisie : les
 * familles proposées changent avec le mode, le filtre les suit. Rend les mêmes
 * filtres s'il n'y a rien à retirer.
 */
export function ajusterFiltres(f: FiltresCarte, centres: readonly Pick<CentreCarte, "genre" | "concurrentId" | "famille">[]): FiltresCarte {
  if (!f.ris || f.ris === INCONNU || famillesPresentes(perimetreDuMode(centres, f)).includes(f.ris)) return f;
  const reste = { ...f };
  delete reste.ris;
  return reste;
}

/** Les centres qui répondent aux filtres, localisés ou non. */
export function filtrer(centres: readonly CentreCarte[], f: FiltresCarte, moiId: number): CentreCarte[] {
  return perimetreDuMode(centres, f).filter((c) => {
    if (f.qui === "prospects" && c.genre !== "PROSPECT") return false;
    if (f.qui === "clients" && c.genre !== "CLIENT") return false;
    if (f.temperature && c.temperature !== f.temperature) return false;
    // Le concurrent effectif : le gagnant, pour une affaire perdue.
    if (f.concurrent && f.concurrent !== TOUS_LES_CONCURRENTS && c.concurrentId !== Number(f.concurrent)) return false;
    if (f.commercial === "moi" && c.responsableId !== moiId) return false;
    if (f.commercial === INCONNU && c.responsableId !== null) return false;
    if (f.commercial && f.commercial !== "moi" && f.commercial !== INCONNU && c.responsableId !== Number(f.commercial)) return false;
    if (f.ris === INCONNU && c.famille !== null) return false;
    if (f.ris && f.ris !== INCONNU && c.famille !== f.ris) return false;
    return true;
  });
}

/* ------------------------- Localisé, à vérifier, absent ------------------------- */

/** Sur la carte : une position existe et le statut la permet (OK, ou AMBIGU qui garde la plus probable). */
export function estSurLaCarte(c: Pick<CentreCarte, "statut" | "latitude" | "longitude">): boolean {
  return (c.statut === "OK" || c.statut === "AMBIGU") && c.latitude !== null && c.longitude !== null;
}

/** Les trois groupes d'un périmètre : sur la carte, à vérifier (placés quand même), pas encore localisés. */
export function repartirParPosition(centres: readonly CentreCarte[]) {
  const surLaCarte = centres.filter(estSurLaCarte);
  return {
    surLaCarte,
    aVerifier: surLaCarte.filter((c) => c.statut === "AMBIGU"),
    pasLocalises: centres.filter((c) => !estSurLaCarte(c)).sort((a, b) => a.organisation.localeCompare(b.organisation, "fr") || a.centre.localeCompare(b.centre, "fr") || a.id - b.id),
  };
}

export const LIBELLES_POSITION: Record<CrmGeocodageStatut, string> = {
  OK: "Localisé",
  AMBIGU: "Position à vérifier",
  INTROUVABLE: "Adresse introuvable",
  ADRESSE_INCOMPLETE: "Adresse incomplète : ajoutez la rue et le code postal ou la ville",
  A_FAIRE: "Localisation en attente",
};

/**
 * Pourquoi un centre n'est pas (ou pas sûrement) sur la carte, et ce qu'on peut
 * faire. `geste` : le lien vers la fiche, quand l'adresse peut s'y corriger ; null
 * quand il n'y a rien à faire. `enRetard` : en A_FAIRE depuis plus de 30 minutes
 * (`localisationEnRetard`) ; le rattrapage planifié le reprendra.
 */
export function raisonPosition(statut: CrmGeocodageStatut, enRetard = false): { raison: string; geste: string | null } {
  switch (statut) {
    case "ADRESSE_INCOMPLETE": return { raison: "Adresse incomplète : ajoutez la rue et le code postal ou la ville.", geste: "Compléter l'adresse" };
    case "INTROUVABLE": return { raison: "Adresse introuvable. Vérifiez la rue, le code postal et la ville.", geste: "Corriger l'adresse" };
    case "AMBIGU": return { raison: "L'adresse correspond à plusieurs lieux. Le centre est placé au plus probable.", geste: "Vérifier l'adresse" };
    case "A_FAIRE": return enRetard
      ? { raison: "Localisation pas encore faite. Elle sera retentée automatiquement.", geste: null }
      : { raison: "Localisation en cours. Revenez dans quelques minutes.", geste: null };
    case "OK": return { raison: "Localisé.", geste: null };
  }
}

/**
 * L'aide sous les champs d'adresse d'un centre (fiche, fiche rapide, site de
 * l'apport) : ce champ part vers un service public de géocodage, il ne doit
 * porter que l'adresse.
 */
export const AIDE_ADRESSE = "Rue, code postal et ville. Pas de nom de personne.";

/** La fiche, ouverte sur l'onglet des centres : c'est là que l'adresse se corrige. */
export const lienFiche = (organisationId: number): string => `/pilot/organisations/${organisationId}?onglet=centres`;

/* --------------------------------- Marqueurs --------------------------------- */

export type FormeMarqueur = "rond" | "carre" | "losange";
export type StyleMarqueur = { cle: string; point: string; bord: string; forme: FormeMarqueur; pointille: boolean };
export type ConcurrentCarte = { id: number; nom: string };

/**
 * La teinte d'un concurrent : son identifiant modulo la taille de la palette (8).
 * Elle ne dépend ni du filtre ni des autres concurrents : en supprimer un ne
 * change la teinte d'aucun autre. Au-delà de 8 concurrents, deux teintes se
 * répètent forcément ; la légende (une ligne par concurrent, avec son nom), le nom
 * du marqueur et la bulle disent alors lequel est lequel.
 */
export function teinteConcurrent(id: number): { point: string; bord: string } {
  const taille = CARTE.concurrents.length;
  return CARTE.concurrents[((id % taille) + taille) % taille]!;
}

/**
 * Le marqueur d'un centre. Rond pour un prospect, carré pour un client, losange
 * pour une affaire perdue. Couleur : la température d'un prospect, graphite pour
 * un client, gris pour un prospect en pause ; ou, en mode concurrents, la teinte
 * du concurrent qui équipe l'établissement. Un contour en pointillé dit que la
 * position est à vérifier.
 */
export function styleMarqueur(c: CentreCarte, f: FiltresCarte): StyleMarqueur {
  const forme: FormeMarqueur = c.genre === "CLIENT" ? "carre" : c.genre === "PERDU" ? "losange" : "rond";
  const pointille = c.statut === "AMBIGU";
  if (modeConcurrents(f) && c.concurrentId !== null) {
    return { cle: `concurrent-${c.concurrentId}`, ...teinteConcurrent(c.concurrentId), forme, pointille };
  }
  if (c.genre === "CLIENT") return { cle: "client", ...CARTE.client, forme, pointille };
  if (c.temperature) return { cle: `temperature-${c.temperature}`, point: TEMPERATURE[c.temperature].point, bord: TEMPERATURE[c.temperature].texte, forme, pointille };
  return { cle: "pause", ...CARTE.pause, forme, pointille };
}

const COTE = 20;
/** Le losange : un carré tourné, plus petit pour que sa diagonale tienne dans la même place. */
const COTE_LOSANGE = 15;

/** Une couleur des jetons, et rien d'autre : six chiffres hexadécimaux. */
const COULEUR = /^#[0-9A-F]{6}$/i;
/** Ce qui remplace une couleur refusée : le gris du prospect en pause. */
const COULEUR_DE_REPLI = CARTE.pause;

/**
 * Le HTML d'un marqueur (`divIcon`, sans image). Que des valeurs des jetons :
 * aucun texte saisi n'y entre. Les couleurs sont gardées (`#RRGGBB` seulement) :
 * une autre valeur prend le gris de repli et n'entre jamais dans le HTML.
 */
export function htmlMarqueur(s: Pick<StyleMarqueur, "point" | "bord" | "forme" | "pointille">): string {
  const point = COULEUR.test(s.point) ? s.point : COULEUR_DE_REPLI.point;
  const bord = COULEUR.test(s.bord) ? s.bord : COULEUR_DE_REPLI.bord;
  const trait = s.pointille ? "3px dashed" : "2px solid";
  const forme = s.forme === "losange"
    ? `width:${COTE_LOSANGE}px;height:${COTE_LOSANGE}px;margin:${(COTE - COTE_LOSANGE) / 2}px;border-radius:2px;transform:rotate(45deg);`
    : `width:${COTE}px;height:${COTE}px;border-radius:${s.forme === "rond" ? "50%" : "6px"};`;
  return `<span style="display:block;box-sizing:border-box;${forme}background:${point};border:${trait} ${bord};`
    + `box-shadow:0 0 0 2px ${CARTE.halo},0 1px 5px rgba(0,0,0,0.35)"></span>`;
}
export const COTE_MARQUEUR = COTE;

/** Ce que dit un marqueur à qui ne voit pas sa couleur : « Prospect chaud », « Client », « Affaire perdue contre Alpha ». */
export function nomMarqueur(c: CentreCarte, f: FiltresCarte, concurrents: readonly ConcurrentCarte[]): string {
  const concurrent = c.concurrentId === null ? undefined : concurrents.find((x) => x.id === c.concurrentId);
  if (c.genre === "PERDU") return concurrent ? `Affaire perdue contre ${concurrent.nom}` : "Affaire perdue contre un concurrent";
  if (modeConcurrents(f) && concurrent) return `${c.genre === "CLIENT" ? "Client" : "Prospect"}, équipé par ${concurrent.nom}`;
  if (c.genre === "CLIENT") return "Client";
  return c.temperature ? `Prospect ${LIBELLES_TEMPERATURE[c.temperature].toLowerCase()}` : "Prospect en pause, sans température";
}

export type EntreeLegende = { cle: string; libelle: string; point: string; bord: string; forme: FormeMarqueur; pointille: boolean; nombre: number | null };

const LIBELLES_LEGENDE: Record<string, string> = {
  client: "Client", pause: "Prospect en pause, sans température",
  "temperature-CHAUD": "Prospect chaud", "temperature-TIEDE": "Prospect tiède", "temperature-FROID": "Prospect froid",
};
const ORDRE_LEGENDE = ["temperature-CHAUD", "temperature-TIEDE", "temperature-FROID", "pause", "client"];

/**
 * La légende de ce qui est affiché : une ligne par couleur présente, avec son
 * mot et son nombre. En mode concurrents, une ligne par concurrent, puis les
 * formes (rond, carré, losange) puisque la couleur ne dit plus prospect, client
 * ou affaire perdue. Un contour en pointillé a sa ligne quand un centre à
 * vérifier est affiché.
 */
export function legende(affiches: readonly CentreCarte[], f: FiltresCarte, concurrents: readonly ConcurrentCarte[]): EntreeLegende[] {
  const parCle = new Map<string, { style: StyleMarqueur; nombre: number }>();
  for (const c of affiches) {
    const style = styleMarqueur(c, f);
    const vu = parCle.get(style.cle);
    if (vu) vu.nombre += 1; else parCle.set(style.cle, { style, nombre: 1 });
  }
  const nomConcurrent = (cle: string) => concurrents.find((c) => `concurrent-${c.id}` === cle)?.nom ?? "Concurrent";
  const entrees: EntreeLegende[] = [...parCle.values()]
    .sort((a, b) => {
      const ia = ORDRE_LEGENDE.indexOf(a.style.cle), ib = ORDRE_LEGENDE.indexOf(b.style.cle);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return nomConcurrent(a.style.cle).localeCompare(nomConcurrent(b.style.cle), "fr");
    })
    .map(({ style, nombre }) => ({
      // La ligne d'un concurrent montre un rond, quelle que soit la forme du premier centre : les formes ont leurs propres lignes.
      cle: style.cle, libelle: LIBELLES_LEGENDE[style.cle] ?? nomConcurrent(style.cle),
      point: style.point, bord: style.bord, forme: style.cle.startsWith("concurrent-") ? "rond" : style.forme, pointille: false, nombre,
    }));
  if (modeConcurrents(f)) {
    if (affiches.some((c) => c.genre === "PROSPECT")) entrees.push({ cle: "forme-rond", libelle: "Rond : prospect", ...CARTE.neutre, forme: "rond", pointille: false, nombre: null });
    if (affiches.some((c) => c.genre === "CLIENT")) entrees.push({ cle: "forme-carre", libelle: "Carré : client", ...CARTE.neutre, forme: "carre", pointille: false, nombre: null });
    if (affiches.some((c) => c.genre === "PERDU")) entrees.push({ cle: "forme-losange", libelle: "Losange : affaire perdue", ...CARTE.neutre, forme: "losange", pointille: false, nombre: null });
  }
  if (affiches.some((c) => c.statut === "AMBIGU")) {
    entrees.push({ cle: "verifier", libelle: LIBELLES_POSITION.AMBIGU, ...CARTE.neutre, forme: "rond", pointille: true, nombre: affiches.filter((c) => c.statut === "AMBIGU").length });
  }
  return entrees;
}

/* ---------------------------------- Cadrage ---------------------------------- */

export type Limites = [[number, number], [number, number]];

/** Le cadre qui contient toutes les positions (sud-ouest, nord-est), ou null sans position. Pour le tracé seulement. */
export function limites(points: readonly { latitude: string | null; longitude: string | null }[]): Limites | null {
  let sud = Infinity, ouest = Infinity, nord = -Infinity, est = -Infinity;
  for (const p of points) {
    if (p.latitude === null || p.longitude === null) continue;
    const lat = Number(p.latitude), lng = Number(p.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    sud = Math.min(sud, lat); nord = Math.max(nord, lat); ouest = Math.min(ouest, lng); est = Math.max(est, lng);
  }
  return sud === Infinity ? null : [[sud, ouest], [nord, est]];
}

/** Sans position à montrer, la France entière. */
export const VUE_PAR_DEFAUT = { centre: [46.6, 2.5] as [number, number], zoom: 6 };

/**
 * La largeur utile d'une bulle, d'après la largeur de la carte : jamais plus de
 * 300 px, et jamais plus que la carte moins ses marges (la bulle et ses 16 px de
 * marge intérieure de chaque côté, plus 16 px d'air), pour qu'elle ne déborde pas
 * à 320 px. La largeur minimale suit, sans dépasser la maximale.
 */
export function largeursBulle(largeurCarte: number): { maxWidth: number; minWidth: number } {
  const maxWidth = Math.max(140, Math.min(300, Math.floor(largeurCarte) - 64));
  return { maxWidth, minWidth: Math.min(220, maxWidth) };
}

/** « 18/11/2026 » pour une date AAAA-MM-JJ, sans passer par le fuseau du navigateur. */
export function dateCourte(jour: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(jour);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : jour;
}

/** Une phrase pour le compteur : « 12 centres sur la carte, 3 pas encore localisés ». */
export function phraseCompteurs(surLaCarte: number, pasLocalises: number): string {
  const centres = `${surLaCarte} ${surLaCarte > 1 ? "centres" : "centre"} sur la carte`;
  if (pasLocalises === 0) return centres;
  return `${centres}, ${pasLocalises} pas encore ${pasLocalises > 1 ? "localisés" : "localisé"}`;
}
