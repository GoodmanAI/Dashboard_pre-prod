/**
 * Les salles d'un centre, et les règles qui s'y appliquent.
 * -----------------------------------------------------------------------------
 * Module PUR : pas de React, pas de base. Importable depuis une route comme depuis
 * un écran. La lecture en base vit dans `sallesExamenLecture.ts`.
 *
 * Chantier `plans/2026-10-filtrage-creneaux-par-salle.md` (06/10/2026). Trois données,
 * trois propriétaires :
 *
 *   | Donnée                        | Où                         | Qui la règle |
 *   |-------------------------------|----------------------------|--------------|
 *   | `sallesParType`               | `ProductConfig` talk.site  | l'admin      |
 *   | `postes` d'un examen          | `TalkSettings.exams[i]`    | le centre    |
 *   | `prioriteSalles` d'une paire  | `TalkSettings.options`     | le centre    |
 *
 * ── LA CLÉ DE LA SALLE ───────────────────────────────────────────────────────
 * C'est le `numeroPoste` d'Xplore, la seule donnée présente dans un créneau. Il est
 * comparé APRÈS normalisation (espaces retirés, majuscules), comme le fait déjà
 * `postesByType` des relances. Le robot normalise de la même façon le poste du
 * créneau : une casse différente ne doit jamais vider les créneaux.
 *
 * ── UNE SALLE RETIRÉE DE LA DÉCLARATION EST IGNORÉE À LA LECTURE ─────────────
 * Les `postes` d'un examen et la priorité d'une paire ne sont jamais réécrits quand
 * l'admin retire une salle : ils sont réduits à la lecture, à l'intersection avec ce
 * qui est déclaré (décision D7). Un filtre fantôme, qui viderait les créneaux d'un
 * examen sur un code que plus personne ne voit à l'écran, est impossible.
 */

import { codeCanonique, EXAM_TYPES, type ExamType } from "@/lib/examTypes";

export type Salle = { poste: string; libelle: string };
export type SallesParType = Partial<Record<ExamType, Salle[]>>;
/** Clé = clé robot de la paire (`RX+RX`, `MG+USMAM`…), valeur = postes dans l'ordre. */
export type PrioriteSalles = Record<string, string[]>;

export const LIBELLE_SALLE_MAX = 40;

const EST_TYPE = new Set<string>(EXAM_TYPES);

/** `" chkrx2 "` → `"CHKRX2"`. Chaîne vide pour tout ce qui n'est pas un texte. */
export function normaliserPoste(v: unknown): string {
  return typeof v === "string" ? v.trim().toUpperCase() : "";
}

/**
 * Le type dont un examen prend les salles.
 *
 * Le code canonique, sauf l'écho mammaire : le référentiel la range sous `USMAM`,
 * qui n'est pas une modalité côté robot (`rdv.internal_type` vaut `US`, et `USMAM`
 * n'existe que comme clé de paire dans `getPairKey`). Elle se fait sur un échographe :
 * elle prend les salles d'échographie.
 */
export function typePourSalles(typeExamen: unknown): ExamType | null {
  if (typeof typeExamen !== "string") return null;
  const t = typeExamen.trim().toUpperCase();
  if (t === "USMAM") return "US";
  return codeCanonique({ examCode: t });
}

/** Les salles déclarées pour le type d'un examen, dans l'ordre de la déclaration. */
export function sallesDuType(salles: SallesParType, typeExamen: unknown): Salle[] {
  const type = typePourSalles(typeExamen);
  return type ? (salles[type] ?? []) : [];
}

/**
 * Lecture tolérante d'un `sallesParType` stocké : ce qui est mal formé est ignoré,
 * jamais levé. Sert à la LECTURE (routes, robot, écrans). L'écriture passe par
 * `validerSallesParType`, qui, elle, refuse.
 */
export function lireSallesParType(brut: unknown): SallesParType {
  const sortie: SallesParType = {};
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return sortie;
  for (const [cle, liste] of Object.entries(brut as Record<string, unknown>)) {
    const type = cle.trim().toUpperCase();
    if (!EST_TYPE.has(type) || !Array.isArray(liste)) continue;
    const vus = new Set<string>();
    const salles: Salle[] = [];
    for (const s of liste) {
      const poste = normaliserPoste((s as any)?.poste);
      const libelle =
        typeof (s as any)?.libelle === "string" ? (s as any).libelle.trim() : "";
      if (!poste || !libelle || vus.has(poste)) continue;
      vus.add(poste);
      salles.push({ poste, libelle });
    }
    if (salles.length > 0) sortie[type as ExamType] = salles;
  }
  return sortie;
}

