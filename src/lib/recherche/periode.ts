import {
  endOfDay,
  endOfWeek,
  setHours,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subWeeks,
} from "date-fns";
import type { DateRange } from "@/components/DateRangePicker";

/**
 * Une valeur de période lue par la recherche (`VALEURS_PERIODE` de `moteur.ts`), en plage
 * de dates pour les écrans qui filtrent par `DateRange`.
 *
 * Les jours nommés (« vendredi ») désignent le dernier passé, aujourd'hui compris : la
 * barre cherche dans ce qui a eu lieu (appels, statistiques), jamais dans l'agenda.
 * « Dernier mois » vaut les 30 derniers jours, comme la pastille « 30 derniers jours »
 * des écrans, qui s'allume alors d'elle-même.
 *
 * `null` pour une valeur inconnue : l'écran garde sa période par défaut.
 */
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const LUNDI = { weekStartsOn: 1 as const };

export function plageDePeriode(periode: string | undefined, maintenant = new Date()): DateRange | null {
  if (!periode) return null;
  const jour = (d: Date): DateRange => ({ from: startOfDay(d), to: endOfDay(d) });

  switch (periode) {
    case "aujourd_hui":
      return jour(maintenant);
    case "hier":
      return jour(subDays(maintenant, 1));
    case "avant_hier":
      return jour(subDays(maintenant, 2));
    case "ce_matin":
      return { from: startOfDay(maintenant), to: setHours(startOfDay(maintenant), 12) };
    case "cet_apres_midi":
      return { from: setHours(startOfDay(maintenant), 12), to: endOfDay(maintenant) };
    case "cette_semaine":
      return { from: startOfWeek(maintenant, LUNDI), to: endOfDay(maintenant) };
    case "semaine_derniere": {
      const d = subWeeks(maintenant, 1);
      return { from: startOfWeek(d, LUNDI), to: endOfWeek(d, LUNDI) };
    }
    case "ce_mois":
      return { from: startOfMonth(maintenant), to: endOfDay(maintenant) };
    case "dernier_mois":
      return { from: startOfDay(subDays(maintenant, 29)), to: endOfDay(maintenant) };
  }

  const j = JOURS.indexOf(periode);
  if (j >= 0) return jour(subDays(maintenant, (maintenant.getDay() - j + 7) % 7));

  const m = periode.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    const an = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : maintenant.getFullYear();
    const d = new Date(an, Number(m[2]) - 1, Number(m[1]));
    // Sans année, une date à venir désigne celle de l'an dernier.
    if (!m[3] && d > maintenant) d.setFullYear(an - 1);
    if (d.getDate() === Number(m[1])) return jour(d);
  }
  return null;
}
