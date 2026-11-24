import type { CrmEtapeCommerciale, CrmRoleDecision, CrmTemperature } from "@prisma/client";
import { ETAPES_COMMERCIALES, ETAPES_SORTIE } from "@/pilot/lib/pipeline";
import { debutDuJour } from "@/pilot/lib/dates";
import { compter } from "@/pilot/lib/texte";
import { familleRis } from "./familles";
import { CHAMPS_EQUIPEMENTS, sallesDuDossier, valeurSalles } from "./salles";

/**
 * La température d'un dossier : un barème de points lu sur la fiche, calculé à
 * chaque lecture et jamais stocké (C-08). Seul le forçage humain est stocké,
 * sur le modèle de `probabiliteForcee` (C-44). La priorité A+ à C reste le
 * jugement du commercial : elle n'entre pas dans le barème.
 *
 * Référentiel dans le code, pas en base (C-05) : changer un poids ou un seuil
 * ne demande ni migration ni réécriture. Barème proposé, en attente de
 * validation par le directeur commercial.
 *
 * Une seule source par critère :
 * - Nombre de salles : `sallesDuDossier` (`salles.ts`), le même ordre que le
 *   préremplissage d'une proposition. Les salles saisies dans les centres (une
 *   ligne `CrmSalle` par salle), sinon `nombreSalles` de la fiche (plus de 0),
 *   sinon la somme des équipements déclarés sur la fiche (IRM, scanners, radio,
 *   écho, mammo), sinon inconnu. La valeur lue dit d'où vient le nombre.
 * - RIS : `ris` de la fiche, sinon celui de ses centres, ramené à sa famille
 *   (C-66). Question ouverte : « Desk vise-t-il d'autres RIS que Xplore ? ».
 *   Tant qu'elle l'est, Xplore vaut 2 et tout autre RIS connu 1 ; si la
 *   réponse est oui, `POINTS.ris.autre` montera. Un seul centre sous Xplore
 *   suffit pour 2, même avec d'autres RIS : Desk se branche là où Xplore est.
 *   Une fiche qui dit seulement « Plusieurs RIS », qui ne sait pas (« Inconnu »,
 *   « NC », « À vérifier »...) ou qui dit « Aucun RIS » laisse les centres préciser.
 *   « Inconnu » se lit comme un champ vide (« RIS inconnu »), « Aucun RIS » a sa
 *   propre valeur et son propre conseil. Les deux valent 0.
 * - Décideur : le rôle des contacts. La case « Décideur rencontré » ne compte plus.
 * - Budget : la case « Budget évoqué ».
 * - Date de décision : `decisionAttendueLe`. La case « Calendrier connu » ne compte plus.
 * - Besoin : la case « Besoin exprimé ».
 */

export const POINTS = {
  taille: { grand: 2, moyen: 1 },
  ris: { xplore: 2, autre: 1 },
  decideur: { decideur: 2, prescripteur: 1 },
  budget: 2,
  decision: { proche: 2, lointaine: 1 },
  besoin: 1,
} as const;

/** À partir de combien de salles un dossier est grand, puis moyen. */
export const SALLES = { grand: 6, moyen: 3 } as const;
/** Une décision attendue dans ce nombre de mois calendaires (aujourd'hui compris) est proche. */
export const MOIS_DECISION_PROCHE = 3;
/** Le premier total de chaque niveau : 0 à 4 froid, 5 à 8 tiède, 9 et plus chaud. */
export const SEUILS = { TIEDE: 5, CHAUD: 9 } as const;
/** La famille de RIS que Desk vise aujourd'hui (C-66). */
export const FAMILLE_RIS_VISEE = "Xplore (EDL)";

export const LIBELLES_TEMPERATURE: Record<CrmTemperature, string> = { FROID: "Froid", TIEDE: "Tiède", CHAUD: "Chaud" };

/**
 * Les deux cases cochées à la main qui entrent dans le barème. Leur libellé sert
 * aussi au formulaire de la fiche (`qualification.ts`) : un seul mot pour une chose.
 */
export const CASES_DU_BAREME = { qualifBesoin: "Besoin exprimé", qualifBudget: "Budget évoqué" } as const;

export type CleCritere = "taille" | "ris" | "decideur" | "budget" | "decision" | "besoin";
export const LIBELLES_CRITERES: Record<CleCritere, string> = {
  taille: "Nombre de salles", ris: "RIS", decideur: "Décideur", budget: "Budget", decision: "Date de décision", besoin: "Besoin",
};
const POSSIBLES: Record<CleCritere, number> = {
  taille: POINTS.taille.grand, ris: POINTS.ris.xplore, decideur: POINTS.decideur.decideur,
  budget: POINTS.budget, decision: POINTS.decision.proche, besoin: POINTS.besoin,
};
export const POINTS_POSSIBLES = Object.values(POSSIBLES).reduce((t, p) => t + p, 0);

