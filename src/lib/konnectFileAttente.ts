/**
 * File d'attente des patients LyraeKonnect (27/10/2026).
 *
 * Plan workspace `plans/2026-10-file-attente-konnect.md` (K1 à K16), `DECISIONS.md`
 * du 27/10/2026. La file vit dans le Dashboard seul (`KonnectFileAttente`) ; Konnect
 * y inscrit le patient, relit la file à chaque passage de son moteur et demande
 * chaque changement d'état ici. Ce module tient les états, les gestes permis et le
 * réglage par site ; les routes ne font que les appliquer.
 *
 * Règle de concurrence (K11) : un geste est une transition **conditionnelle** sur
 * l'état attendu, et pour Konnect sur la version lue. Zéro ligne touchée = 409 et
 * l'appelant abandonne. C'est la base qui arbitre entre la secrétaire et le moteur.
 */

/** États d'une inscription. Ne jamais renommer une valeur (règle 2 du workspace). */
export const ETATS = {
  en_file: "en_file",
  proposition: "proposition",
  confirmation_en_cours: "confirmation_en_cours",
  pris_par_la_file: "pris_par_la_file",
  traite_secretaire: "traite_secretaire",
  retire_secretaire: "retire_secretaire",
  retire_patient: "retire_patient",
  sans_reponse: "sans_reponse",
  refus_repetes: "refus_repetes",
  expire_60j: "expire_60j",
} as const;

export type Etat = (typeof ETATS)[keyof typeof ETATS];

/** Les états où le patient est encore dans la file. Tous les autres sont des sorties. */
export const ETATS_ACTIFS: readonly Etat[] = [
  "en_file",
  "proposition",
  "confirmation_en_cours",
];

/** K10 : sorties automatiques. Fixées pour tous les centres. */
export const SORTIE_APRES_SANS_REPONSE = 2;
export const SORTIE_APRES_REFUS_DATE = 3;
export const EXPIRATION_JOURS = 60;
export const PURGE_JOURS_APRES_SORTIE = 30;

/**
 * Gestes de Konnect (clé d'API). Chacun dit d'où il part ; l'état d'arrivée se
 * calcule dans la route (un refus de date peut sortir le patient au troisième).
 */
export const GESTES_KONNECT = {
  /** Une place est affiliée au patient : `creneau` et `reponseAvant` obligatoires. */
  proposer: ["en_file"],
  /** Le RDV qui tient la place a été créé dans Xplore. */
  attacher_rdv: ["proposition"],
  /** Le patient a cliqué « Je confirme » : fenêtre fermée à la secrétaire. */
  commencer_confirmation: ["proposition"],
  /** Xplore a validé : `rdvId` obligatoire. Sortie. */
  confirmer: ["confirmation_en_cours"],
  /** Xplore a échoué pendant la confirmation : retour en file, sans compteur. */
  echec_confirmation: ["confirmation_en_cours"],
  /** « Cette date ne me convient pas ». Sortie au troisième. */
  refuser_date: ["proposition"],
  /** « Je n'en ai plus besoin ». Sortie. */
  plus_besoin: ["proposition"],
  /** Le délai de réponse est passé. Sortie au deuxième. */
  delai_ecoule: ["proposition"],
  /** La place a disparu (prise ailleurs, RDV d'attente supprimé, SMS non parti). */
  rendre: ["proposition"],
} as const satisfies Record<string, readonly Etat[]>;

export type GesteKonnect = keyof typeof GESTES_KONNECT;

/**
 * Gestes de la secrétaire (session). Permis tant que le patient n'est pas en train
 * de confirmer en ligne : `confirmation_en_cours` dure quelques secondes.
 */
export const GESTES_SECRETAIRE = {
  traiter: ["en_file", "proposition"],
  retirer: ["en_file", "proposition"],
} as const satisfies Record<string, readonly Etat[]>;

export type GesteSecretaire = keyof typeof GESTES_SECRETAIRE;

/** Types d'événement (statistiques, sans donnée patient). Ne jamais en renommer un. */
export const EVENEMENTS = {
  inscription: "inscription",
  proposition: "proposition",
  confirmation: "confirmation",
  refus_date: "refus_date",
  plus_besoin: "plus_besoin",
  delai_ecoule: "delai_ecoule",
  place_disparue: "place_disparue",
  echec_confirmation: "echec_confirmation",
  traite_secretaire: "traite_secretaire",
  retire_secretaire: "retire_secretaire",
  sortie_sans_reponse: "sortie_sans_reponse",
  sortie_refus_repetes: "sortie_refus_repetes",
  expire_60j: "expire_60j",
} as const;

// ----------------------------------------------------------------- créneau

export type CreneauPropose = {
  codeSite: string;
  poste: string;
  date: string;
  heure: string;
};

/** Le créneau affilié, tel que Konnect l'envoie. `null` si inexploitable. */
export function lireCreneau(brut: unknown): CreneauPropose | null {
  const c = brut as Record<string, unknown> | null;
  if (!c || typeof c !== "object") return null;
  const texte = (v: unknown, max: number) =>
    typeof v === "string" ? v.trim().slice(0, max) : "";
  const codeSite = texte(c.codeSite, 20).toUpperCase();
  const poste = texte(c.poste, 30).toUpperCase();
  const date = texte(c.date, 10);
  const heure = texte(c.heure, 5);
  if (
    !codeSite ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^\d{2}:\d{2}$/.test(heure)
  )
    return null;
  return { codeSite, poste, date, heure };
}

// ------------------------------------------------------- réglage par site (K7)

/**
 * Domaine `konnect.file-attente`, réglé par le centre, lu par Konnect :
 * `{ sites: { [codeSite]: { placeTenue, caracteristique } } }`.
 *
 * Place tenue : Konnect crée le RDV dans Xplore au moment du SMS, avec la
 * caractéristique d'attente du site (`ATT` à Cognac), et la retire à la
 * confirmation. Un site absent ou décoché : la place est seulement affiliée, aucun
 * RDV n'est pris. Avant de cocher : vérifier que l'outil SMS du centre ignore un RDV
 * qui porte cette caractéristique.
 */
export const DOMAINE_FILE_ATTENTE = "konnect.file-attente";

export type ReglageSite = { placeTenue: boolean; caracteristique: string };
export type ReglageFileAttente = { sites: Record<string, ReglageSite> };

const CODE = /^[A-Z0-9+#/_-]{1,20}$/;

export function validerReglageFileAttente(
  brut: unknown,
): { valeur: ReglageFileAttente } | { erreur: string } {
  const sitesBruts = (brut as any)?.sites ?? {};
  if (typeof sitesBruts !== "object" || Array.isArray(sitesBruts)) {
    return { erreur: "`sites` doit être un objet, un réglage par code site." };
  }
  const sites: Record<string, ReglageSite> = {};
  for (const [cleBrute, r] of Object.entries(
    sitesBruts as Record<string, any>,
  )) {
    const codeSite = cleBrute.trim().toUpperCase();
    if (!CODE.test(codeSite)) {
      return { erreur: `Le code site « ${cleBrute} » n'est pas valable.` };
    }
    const placeTenue = r?.placeTenue === true;
    const caracteristique =
      typeof r?.caracteristique === "string"
        ? r.caracteristique.trim().toUpperCase()
        : "";
    if (placeTenue && !CODE.test(caracteristique)) {
      return {
        erreur: `Site ${codeSite} : indiquez le code de la caractéristique « liste d'attente » de votre logiciel (par exemple ATT).`,
      };
    }
    sites[codeSite] = { placeTenue, caracteristique };
  }
  return { valeur: { sites } };
}
