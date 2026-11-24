import { debutDuJour } from "@/pilot/lib/dates";

function date(valeur: unknown): Date | null {
  if (!(valeur instanceof Date) && typeof valeur !== "string") return null;
  const resultat = new Date(valeur);
  return Number.isFinite(resultat.getTime()) ? resultat : null;
}
function dateDuJournal(valeur: unknown) {
  return valeur && typeof valeur === "object" && "datePromise" in valeur ? date(valeur.datePromise) : null;
}

/** Le journal est fourni dans l'ordre chronologique. Jours civils UTC, comme les formulaires. */
export function glissement({ datePromise, datePromiseInitiale, evenements }: {
  datePromise: Date | string | null; datePromiseInitiale: Date | string | null;
  evenements: Array<{ avant: unknown; apres: unknown }>;
}) {
  const avant = evenements.map((e) => dateDuJournal(e.avant)).filter((d): d is Date => d !== null);
  const initiale = date(datePromiseInitiale) ?? avant[0] ?? evenements.map((e) => dateDuJournal(e.apres)).find((d) => d !== null);
  const actuelle = date(datePromise);
  const joursCumules = initiale && actuelle ? (debutDuJour(actuelle).getTime() - debutDuJour(initiale).getTime()) / 86400000 : 0;
  const reports = avant.length;
  return { reports, joursCumules, alerte: reports > 2 || joursCumules > 30 };
}