/**
 * Validation à l'écriture, depuis l'écran d'administration (`talk-config`).
 *
 * Rend la valeur normalisée (postes en majuscules, libellés sans espaces autour), ou
 * un message qui dit quoi corriger. Un type sans salle est retiré plutôt que gardé
 * vide : « aucune salle » et « type absent » veulent dire la même chose, aucun filtre.
 */
export function validerSallesParType(
  brut: unknown
): { valeur: SallesParType } | { erreur: string } {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) {
    return {
      erreur:
        "Salles par type : la valeur doit être un objet, par exemple { \"RX\": [{ \"poste\": \"CHKRX2\", \"libelle\": \"R2\" }] }.",
    };
  }
  const sortie: SallesParType = {};
  for (const [cle, liste] of Object.entries(brut as Record<string, unknown>)) {
    const type = cle.trim().toUpperCase();
    if (!EST_TYPE.has(type)) {
      return {
        erreur: `Salles par type : « ${cle} » n'est pas un type d'examen connu. Utilisez ${EXAM_TYPES.join(", ")}.`,
      };
    }
    if (sortie[type as ExamType]) {
      return { erreur: `Salles par type : le type ${type} apparaît deux fois.` };
    }
    if (!Array.isArray(liste)) {
      return {
        erreur: `Salles par type : ${type} doit être une liste de salles, entre crochets.`,
      };
    }
    const vus = new Set<string>();
    const salles: Salle[] = [];
    for (let i = 0; i < liste.length; i++) {
      const s = liste[i] as any;
      const ou = `${type}, salle ${i + 1}`;
      const poste = normaliserPoste(s?.poste);
      if (!poste) {
        return {
          erreur: `Salles par type (${ou}) : le code du poste est vide. Recopiez le numéro de poste du logiciel de gestion.`,
        };
      }
      if (vus.has(poste)) {
        return {
          erreur: `Salles par type (${type}) : le poste ${poste} est déclaré deux fois. Gardez-en un seul.`,
        };
      }
      const libelle = typeof s?.libelle === "string" ? s.libelle.trim() : "";
      if (!libelle) {
        return {
          erreur: `Salles par type (${ou}) : le nom affiché de ${poste} est vide. Donnez le nom que le centre emploie, par exemple « R2 ».`,
        };
      }
      if (libelle.length > LIBELLE_SALLE_MAX) {
        return {
          erreur: `Salles par type (${ou}) : le nom de ${poste} dépasse ${LIBELLE_SALLE_MAX} caractères. Raccourcissez-le.`,
        };
      }
      vus.add(poste);
      salles.push({ poste, libelle });
    }
    if (salles.length > 0) sortie[type as ExamType] = salles;
  }
  return { valeur: sortie };
}

/**
 * Les `postes` d'un examen réduits à ce qui est déclaré pour son type, dans l'ordre
 * de la déclaration. `[]` = aucun filtre. C'est ce que lit le robot.
 */
export function postesValides(
  postes: unknown,
  salles: SallesParType,
  typeExamen: unknown
): string[] {
  if (!Array.isArray(postes) || postes.length === 0) return [];
  const choisis = new Set(postes.map(normaliserPoste).filter(Boolean));
  return sallesDuType(salles, typeExamen)
    .map((s) => s.poste)
    .filter((p) => choisis.has(p));
}

/**
 * Normalise les `postes` envoyés pour un examen, à l'écriture.
 *
 * Un poste non déclaré pour le type est refusé, SAUF s'il était déjà enregistré sur
 * cet examen : c'est une salle que l'admin a retirée depuis, et la lecture l'ignore
 * déjà (D7). La refuser bloquerait l'enregistrement d'un écran qui ne la montre
 * même plus, ou l'import d'un pack relu tel quel ; on la retire sans bruit.
 */
