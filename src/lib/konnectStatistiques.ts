/**
 * Statistiques de Konnect : calculs partagés entre la route `/api/konnect-statistiques` et
 * l'écran du centre (plan workspace `2026-11-statistiques-konnect.md`, lot 2).
 *
 * La donnée vient de `KonnectStatJour` : des comptes par jour (jours de Paris) que Konnect
 * remonte toutes les 10 minutes, aujourd'hui compris (C-STAT.1 à C-STAT.3). Aucune donnée
 * patient.
 */

export type LigneJour = { jour: string; cle: string; valeur: number };

/** Jours de `weeklyHours` (Talk), dans l'ordre lundi → dimanche. */
export const JOURS_SEMAINE = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

type Plage = { start?: string; end?: string };
type Jour = { enabled?: boolean; ranges?: Plage[] };
export type SemaineHoraires = Partial<
  Record<(typeof JOURS_SEMAINE)[number], Jour>
>;

/** Horaires par défaut quand le centre n'en a pas : du lundi au vendredi, 8 h à 18 h
 *  (décision d'Enzo du 14/11/2026). */
export const OUVERTURE_DEFAUT = { debut: 8, fin: 18 };

/** 7 × 24, vrai pour une heure d'ouverture. */
export type Ouverture = boolean[][];

export function ouvertureParDefaut(): Ouverture {
  return Array.from({ length: 7 }, (_, j) =>
    Array.from(
      { length: 24 },
      (_, h) =>
        j < 5 && h >= OUVERTURE_DEFAUT.debut && h < OUVERTURE_DEFAUT.fin,
    ),
  );
}

function minutes(hhmm: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? "").trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v <= 24 * 60 ? v : null;
}

/**
 * Les horaires de Talk en heures pleines : une heure est ouverte si le centre l'est au
 * moins la moitié de l'heure. Konnect ne remonte l'heure de réservation qu'au grain de
 * l'heure ; 8 h 30 compte donc comme fermé de 8 h à 9 h. `null` si rien d'exploitable.
 */
export function ouvertureDepuisSemaine(semaine: unknown): Ouverture | null {
  if (!semaine || typeof semaine !== "object") return null;
  const s = semaine as SemaineHoraires;
  let utile = false;
  const grille = JOURS_SEMAINE.map((nom) => {
    const jour = s[nom];
    const plages = jour?.enabled ? (jour.ranges ?? []) : [];
    return Array.from({ length: 24 }, (_, h) => {
      let couvert = 0;
      for (const p of plages) {
        const a = minutes(p.start);
        const b = minutes(p.end);
        if (a === null || b === null || b <= a) continue;
        utile = true;
        couvert += Math.max(0, Math.min(b, (h + 1) * 60) - Math.max(a, h * 60));
      }
      return couvert >= 30;
    });
  });
  return utile ? grille : null;
}

/** Un code d'examen ou de site tel que Konnect l'écrit dans une clé (C-STAT.2) : tout
 *  caractère hors `[A-Za-z0-9_]` devient `_` (`SCOLO+` donne `SCOLO_`). */
export function cleCode(code: string): string {
  return code.replace(/[^A-Za-z0-9_]/g, "_") || "_vide";
}

/** Jour de la semaine d'une date `AAAA-MM-JJ`, 0 = lundi. */
export function jourSemaine(jour: string): number {
  const [a, m, j] = jour.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return (d.getUTCDay() + 6) % 7;
}

/** Somme des valeurs par clé, sur les jours [depuis, jusqu'à] inclus. */
export function sommer(
  lignes: LigneJour[],
  depuis: string,
  jusqua: string,
): Record<string, number> {
  const t: Record<string, number> = {};
  for (const l of lignes) {
    if (l.jour < depuis || l.jour > jusqua) continue;
    t[l.cle] = (t[l.cle] ?? 0) + l.valeur;
  }
  return t;
}

