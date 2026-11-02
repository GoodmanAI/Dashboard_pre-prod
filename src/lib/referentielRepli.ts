/**
 * Complétion d'un mapping par le référentiel, et repli d'un examen ajouté sur ses
 * parents (`repliSur`, 02/11/2026, plan `plans/2026-11-ajout-examen-au-referentiel.md`).
 *
 * Module PUR : aucune base, aucun réseau. Les routes lisent le référentiel
 * (`referentielEnBase()`), puis passent ici. C'est ce qui permet de le vérifier hors
 * de toute base (`scripts/verif-referentiel-repli.ts`).
 *
 * LE PROBLÈME. Un examen ajouté au référentiel (premier cas : `N01MR141`, IRM du rachis
 * dorso-lombaire) arrive chez un centre déjà configuré **non pratiqué** et sans code
 * RIS. Or la phrase du patient qui y mène était hier captée par un examen voisin
 * (l'IRM lombaire) que le centre réservait. Sans repli, le centre transférerait ce
 * qu'il réservait la veille.
 *
 * LA RÈGLE (décision 4 du 02/11). Tant que la ligne n'est pas paramétrée par le centre,
 * elle **suit son premier parent qui a un code RIS** : code RIS, code injecté, type
 * client, salles, et les questions si elle n'en a pas. Jamais le libellé client, jamais
 * `performed` : la case reste celle du centre, et le robot (`V2_REPLI_PARENT`) remplace
 * de lui-même un examen non réservable par son parent.
 *
 * « Non paramétrée » veut dire : ajoutée à la lecture (absente du mapping enregistré),
 * ou enregistrée **non pratiquée et sans code RIS**. Ce second cas est celui d'une ligne
 * que l'écran Questions examens a écrite sans que le centre l'ait jamais réglée.
 *
 * `repliSur` est posé sur **toutes** les lignes servies, tableau vide sinon. Il vient
 * du référentiel, jamais du centre : il n'a pas à être enregistré, il est recalculé à
 * chaque lecture.
 */

/** Une ligne de la nomenclature, telle que la table ou le blob la fournissent. */
export type LigneNomenclature = {
  codeExamen: string;
  typeExamen?: string | null;
  libelle?: string | null;
  /** Parents, dans l'ordre de préférence. Vide pour un examen sans repli. */
  repliSur?: string[];
  /** Colonnes du blob seulement (repli quand la table est vide). */
  Synonymes?: unknown;
  Interrogatoire?: unknown;
  Commentaire?: unknown;
  performed?: unknown;
};

type Ligne = Record<string, any>;

function texte(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

/**
 * Une liste de chaînes, qu'elle soit stockée en tableau ou en texte.
 *
 * Reprise de l'ancien `parseInterrogatoire` de `get/mapping` : certaines lignes
 * historiques portent un littéral de tableau JavaScript (guillemets simples), que
 * `JSON.parse` refuse. On tente JSON d'abord, le littéral ensuite.
 */
export function lireListe(value: unknown): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const v = JSON.parse(value);
    if (Array.isArray(v)) return v;
  } catch {
    // Pas du JSON : on tente le littéral ci-dessous.
  }
  try {
    const v = Function('"use strict"; return (' + value + ")")();
    return Array.isArray(v) ? v : [];
  } catch {
    console.error("Liste illisible :", value);
    return [];
  }
}

/** `repliSur` par code, d'après le référentiel. */
function indexRepli(referentiel: LigneNomenclature[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of referentiel) {
    const code = texte(r.codeExamen);
    if (!code) continue;
    const parents = Array.isArray(r.repliSur)
      ? r.repliSur.map(texte).filter((p) => p && p !== code)
      : [];
    m.set(code, parents);
  }
  return m;
}

/**
 * Le premier parent présent chez le centre avec un code RIS.
 *
 * Lu sur l'état **d'avant** l'héritage (`codes`), pour qu'une ligne ne se replie pas
 * sur une autre qui vient elle-même d'hériter : le résultat ne dépend pas de l'ordre.
 */
function premierParent(
  parents: string[],
  codes: Map<string, string>,
): string | null {
  for (const p of parents) if (codes.get(p)) return p;
  return null;
}

/**
 * LyraeTalk : complète `examsMap` (indexé par code NEURACORP, lignes à la forme de
 * `/api/configuration/get/mapping`) avec le référentiel, applique le repli, pose
 * `repliSur`. Modifie la table reçue et la rend.
 *
 * - ligne absente → ajoutée, `performed: false` chez un centre déjà configuré, sinon
 *   le défaut de la nomenclature (`true`) ;
 * - ligne non paramétrée avec un `repliSur` → hérite du premier parent qui a un code
 *   RIS : `codeExamenClient`, `codeExamenClientInject`, `typeExamenClient`, `postes`,
 *   et `Interrogatoire` si le parent en a et la ligne non.
 */
