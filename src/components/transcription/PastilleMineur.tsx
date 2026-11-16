import Pastille, { TONS } from "@/components/shared/Pastille";

/*
  « MINEUR » sur l'appel d'un patient de moins de 18 ans. `stats.patient_mineur` est
  calcule par LyraeTalk sur la date de naissance retenue, meme quand l'appel s'arrete a
  l'identification. Seul `true` s'affiche : `null` (on ne sait pas) et les appels d'avant
  le 08/10/2026, qui n'ont pas le champ, n'affichent rien.
*/
export function estPatientMineur(stats: unknown): boolean {
  return (stats as { patient_mineur?: unknown } | null | undefined)?.patient_mineur === true;
}

export default function PastilleMineur({ stats }: { stats: unknown }) {
  if (!estPatientMineur(stats)) return null;
  // Pleine, comme toute alerte (`TONS.mineur`, 5,2:1 ; l'ancien orange faisait 3,6:1).
  return <Pastille libelle="MINEUR" ton={TONS.mineur} />;
}