/** Ce que l'appelant charge déjà : jamais l'objet Prisma entier. */
export type EntreeTemperature = {
  etape: CrmEtapeCommerciale;
  nombreSalles: number | null;
  /** Les équipements déclarés sur la fiche : le dernier repli, sans salle saisie ni nombre de salles (`sallesDuDossier`). */
  nombreIrm: number | null;
  nombreScanners: number | null;
  nombreRadio: number | null;
  nombreEcho: number | null;
  nombreMammo: number | null;
  ris: string | null;
  /** `salles` : le nombre de lignes `CrmSalle` du centre (`_count.salles`). */
  centres: readonly { ris: string | null; salles: number }[];
  contacts: readonly { roleDecision: CrmRoleDecision }[];
  qualifBudget: boolean;
  qualifBesoin: boolean;
  decisionAttendueLe: Date | string | null;
  temperatureForcee: CrmTemperature | null;
  temperatureForceeParId: number | null;
  temperatureForceeLe: Date | string | null;
};

export type Critere = { cle: CleCritere; libelle: string; points: number; possibles: number; valeur: string };

export type ResultatTemperature = {
  /** Après la signature, ou pour un dossier perdu ou en pause : pas de température, forçage compris. */
  sansObjet: boolean;
  calculee: CrmTemperature | null;
  points: { total: number; possibles: number; criteres: Critere[] };
  raisons: string[];
  forcage: { temperature: CrmTemperature; parId: number | null; le: Date | null } | null;
  /** La forcée si elle existe, sinon la calculée ; `null` hors étapes commerciales. */
  affichee: CrmTemperature | null;
  forceeDiffere: boolean;
};

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const jourEnClair = (d: Date) => `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** Le même jour, `n` mois plus tard, borné au dernier jour du mois (30 novembre + 3 mois = 28 février). */
function dansMois(jour: Date, n: number): Date {
  const annee = jour.getUTCFullYear(), mois = jour.getUTCMonth() + n;
  const dernier = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
  return new Date(Date.UTC(annee, mois, Math.min(jour.getUTCDate(), dernier)));
}

/** Les champs d'équipement de la fiche : définis avec les salles du dossier (`salles.ts`), repris ici pour les appelants. */
export { CHAMPS_EQUIPEMENTS };

function taille(e: EntreeTemperature): Omit<Critere, "cle" | "libelle" | "possibles"> {
  // L'ordre des sources est celui de `sallesDuDossier`, le même que le préremplissage d'une proposition.
  const salles = sallesDuDossier(e, e.centres);
  if (salles.source === "INCONNUE") return { points: 0, valeur: valeurSalles(salles) };
  const points = salles.total >= SALLES.grand ? POINTS.taille.grand : salles.total >= SALLES.moyen ? POINTS.taille.moyen : 0;
  return { points, valeur: valeurSalles(salles) };
}

/**
 * Les saisies qui disent « on ne sait pas » : traitées comme un champ vide, les
 * centres précisent, sinon « RIS inconnu ». En tête de saisie : « À vérifier »,
 * « Non renseigné », « Pas encore ». Seules dans la saisie, car un nom d'éditeur
 * peut commencer pareil : « Inconnu », « Inconnue », « NC », « N.C. », « N/A »,
 * « ? », « - ».
 */
export const INCONNU_RIS = /^(?:(?:[àa]\s*v[ée]rifier|non\s+renseign[ée]e?s?|pas\s+encore)(?![\p{L}\p{N}]).*|(?:inconnue?s?|n\s*[/.]?\s*[ac]\.?|\?+|[-\u2013\u2014]+)[\s.!]*)$/iu;
/**
 * Les saisies qui disent « pas de RIS » : 0 point, avec leur propre conseil. En tête
 * de saisie, et elles l'emportent sur un nom de RIS cité ensuite (« Non Xplore »,
 * « Pas de RIS mais Xplore RDV ») : « Aucun », « Aucune », « Pas de », « Sans »,
 * « Non », « Néant », « Rien ». « Sans doute » est une incertitude, pas une négation :
 * « Sans doute Xplore » vaut Xplore. Seul dans la saisie : « 0 ».
 */
export const AUCUN_RIS = /^(?:(?:aucune?s?|pas\s+de|sans(?!\s+doute)|non|n[ée]ant|rien)(?![\p{L}\p{N}]).*|0+(?:\s*ris)?[\s.!]*)$/iu;
/** Le début de la valeur lue quand la saisie dit « pas de RIS » : le conseil de l'écran s'y reconnaît. */
export const VALEUR_AUCUN_RIS = "Aucun RIS";
const VALEUR_RIS_INCONNU = "RIS inconnu";
export const PLUSIEURS_RIS = "Plusieurs RIS";

/**
 * Une saisie de RIS triée avant d'appeler la famille (C-66) : vide ou incertaine,
 * « pas de RIS », ou un RIS ramené à sa famille. Le tri se fait ici, pas dans
 * `familles.ts` : une négation n'est pas une famille.
 */
export type LectureRis = { genre: "vide" } | { genre: "aucun" } | { genre: "famille"; famille: string };
export function lireRis(saisie: string | null): LectureRis {
  const v = saisie?.trim() ?? "";
  if (!v || INCONNU_RIS.test(v)) return { genre: "vide" };
  if (AUCUN_RIS.test(v)) return { genre: "aucun" };
  const famille = familleRis(v);
  return famille === null ? { genre: "vide" } : { genre: "famille", famille };
}
const pointsDe = (famille: string) => famille === FAMILLE_RIS_VISEE ? POINTS.ris.xplore : POINTS.ris.autre;

function ris(e: EntreeTemperature): Omit<Critere, "cle" | "libelle" | "possibles"> {
  const fiche = lireRis(e.ris);
  // Un RIS précis sur la fiche l'emporte sur ceux des centres.
  if (fiche.genre === "famille" && fiche.famille !== PLUSIEURS_RIS) return { points: pointsDe(fiche.famille), valeur: fiche.famille };
  // La fiche ne dit rien, dit qu'on ne sait pas, dit « Aucun RIS » ou seulement « Plusieurs RIS » : les centres précisent.
  const ficheDitPlusieurs = fiche.genre === "famille";
  const lectures = e.centres.map((c) => lireRis(c.ris));
  const familles = [...new Set(lectures.flatMap((l) => (l.genre === "famille" ? [l.famille] : [])))];
  if (familles.includes(FAMILLE_RIS_VISEE)) {
    // Un centre sous Xplore suffit : Desk s'y branche, même si d'autres centres ont un autre RIS.
    const autres = familles.length > 1 || ficheDitPlusieurs;
    return { points: POINTS.ris.xplore, valeur: `${autres ? "Xplore et d'autres RIS" : FAMILLE_RIS_VISEE}, RIS des centres` };
  }
  if (ficheDitPlusieurs) return { points: POINTS.ris.autre, valeur: PLUSIEURS_RIS };
  if (familles.length) {
    const famille = familles.length > 1 ? PLUSIEURS_RIS : familles[0];
    return { points: pointsDe(famille), valeur: `${famille}, RIS des centres` };
  }
  if (fiche.genre === "aucun") return { points: 0, valeur: VALEUR_AUCUN_RIS };
  if (lectures.some((l) => l.genre === "aucun")) return { points: 0, valeur: `${VALEUR_AUCUN_RIS}, RIS des centres` };
  return { points: 0, valeur: VALEUR_RIS_INCONNU };
}

function decideur(e: EntreeTemperature): Omit<Critere, "cle" | "libelle" | "possibles"> {
  if (e.contacts.some((c) => c.roleDecision === "DECIDEUR")) return { points: POINTS.decideur.decideur, valeur: "Décideur parmi les contacts" };
  if (e.contacts.some((c) => c.roleDecision === "PRESCRIPTEUR")) return { points: POINTS.decideur.prescripteur, valeur: "Prescripteur seulement, aucun décideur" };
  return { points: 0, valeur: "Aucun décideur parmi les contacts" };
}

function decision(e: EntreeTemperature, maintenant: Date): Omit<Critere, "cle" | "libelle" | "possibles"> & { passee: boolean } {
  const lue = e.decisionAttendueLe == null || e.decisionAttendueLe === "" ? null : new Date(e.decisionAttendueLe);
  // Vide ou illisible (chaîne non datable, date invalide) : comme une date inconnue, jamais « NaN ».
  if (lue === null || !Number.isFinite(lue.getTime())) return { points: 0, valeur: "Date de décision inconnue", passee: false };
  const jour = debutDuJour(lue);
  const aujourdhui = debutDuJour(maintenant);
  if (jour < aujourdhui) return { points: 0, valeur: `Date de décision passée : ${jourEnClair(jour)}`, passee: true };
  const proche = jour <= dansMois(aujourdhui, MOIS_DECISION_PROCHE);
  return {
    points: proche ? POINTS.decision.proche : POINTS.decision.lointaine, passee: false,
    valeur: `Décision attendue le ${jourEnClair(jour)}, ${proche ? "dans les" : "au-delà de"} ${MOIS_DECISION_PROCHE} mois`,
  };
}

const niveau = (total: number): CrmTemperature => total >= SEUILS.CHAUD ? "CHAUD" : total >= SEUILS.TIEDE ? "TIEDE" : "FROID";
/** « Nombre de salles » devient « nombre de salles » dans une phrase ; « RIS » reste « RIS ». */
const enPhrase = (libelle: string) => /^.[a-zà-ÿ]/.test(libelle) ? libelle[0].toLowerCase() + libelle.slice(1) : libelle;

export function temperature(e: EntreeTemperature, maintenant: Date): ResultatTemperature {
  const lus = { taille: taille(e), ris: ris(e), decideur: decideur(e),
    budget: e.qualifBudget ? { points: POINTS.budget, valeur: CASES_DU_BAREME.qualifBudget } : { points: 0, valeur: "Budget pas encore évoqué" },
    decision: decision(e, maintenant),
    besoin: e.qualifBesoin ? { points: POINTS.besoin, valeur: CASES_DU_BAREME.qualifBesoin } : { points: 0, valeur: "Besoin pas encore exprimé" } };
  const criteres: Critere[] = (Object.keys(LIBELLES_CRITERES) as CleCritere[]).map((cle) =>
    ({ cle, libelle: LIBELLES_CRITERES[cle], points: lus[cle].points, possibles: POSSIBLES[cle], valeur: lus[cle].valeur }));
  const total = criteres.reduce((t, c) => t + c.points, 0);
  const points = { total, possibles: POINTS_POSSIBLES, criteres };
  const surOnze = `${compter(total, "point")} sur ${POINTS_POSSIBLES}`;

  if (!ETAPES_COMMERCIALES.includes(e.etape)) {
    const raison = ETAPES_SORTIE.includes(e.etape) ? "Sans objet pour un dossier perdu ou en pause." : "Sans objet après la signature.";
    return { sansObjet: true, calculee: null, points, raisons: [raison], forcage: null, affichee: null, forceeDiffere: false };
  }

  // Garde-fou : sans décideur identifié, jamais chaud.
  const sansDecideur = lus.decideur.points < POINTS.decideur.decideur;
  const bareme = niveau(total);
  const calculee: CrmTemperature = bareme === "CHAUD" && sansDecideur ? "TIEDE" : bareme;
  const raisons: string[] = [];
  // Le forçage est un jugement humain (C-44) : permis et affiché tel quel, y compris Chaud sans décideur.
  // Le garde-fou du décideur borne le calcul, pas la décision du commercial ; la raison dit alors ce que le calcul aurait donné.
  const forceeLe = e.temperatureForceeLe == null ? null : new Date(e.temperatureForceeLe);
  const forcage = e.temperatureForcee === null ? null : {
    temperature: e.temperatureForcee, parId: e.temperatureForceeParId,
    le: forceeLe !== null && Number.isFinite(forceeLe.getTime()) ? forceeLe : null,
  };
  const forceeDiffere = forcage !== null && forcage.temperature !== calculee;
  if (forcage && forceeDiffere) raisons.push(`Forcée à ${LIBELLES_TEMPERATURE[forcage.temperature]}. Le calcul dit ${LIBELLES_TEMPERATURE[calculee]}.`);

  if (calculee !== bareme) {
    raisons.push(`${LIBELLES_TEMPERATURE.TIEDE} : pas de décideur identifié.`,
      `${surOnze}. Ajoutez un décideur parmi les contacts pour passer à ${LIBELLES_TEMPERATURE.CHAUD}.`);
  } else if (calculee === "CHAUD") {
    raisons.push(`${LIBELLES_TEMPERATURE.CHAUD} : ${surOnze}.`);
  } else {
    const [suivant, seuil] = calculee === "FROID" ? ["TIEDE", SEUILS.TIEDE] as const : ["CHAUD", SEUILS.CHAUD] as const;
    raisons.push(`${LIBELLES_TEMPERATURE[calculee]} : ${surOnze}. ` + (suivant === "CHAUD" && sansDecideur
      ? `Pour passer à ${LIBELLES_TEMPERATURE.CHAUD} : ${SEUILS.CHAUD} points, dont un décideur parmi les contacts.`
      : `Encore ${compter(seuil - total, "point")} pour passer à ${LIBELLES_TEMPERATURE[suivant]}.`));
  }
  const aGagner = criteres.filter((c) => c.points < c.possibles).map((c) => enPhrase(c.libelle));
  if (aGagner.length) raisons.push(`Points à gagner : ${aGagner.join(", ")}.`);
  if (lus.decision.passee) raisons.push("Date de décision passée : mettez-la à jour.");

  return { sansObjet: false, calculee, points, raisons, forcage, affichee: forcage?.temperature ?? calculee, forceeDiffere };
}