export function completerAvecReferentiel(
  examsMap: Record<string, Ligne>,
  referentiel: LigneNomenclature[],
  options: { centreDejaConfigure: boolean },
): Record<string, Ligne> {
  const repli = indexRepli(referentiel);
  const ajoutees = new Set<string>();

  for (const row of referentiel) {
    const code = texte(row.codeExamen);
    if (!code || examsMap[code]) continue;
    ajoutees.add(code);
    examsMap[code] = {
      typeExamen: texte(row.typeExamen),
      codeExamen: code,
      libelle: texte(row.libelle),
      Synonymes: lireListe(row.Synonymes),
      Interrogatoire: lireListe(row.Interrogatoire),
      Commentaire: texte(row.Commentaire),
      // ⚠️ `false` chez un centre déjà configuré, et c'est une garde : le robot
      // annonce un examen `performed` au patient et tente la réservation. Une ligne
      // venue de la nomenclature n'a jamais été réglée par ce centre.
      performed: options.centreDejaConfigure
        ? false
        : typeof row.performed === "boolean"
          ? row.performed
          : true,
      typeExamenClient: "",
      libelleClient: "",
      codeExamenClient: "",
      codeExamenClientInject: null,
      // Ligne venue de la nomenclature : jamais réglée par ce centre, aucun filtre.
      postes: [],
    };
  }

  const codes = new Map<string, string>(
    Object.entries(examsMap).map(([c, e]) => [c, texte(e?.codeExamenClient)]),
  );

  for (const [code, ligne] of Object.entries(examsMap)) {
    const parents = repli.get(code) ?? [];
    ligne.repliSur = [...parents];
    if (parents.length === 0) continue;

    const nonParametree =
      ajoutees.has(code) ||
      (ligne.performed === false && !texte(ligne.codeExamenClient));
    if (!nonParametree) continue;

    const p = premierParent(parents, codes);
    if (!p) continue;
    const parent = examsMap[p];
    ligne.codeExamenClient = texte(parent.codeExamenClient);
    ligne.codeExamenClientInject = parent.codeExamenClientInject ?? null;
    ligne.typeExamenClient = texte(parent.typeExamenClient);
    ligne.postes = Array.isArray(parent.postes) ? [...parent.postes] : [];
    const questionsParent = lireListe(parent.Interrogatoire);
    if (
      questionsParent.length > 0 &&
      lireListe(ligne.Interrogatoire).length === 0
    ) {
      ligne.Interrogatoire = [...questionsParent];
    }
  }

  return examsMap;
}

/** Une ligne du mapping Konnect, à la forme de `KonnectExamens`. */
export type LigneKonnect = {
  codeExamen: string;
  typeExamen: string | null;
  libelle: string | null;
  codeExamenClient: string;
  codeExamenInjection: string;
  typeExamenClient: string;
  libelleClient: string;
  performed: boolean;
  reservableEnLigne: boolean;
  ordoOblig: boolean;
  examenInjecte: boolean;
  postes: string[];
  fileAttente: boolean;
};

/**
 * Konnect : même règle que Talk, sur les lignes de `KonnectExamens` (02/11/2026).
 *
 * Jusqu'ici le référentiel n'était proposé qu'à un centre vierge : un client Konnect
 * déjà configuré ne voyait jamais un examen ajouté. Les lignes absentes arrivent
 * désormais **non pratiquées**, avec du parent le code RIS, le code injecté, le type
 * client, les salles, « Réservable en ligne » et « Ordonnance obligatoire » ; jamais
 * l'injection ni la file d'attente. Le `PUT` les enregistre quand le client enregistre.
 *
 * Une ligne enregistrée non pratiquée et sans code RIS ne reprend que les colonnes du
 * RIS : ses cases Konnect sont celles du client.
 *
 * Rend un nouveau tableau, lignes enregistrées d'abord, ajoutées ensuite, chacune
 * avec `repliSur`.
 */
export function completerKonnectAvecReferentiel(
  lignes: LigneKonnect[],
  referentiel: LigneNomenclature[],
): Array<LigneKonnect & { repliSur: string[] }> {
  const repli = indexRepli(referentiel);
  const presents = new Set(lignes.map((l) => l.codeExamen));
  const codes = new Map<string, string>(
    lignes.map((l) => [l.codeExamen, texte(l.codeExamenClient)]),
  );
  const parCode = new Map(lignes.map((l) => [l.codeExamen, l]));

  const sortie: Array<LigneKonnect & { repliSur: string[]; ajoutee: boolean }> =
    lignes.map((l) => ({ ...l, repliSur: [], ajoutee: false }));

  for (const row of referentiel) {
    const code = texte(row.codeExamen);
    if (!code || presents.has(code)) continue;
    presents.add(code);
    sortie.push({
      codeExamen: code,
      typeExamen: texte(row.typeExamen) || null,
      libelle: texte(row.libelle) || null,
      codeExamenClient: "",
      codeExamenInjection: "",
      typeExamenClient: "",
      libelleClient: "",
      performed: false,
      // Même défaut que la colonne quand aucun parent ne le donne.
      reservableEnLigne: true,
      ordoOblig: false,
      examenInjecte: false,
      postes: [],
      fileAttente: false,
      repliSur: [],
      ajoutee: true,
    });
  }

  return sortie.map(({ ajoutee, ...l }) => {
    const parents = repli.get(l.codeExamen) ?? [];
    l.repliSur = [...parents];
    if (parents.length === 0) return l;
    const nonParametree =
      ajoutee || (l.performed === false && !texte(l.codeExamenClient));
    if (!nonParametree) return l;
    const p = premierParent(parents, codes);
    if (!p) return l;
    const parent = parCode.get(p)!;
    l.codeExamenClient = texte(parent.codeExamenClient);
    l.codeExamenInjection = texte(parent.codeExamenInjection);
    l.typeExamenClient = texte(parent.typeExamenClient);
    l.postes = Array.isArray(parent.postes) ? [...parent.postes] : [];
    if (ajoutee) {
      l.reservableEnLigne = parent.reservableEnLigne !== false;
      l.ordoOblig = parent.ordoOblig === true;
    }
    return l;
  });
}