export function normaliserPostesEcrits(
  brut: unknown,
  anciens: unknown,
  salles: SallesParType,
  typeExamen: unknown
): { postes: string[] } | { inconnus: string[] } {
  if (brut === null || brut === undefined) return { postes: [] };
  if (!Array.isArray(brut)) return { inconnus: [String(brut)] };
  const declares = new Set(sallesDuType(salles, typeExamen).map((s) => s.poste));
  const dejaLa = new Set(
    Array.isArray(anciens) ? anciens.map(normaliserPoste).filter(Boolean) : []
  );
  const postes: string[] = [];
  const inconnus: string[] = [];
  for (const p of brut) {
    const poste = normaliserPoste(p);
    if (!poste || postes.includes(poste)) continue;
    if (declares.has(poste)) postes.push(poste);
    else if (!dejaLa.has(poste)) inconnus.push(poste);
  }
  return inconnus.length > 0 ? { inconnus } : { postes };
}

// ── Les paires de double examen ──────────────────────────────────────────────

/**
 * Le code robot de chaque mot des clés `multiExamMapping` (`radio_radio`…).
 * `echomammaire` n'existe que dans une paire, avec la mammographie.
 */
export const CODE_DOUBLE_EXAMEN: Record<string, string> = {
  radio: "RX",
  echographie: "US",
  mammographie: "MG",
  scanner: "CT",
  irm: "MR",
  echomammaire: "USMAM",
};

/**
 * La clé de paire telle que LyraeTalk la calcule (`getPairKey`,
 * `doubleBookingHelper.js`) : les deux codes triés par ordre alphabétique. Le cas
 * de l'écho mammaire (`MG+USMAM`) tombe juste avec ce tri, `MG` précédant `USMAM`.
 */
export function clePaireRobot(codeA: string, codeB: string): string {
  return [codeA, codeB].sort().join("+");
}

/** `radio_irm` → `MR+RX`. `null` si la clé du Dashboard n'est pas reconnue. */
export function clePaireRobotDepuisDashboard(cleDashboard: string): string | null {
  const [a, b] = cleDashboard.split("_");
  const codeA = CODE_DOUBLE_EXAMEN[a];
  const codeB = CODE_DOUBLE_EXAMEN[b];
  return codeA && codeB ? clePaireRobot(codeA, codeB) : null;
}

/** Les treize clés robot acceptées dans `prioriteSalles`. */
export const CLES_PAIRES_ROBOT: readonly string[] = [
  "RX+RX",
  "US+US",
  "RX+US",
  "MG+US",
  "MG+RX",
  "MG+USMAM",
  "CT+US",
  "CT+RX",
  "CT+MG",
  "MR+US",
  "MR+RX",
  "MG+MR",
  "CT+MR",
];

/**
 * Les salles d'une paire : celles du premier type, puis celles du second qui n'y
 * sont pas déjà. Une paire `RX+RX` a donc les salles de radio une seule fois.
 */
export function sallesDeLaPaire(salles: SallesParType, clePaire: string): Salle[] {
  const sortie: Salle[] = [];
  for (const code of clePaire.split("+")) {
    for (const s of sallesDuType(salles, code)) {
      if (!sortie.some((x) => x.poste === s.poste)) sortie.push(s);
    }
  }
  return sortie;
}

/**
 * Lecture de `options.prioriteSalles` : chaque liste réduite aux salles déclarées
 * pour la paire, une paire vidée disparaît. Ce que lisent le robot et l'écran.
 */
export function lirePrioriteSalles(brut: unknown, salles: SallesParType): PrioriteSalles {
  const sortie: PrioriteSalles = {};
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return sortie;
  for (const [cle, liste] of Object.entries(brut as Record<string, unknown>)) {
    if (!CLES_PAIRES_ROBOT.includes(cle) || !Array.isArray(liste)) continue;
    const declares = new Set(sallesDeLaPaire(salles, cle).map((s) => s.poste));
    const postes: string[] = [];
    for (const p of liste) {
      const poste = normaliserPoste(p);
      if (poste && declares.has(poste) && !postes.includes(poste)) postes.push(poste);
    }
    if (postes.length > 0) sortie[cle] = postes;
  }
  return sortie;
}

/**
 * Validation à l'écriture de `options.prioriteSalles`.
 *
 * Même tolérance que pour les `postes` d'un examen : un poste qui n'est plus déclaré
 * mais était déjà enregistré pour cette paire est retiré sans bruit ; un poste
 * nouveau et inconnu est refusé.
 */