/** Les clés d'un préfixe (`rdv_type.`), suffixe → total, du plus grand au plus petit. */
export function parPrefixe(
  totaux: Record<string, number>,
  prefixe: string,
): [string, number][] {
  return Object.entries(totaux)
    .filter(([c, v]) => c.startsWith(prefixe) && v > 0)
    .map(([c, v]) => [c.slice(prefixe.length), v] as [string, number])
    .sort((a, b) => b[1] - a[1]);
}

/** RDV pris hors des heures d'ouverture, sur `rdv_heure.HH` et le jour de la semaine. */
export function horsHeures(
  lignes: LigneJour[],
  depuis: string,
  jusqua: string,
  ouvert: Ouverture,
): { hors: number; total: number; matrice: number[][] } {
  const matrice = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  let hors = 0;
  let total = 0;
  for (const l of lignes) {
    if (l.jour < depuis || l.jour > jusqua || !l.cle.startsWith("rdv_heure."))
      continue;
    const h = Number(l.cle.slice("rdv_heure.".length));
    if (!Number.isInteger(h) || h < 0 || h > 23) continue;
    const j = jourSemaine(l.jour);
    matrice[j][h] += l.valeur;
    total += l.valeur;
    if (!ouvert[j]?.[h]) hors += l.valeur;
  }
  return { hors, total, matrice };
}

/** Tranches remontées par Konnect, dans l'ordre d'affichage. */
export const TRANCHES_DELAI: {
  cle: string;
  libelle: string;
  milieu: number;
}[] = [
  { cle: "0_2", libelle: "0 à 2 jours", milieu: 1 },
  { cle: "3_7", libelle: "3 à 7 jours", milieu: 5 },
  { cle: "8_14", libelle: "8 à 14 jours", milieu: 11 },
  { cle: "15_30", libelle: "15 à 30 jours", milieu: 22 },
  { cle: "31_plus", libelle: "Plus de 30 jours", milieu: 45 },
];

export const TRANCHES_DUREE: { cle: string; libelle: string }[] = [
  { cle: "0_5", libelle: "moins de 5 min" },
  { cle: "5_10", libelle: "5 à 10 min" },
  { cle: "10_20", libelle: "10 à 20 min" },
  { cle: "20_60", libelle: "20 min à 1 h" },
  { cle: "60_plus", libelle: "plus d'1 h" },
];

/** La tranche qui contient la médiane, ou `null` sans donnée. */
export function trancheMediane<T extends { cle: string }>(
  totaux: Record<string, number>,
  prefixe: string,
  tranches: T[],
): T | null {
  const n = tranches.map((t) => totaux[`${prefixe}${t.cle}`] ?? 0);
  const total = n.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  let cumul = 0;
  for (let i = 0; i < tranches.length; i++) {
    cumul += n[i];
    if (cumul >= total / 2) return tranches[i];
  }
  return tranches[tranches.length - 1];
}

/** Durée d'un appel de prise de RDV évité par un RDV pris en ligne (minutes). Hypothèse
 *  affichée telle quelle au centre, à affiner avec la durée réelle des appels de Talk. */
export const MINUTES_PAR_APPEL_EVITE = 4;

export function dureeLisible(minutesTotal: number): string {
  const h = Math.floor(minutesTotal / 60);
  const m = Math.round(minutesTotal % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** Motifs de passage au secrétariat (`sortie.<motif>`), libellés pour le centre. */
export const MOTIFS_SECRETARIAT: Record<string, string> = {
  orientation: "L'examen se prend avec le secrétariat",
  examen_non_mappe: "Examen introuvable dans votre catalogue",
  multi_examen: "Plusieurs examens sur l'ordonnance",
  homonyme: "Doute sur l'identité du patient",
  blocage_clinique: "Une réponse au questionnaire demande votre avis",
  relecture_invalidee: "Ordonnance à relire",
  sans_motif: "Autre raison",
};

export const JOURS_COURTS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