export function validerPrioriteSalles(
  brut: unknown,
  ancienne: unknown,
  salles: SallesParType
): { valeur: PrioriteSalles } | { erreur: string } {
  if (brut === null || brut === undefined) return { valeur: {} };
  if (typeof brut !== "object" || Array.isArray(brut)) {
    return { erreur: "La priorité des salles doit être un objet, une liste par paire d'examens." };
  }
  const anciennes =
    ancienne && typeof ancienne === "object" && !Array.isArray(ancienne)
      ? (ancienne as Record<string, unknown>)
      : {};
  const sortie: PrioriteSalles = {};
  for (const [cle, liste] of Object.entries(brut as Record<string, unknown>)) {
    if (!CLES_PAIRES_ROBOT.includes(cle)) {
      return { erreur: `Priorité des salles : la paire « ${cle} » n'existe pas.` };
    }
    if (!Array.isArray(liste)) {
      return { erreur: `Priorité des salles (${cle}) : une liste de salles est attendue.` };
    }
    const declares = new Set(sallesDeLaPaire(salles, cle).map((s) => s.poste));
    const dejaLa = new Set(
      Array.isArray(anciennes[cle])
        ? (anciennes[cle] as unknown[]).map(normaliserPoste).filter(Boolean)
        : []
    );
    const postes: string[] = [];
    const inconnus: string[] = [];
    for (const p of liste) {
      const poste = normaliserPoste(p);
      if (!poste || postes.includes(poste)) continue;
      if (declares.has(poste)) postes.push(poste);
      else if (!dejaLa.has(poste)) inconnus.push(poste);
    }
    if (inconnus.length > 0) {
      return {
        erreur: `Priorité des salles (${cle}) : ${inconnus.join(", ")} ${
          inconnus.length > 1 ? "ne sont pas des salles déclarées" : "n'est pas une salle déclarée"
        } pour ces examens. Retirez-${inconnus.length > 1 ? "les" : "la"} de la liste, ou demandez à Lyrae de ${
          inconnus.length > 1 ? "les" : "la"
        } déclarer.`,
      };
    }
    if (postes.length > 0) sortie[cle] = postes;
  }
  return { valeur: sortie };
}

// ── Les salles imposées (exceptions) ─────────────────────────────────────────

/**
 * Une salle imposée à un examen : `options.exceptionsSalles` (07/10/2026).
 *
 * Elle passe devant toutes les autres règles. Chez Pontivy, R5 ne sert qu'à la
 * panoramique dentaire : la pano est toujours en R5, et demandée avec un autre
 * examen elle fait l'objet d'un rendez-vous à part, quel que soit le mode de la
 * paire, sans priorité de salle. Ce comportement est celui du ROBOT ; le Dashboard
 * ne fait que stocker `{ codeExamen, poste }`, forme arrêtée côté LyraeTalk.
 *
 * `codeExamen` est le code NEURACORP, la clé de `TalkSettings.exams`.
 */
export type ExceptionSalle = { codeExamen: string; poste: string };

/** Ce qu'il faut savoir d'un examen du centre pour valider une exception. */
export type ExamenDuCentre = { codeExamen: string; typeExamen: string; libelle: string };

/**
 * Les examens enregistrés d'un centre (`TalkSettings.exams`), sous leurs deux formes
 * historiques : tableau, ou objet indexé par code (lue aussi par `get/mapping`).
 * Le libellé est celui de la correspondance : celui du centre s'il en a saisi un.
 */
export function examensDuCentre(exams: unknown): ExamenDuCentre[] {
  const brut =
    typeof exams === "string"
      ? (() => {
          try {
            return JSON.parse(exams);
          } catch {
            return null;
          }
        })()
      : exams;
  const lignes: [string, any][] = Array.isArray(brut)
    ? brut.map((e: any) => [e?.codeExamen, e])
    : brut && typeof brut === "object"
      ? Object.entries(brut as Record<string, any>)
      : [];
  const sortie: ExamenDuCentre[] = [];
  const vus = new Set<string>();
  for (const [code, e] of lignes) {
    const codeExamen = typeof code === "string" ? code.trim() : "";
    if (!codeExamen || vus.has(codeExamen)) continue;
    vus.add(codeExamen);
    const libelleClient = typeof e?.libelleClient === "string" ? e.libelleClient.trim() : "";
    const libelle = typeof e?.libelle === "string" ? e.libelle.trim() : "";
    sortie.push({
      codeExamen,
      typeExamen: typeof e?.typeExamen === "string" ? e.typeExamen : "",
      libelle: libelleClient || libelle || codeExamen,
    });
  }
  return sortie;
}

/** Une exception est-elle encore valable : examen connu, salle déclarée pour son type ? */
function exceptionValable(
  codeExamen: string,
  poste: string,
  examens: Map<string, ExamenDuCentre>,
  salles: SallesParType
): boolean {
  const examen = examens.get(codeExamen);
  if (!examen) return false;
  return sallesDuType(salles, examen.typeExamen).some((s) => s.poste === poste);
}

function indexer(examens: readonly ExamenDuCentre[]): Map<string, ExamenDuCentre> {
  return new Map(examens.map((e) => [e.codeExamen, e]));
}

/**
 * Lecture de `options.exceptionsSalles` : ne garde que les exceptions dont l'examen
 * existe encore et dont la salle est encore déclarée pour son type, une par examen
 * (la première). Ce que lisent le robot et les écrans.
 */
export function lireExceptionsSalles(
  brut: unknown,
  examens: readonly ExamenDuCentre[],
  salles: SallesParType
): ExceptionSalle[] {
  if (!Array.isArray(brut)) return [];
  const index = indexer(examens);
  const sortie: ExceptionSalle[] = [];
  for (const e of brut) {
    const codeExamen = typeof (e as any)?.codeExamen === "string" ? (e as any).codeExamen.trim() : "";
    const poste = normaliserPoste((e as any)?.poste);
    if (!codeExamen || !poste || sortie.some((x) => x.codeExamen === codeExamen)) continue;
    if (exceptionValable(codeExamen, poste, index, salles)) sortie.push({ codeExamen, poste });
  }
  return sortie;
}

/**
 * Validation à l'écriture de `options.exceptionsSalles`.
 *
 * Même tolérance que `validerPrioriteSalles` : une exception qui n'est plus valable
 * (examen retiré, salle retirée par l'admin) mais était déjà enregistrée telle quelle
 * est retirée sans bruit ; une exception nouvelle et invalide est refusée. Deux
 * exceptions pour le même examen sont toujours refusées : il n'y a qu'une salle
 * imposée par examen.
 */
export function validerExceptionsSalles(
  brut: unknown,
  ancienne: unknown,
  examens: readonly ExamenDuCentre[],
  salles: SallesParType
): { valeur: ExceptionSalle[] } | { erreur: string } {
  if (brut === null || brut === undefined) return { valeur: [] };
  if (!Array.isArray(brut)) {
    return { erreur: "Les salles imposées doivent être une liste, une ligne par examen." };
  }
  const index = indexer(examens);
  const dejaLa = new Set(
    Array.isArray(ancienne)
      ? ancienne.map(
          (e: any) =>
            `${typeof e?.codeExamen === "string" ? e.codeExamen.trim() : ""}|${normaliserPoste(e?.poste)}`
        )
      : []
  );
  const sortie: ExceptionSalle[] = [];
  const vus = new Set<string>();
  for (let i = 0; i < brut.length; i++) {
    const e = brut[i] as any;
    const codeExamen = typeof e?.codeExamen === "string" ? e.codeExamen.trim() : "";
    const poste = normaliserPoste(e?.poste);
    if (!codeExamen || !poste) {
      return {
        erreur: `Salle imposée, ligne ${i + 1} : choisissez un examen et une salle, ou retirez la ligne.`,
      };
    }
    const nom = index.get(codeExamen)?.libelle ?? codeExamen;
    if (vus.has(codeExamen)) {
      return {
        erreur: `Salle imposée : « ${nom} » a deux lignes. Un examen n'a qu'une salle imposée, gardez-en une.`,
      };
    }
    vus.add(codeExamen);
    if (exceptionValable(codeExamen, poste, index, salles)) {
      sortie.push({ codeExamen, poste });
      continue;
    }
    if (dejaLa.has(`${codeExamen}|${poste}`)) continue;
    return {
      erreur: index.has(codeExamen)
        ? `Salle imposée : ${poste} n'est pas une salle déclarée pour « ${nom} ». Choisissez une salle de la liste, ou demandez à Lyrae de la déclarer.`
        : `Salle imposée : l'examen ${codeExamen} n'est pas dans la correspondance des examens du centre. Choisissez un examen de la liste.`,
    };
  }
  return { valeur: sortie };
}
